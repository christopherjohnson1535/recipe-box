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

    let house = house_look(&out);
    let mut rng = seed;
    for px in out.pixels_mut() {
        let grain = (splitmix64(&mut rng) % (2 * GRAIN as u64 + 1)) as i32 - GRAIN;
        let rgb = house.apply(px.0);
        px.0 = rgb.map(|v| (v + grain as f32).round().clamp(0.0, 255.0) as u8);
    }
    out
}

/// Levels: luminance percentiles map toward these (paper white and lifted black, never the extremes).
const BLACK_POINT: f32 = 18.0;
const WHITE_POINT: f32 = 235.0;
/// Mean luminance the midtone gamma aims for.
const TARGET_MEAN: f32 = 120.0;
/// Mean luminance of the finished plate (after curve and tint).
const OUT_MEAN: f32 = 115.0;
/// How far the colour cast is neutralised (food is legitimately warm, so not all the way).
const CAST_STRENGTH: f32 = 0.65;
/// Mean HSV saturation (0..255) of the muted print look.
const TARGET_SAT: f32 = 140.0;
/// About this many pixels are sampled for the statistics.
const SAMPLE: usize = 120_000;

/// The per-image normalisation toward one house look: a levels+gamma table, channel gains for the cast and a chroma
/// scale for saturation. All derived from the image itself, all deterministic.
struct HouseLook {
    lut: [f32; 256],
    gain: [f32; 3],
    chroma: f32,
    /// Final exposure trim after the saturation step, which moves the mean brightness a little.
    trim: f32,
    /// Tone curve per level: smoothstep blended with the identity (gentle S), then squeezed into 8..247 so a print
    /// never has pure black or white.
    curve: [f32; 256],
    /// Warm paper tint per channel.
    tint: [f32; 3],
}

impl HouseLook {
    /// Normalised, curved and tinted colour of one pixel (before grain).
    fn apply(&self, px: [u8; 3]) -> [f32; 3] {
        let base: [f32; 3] = std::array::from_fn(|c| self.lut[px[c] as usize]);
        // The cast fix fades out toward highlights and shadows so paper and white china stay neutral.
        let l = luma(base);
        let w = ((l / 40.0).min((215.0 - l) / 60.0)).clamp(0.0, 1.0);
        let mut rgb: [f32; 3] = std::array::from_fn(|c| base[c] * (1.0 + w * (self.gain[c] - 1.0)));
        // Scale HSV saturation about the brightest channel: hue and value stay put.
        let top = rgb[0].max(rgb[1]).max(rgb[2]);
        for v in &mut rgb {
            *v = self.trim * (top - self.chroma * (top - *v));
        }
        std::array::from_fn(|c| {
            self.curve[rgb[c].round().clamp(0.0, 255.0) as usize] * self.tint[c]
        })
    }
}

fn luma([r, g, b]: [f32; 3]) -> f32 {
    0.299 * r + 0.587 * g + 0.114 * b
}

fn hsv_s([r, g, b]: [f32; 3]) -> f32 {
    let max = r.max(g).max(b);
    if max <= 0.0 {
        0.0
    } else {
        255.0 * (max - r.min(g).min(b)) / max
    }
}

