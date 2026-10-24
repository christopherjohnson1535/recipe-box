//! The print treatment ("illustrated plate"): one deterministic look for every recipe photo. Pure pixels in, pixels
//! out; no AI, no I/O. The original photo is never touched, this makes a separate rendition.

use image::{
    RgbImage,
    imageops::{self, FilterType},
};
use uuid::Uuid;

/// Long edge of a rendition; smaller photos are not scaled up.
pub const MAX_EDGE: u32 = 1600;
/// Paper colour `--cream-50` (#fbf8f1, frontend/src/styles/primitives.css) the whites are warmed toward.
const PAPER: [f32; 3] = [251.0, 248.0, 241.0];
/// How far the photo moves toward the paper tint: a hint of warmth, not a colour cast.
const WARMTH: f32 = 0.5;
/// Grain amplitude in levels (plus or minus).
const GRAIN: i32 = 3;
/// Wider than this (width / height) is a landscape plate (4:3); anything else is square.
const LANDSCAPE_RATIO: f32 = 1.15;

/// Stable seed for an image's grain, so the same photo always gets the same plate.
pub fn seed_for(id: Uuid) -> u64 {
    let n = id.as_u128();
    (n as u64) ^ ((n >> 64) as u64)
}

/// Centred crop (4:3 landscape or 1:1), long edge at most [`MAX_EDGE`], gentle S tone curve, warm paper tint and
/// light monochrome grain from `seed`. Same input and seed give the same bytes.
pub fn render_plate(src: &RgbImage, seed: u64) -> RgbImage {
    let (w, h) = src.dimensions();
    let (num, den) = if w as f32 > LANDSCAPE_RATIO * h as f32 {
        (4u64, 3u64)
    } else {
        (1u64, 1u64)
    };
    // Largest centred rectangle with the wanted ratio.
    let (cw, ch) = if u64::from(w) * den > u64::from(h) * num {
        ((u64::from(h) * num / den) as u32, h)
    } else {
        (w, (u64::from(w) * den / num) as u32)
    };
    let (cw, ch) = (cw.max(1), ch.max(1));
    let mut out = imageops::crop_imm(src, (w - cw) / 2, (h - ch) / 2, cw, ch).to_image();
    if cw.max(ch) > MAX_EDGE {
        let scale = MAX_EDGE as f32 / cw.max(ch) as f32;
        let size = |v: u32| ((v as f32 * scale).round() as u32).max(1);
        out = imageops::resize(&out, size(cw), size(ch), FilterType::CatmullRom);
    }

    // Tone curve per level: smoothstep blended with the identity (gentle S), then squeezed into 8..247 so a print
    // never has pure black or white.
    let curve: [f32; 256] = std::array::from_fn(|i| {
        let v = i as f32 / 255.0;
        let s = v * v * (3.0 - 2.0 * v);
        let v = v + 0.4 * (s - v);
        8.0 + 239.0 * v
    });
    let top = PAPER.into_iter().fold(0.0, f32::max);
    let tint = PAPER.map(|p| 1.0 - WARMTH + WARMTH * p / top);
    let mut rng = seed;
    for px in out.pixels_mut() {
        let grain = (splitmix64(&mut rng) % (2 * GRAIN as u64 + 1)) as i32 - GRAIN;
        for c in 0..3 {
            let v = curve[px.0[c] as usize] * tint[c] + grain as f32;
            px.0[c] = v.round().clamp(0.0, 255.0) as u8;
        }
    }
    out
}

/// splitmix64: a tiny seeded generator, enough for grain.
fn splitmix64(state: &mut u64) -> u64 {
    *state = state.wrapping_add(0x9E37_79B9_7F4A_7C15);
    let mut z = *state;
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_95EB);
    z ^ (z >> 31)
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::Rgb;

    fn photo(w: u32, h: u32) -> RgbImage {
        RgbImage::from_fn(w, h, |x, y| Rgb([(x % 256) as u8, (y % 256) as u8, 90]))
    }

    #[test]
    fn same_input_and_seed_give_identical_bytes() {
        let img = photo(300, 200);
        assert_eq!(
            render_plate(&img, 7).as_raw(),
            render_plate(&img, 7).as_raw()
        );
        assert_ne!(
            render_plate(&img, 7).as_raw(),
            render_plate(&img, 8).as_raw()
        );
    }

    #[test]
    fn crops_landscape_to_4_3_and_the_rest_to_square() {
        assert_eq!(render_plate(&photo(1000, 400), 1).dimensions(), (533, 400));
        assert_eq!(render_plate(&photo(400, 1000), 1).dimensions(), (400, 400));
        assert_eq!(render_plate(&photo(500, 500), 1).dimensions(), (500, 500));
        // 1.2:1 is landscape but taller than 4:3, so the height is trimmed.
        assert_eq!(render_plate(&photo(600, 500), 1).dimensions(), (600, 450));
        // 1.1:1 is near-square.
        assert_eq!(render_plate(&photo(550, 500), 1).dimensions(), (500, 500));
    }

    #[test]
    fn long_edge_is_capped_and_never_upscaled() {
        let (w, h) = render_plate(&photo(3200, 2400), 1).dimensions();
        assert_eq!((w, h), (1600, 1200));
        assert_eq!(render_plate(&photo(40, 30), 1).dimensions(), (40, 30));
    }

    #[test]
    fn white_and_black_are_no_longer_pure() {
        let white = render_plate(&RgbImage::from_pixel(64, 64, Rgb([255; 3])), 3);
        let black = render_plate(&RgbImage::from_pixel(64, 64, Rgb([0; 3])), 3);
        assert!(white.pixels().all(|p| p.0.iter().all(|&c| c < 252)));
        assert!(black.pixels().all(|p| p.0.iter().any(|&c| c > 0)));
        // Warm: red is at least as strong as blue on white.
        assert!(white.pixels().all(|p| p.0[0] > p.0[2]));
    }
}