fn house_look(img: &RgbImage) -> HouseLook {
    let step = (img.pixels().len() / SAMPLE).max(1);
    let sample: Vec<[u8; 3]> = img.pixels().step_by(step).map(|p| p.0).collect();
    let n = sample.len().max(1) as f32;

    // 1. Levels: p2/p98 of luminance to the black/white points, gain clamped so a dark dish isn't blown out.
    let mut hist = [0u32; 256];
    for p in &sample {
        hist[luma(p.map(f32::from)).round() as usize] += 1;
    }
    let percentile = |q: f32| {
        let want = (q * n) as u32;
        let mut seen = 0;
        for (i, &c) in hist.iter().enumerate() {
            seen += c;
            if seen > want {
                return i as f32;
            }
        }
        255.0
    };
    let (lo, hi) = (percentile(0.02), percentile(0.98));
    // A flat image (blank, solid colour) has no range to stretch; leave its levels alone.
    let lut: [f32; 256] = if hi - lo < 16.0 {
        std::array::from_fn(|i| i as f32)
    } else {
        let level_gain = ((WHITE_POINT - BLACK_POINT) / (hi - lo)).clamp(0.6, 2.2);
        let levels: [f32; 256] =
            std::array::from_fn(|i| (BLACK_POINT + (i as f32 - lo) * level_gain).clamp(0.0, 255.0));
        let mean = hist
            .iter()
            .zip(&levels)
            .map(|(&c, &v)| c as f32 * v)
            .sum::<f32>()
            / n;
        // Midtone gamma so the mean lands near the target.
        let gamma = ((TARGET_MEAN / 255.0).ln() / (mean.max(1.0) / 255.0).ln()).clamp(0.6, 1.6);
        std::array::from_fn(|i| 255.0 * (levels[i] / 255.0).powf(gamma))
    };
    let curve = std::array::from_fn(|i| {
        let v = i as f32 / 255.0;
        let s = v * v * (3.0 - 2.0 * v);
        8.0 + 239.0 * (v + 0.4 * (s - v))
    });
    let top = PAPER.into_iter().fold(0.0, f32::max);
    let tint = PAPER.map(|p| 1.0 - WARMTH + WARMTH * p / top);
    let mut look = HouseLook {
        lut,
        gain: [1.0; 3],
        chroma: 1.0,
        trim: 1.0,
        curve,
        tint,
    };

    // 2. Cast: partial grey-world on mid-tones only.
    let (mut sum, mut count) = ([0.0f32; 3], 0.0f32);
    for p in &sample {
        let rgb = look.apply(*p);
        if (40.0..215.0).contains(&luma(rgb)) {
            for (s, v) in sum.iter_mut().zip(rgb) {
                *s += v;
            }
            count += 1.0;
        }
    }
    if count > 0.0 {
        let means = sum.map(|s| s / count);
        let grey = (means[0] + means[1] + means[2]) / 3.0;
        look.gain =
            means.map(|m| (1.0 + CAST_STRENGTH * (grey / m.max(1.0) - 1.0)).clamp(0.93, 1.1));
    }

    // 3. Saturation: scale chroma so the mean HSV saturation lands near the muted target.
    // Measured on the finished colours (curve and tint included); two rounds because the curve is not linear.
    for _ in 0..2 {
        let sat = sample.iter().map(|p| hsv_s(look.apply(*p))).sum::<f32>() / n;
        if sat > 1.0 {
            look.chroma = (look.chroma * TARGET_SAT / sat).clamp(0.4, 1.3);
        }
    }
    // 4. Trim the exposure so the finished mean luminance sits on the target whatever the saturation step did.
    let out_mean = sample.iter().map(|p| luma(look.apply(*p))).sum::<f32>() / n;
    look.trim = (OUT_MEAN / out_mean.max(1.0)).clamp(0.93, 1.15);
    look
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

    fn mean_luma(img: &RgbImage) -> f32 {
        img.pixels().map(|p| luma(p.0.map(f32::from))).sum::<f32>() / img.pixels().len() as f32
    }

    fn mean_sat(img: &RgbImage) -> f32 {
        img.pixels().map(|p| hsv_s(p.0.map(f32::from))).sum::<f32>() / img.pixels().len() as f32
    }

    fn gradient(lo: u8, hi: u8) -> RgbImage {
        RgbImage::from_fn(200, 150, |x, _| {
            let v = lo as f32 + (hi - lo) as f32 * x as f32 / 199.0;
            Rgb([v as u8, (v * 0.9) as u8, (v * 0.8) as u8])
        })
    }

    #[test]
    fn dark_and_bright_inputs_land_close_together() {
        let dark = mean_luma(&render_plate(&gradient(2, 110), 5));
        let bright = mean_luma(&render_plate(&gradient(120, 255), 5));
        assert!((dark - bright).abs() < 15.0, "dark {dark} bright {bright}");
    }

    #[test]
    fn mid_grey_stays_neutral_and_unsaturated() {
        let out = render_plate(&RgbImage::from_pixel(64, 64, Rgb([128; 3])), 9);
        assert!(out.pixels().all(|p| p.0[0].abs_diff(p.0[2]) < 30));
        assert!(mean_sat(&out) < 40.0);
    }

    /// Throwaway check on the real inputs (not run in CI): `cargo test --release real_photos -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn real_photos() {
        let dir = std::env::var("PLATE_PHOTOS").unwrap();
        let mut rb = Vec::new();
        for name in ["phone-warm", "blog-cool", "portrait", "scan"] {
            let img = image::open(format!("{dir}/{name}.jpg")).unwrap().to_rgb8();
            let t = std::time::Instant::now();
            let out = render_plate(&img, 1);
            let ms = t.elapsed().as_millis();
            let ratio = |i: &RgbImage| {
                let (mut r, mut b) = (0.0, 0.0);
                for p in i.pixels() {
                    r += f32::from(p.0[0]);
                    b += f32::from(p.0[2]);
                }
                r / b
            };
            println!(
                "{name}: orig L={:.0} sat={:.0} R/B={:.2} | plate L={:.0} sat={:.0} R/B={:.2} ({ms} ms, {:?})",
                mean_luma(&img),
                mean_sat(&img),
                ratio(&img),
                mean_luma(&out),
                mean_sat(&out),
                ratio(&out),
                out.dimensions()
            );
            rb.push((name, img, out));
        }
        // Contact sheet: originals on top, renditions below.
        let (cell_h, gap) = (320u32, 10u32);
        let thumbs = |pick: usize| -> Vec<RgbImage> {
            rb.iter()
                .map(|t| {
                    let i = if pick == 0 { &t.1 } else { &t.2 };
                    let w = i.width() * cell_h / i.height();
                    imageops::resize(i, w, cell_h, FilterType::Triangle)
                })
                .collect()
        };
        let (top, bottom) = (thumbs(0), thumbs(1));
        let width: u32 = top.iter().map(|t| t.width() + gap).sum::<u32>() + gap;
        let mut sheet = RgbImage::from_pixel(width, 2 * cell_h + 3 * gap, Rgb([255; 3]));
        for (row, set) in [top, bottom].iter().enumerate() {
            let mut x = gap;
            for t in set {
                imageops::overlay(
                    &mut sheet,
                    t,
                    x as i64,
                    (gap + row as u32 * (cell_h + gap)) as i64,
                );
                x += t.width() + gap;
            }
        }
        sheet.save(format!("{dir}/../contact43-after.png")).unwrap();
    }
}
