//! Numbers as a cook writes them; the same rules as `formatNumber` in scale.ts.

use super::Amount;

const EIGHTHS: [&str; 8] = ["", "⅛", "¼", "⅜", "½", "⅝", "¾", "⅞"];

/// 1.5 -> "1½", 0.333 -> "⅓", 12.4 -> "12", 1234 -> "1,234". Eighths below 4, quarters below 10; never "0".
pub fn format_quantity(v: f64) -> String {
    // Not a number or absurdly large: show a bounded value rather than a saturated cast.
    let v = if v.is_nan() { 0.0 } else { v.min(1e12) };
    if v >= 10.0 {
        let digits = (v.round() as u64).to_string();
        let mut out = String::new();
        for (i, ch) in digits.chars().enumerate() {
            if i > 0 && (digits.len() - i).is_multiple_of(3) {
                out.push(',');
            }
            out.push(ch);
        }
        return out;
    }
    let v = v.max(0.0);
    let mut whole = v.floor();
    let frac = v - whole;
    let mut glyph = "";
    if v < 4.0 && (frac - 1.0 / 3.0).abs() < 0.03 {
        glyph = "⅓";
    } else if v < 4.0 && (frac - 2.0 / 3.0).abs() < 0.03 {
        glyph = "⅔";
    } else {
        let step = if v < 4.0 { 8.0 } else { 4.0 };
        let n = (frac * step).round();
        if n == step {
            whole += 1.0;
        } else {
            glyph = EIGHTHS[(n * (8.0 / step)) as usize];
        }
    }
    match (whole as u64, glyph) {
        (0, "") => "⅛".to_string(),
        (0, g) => g.to_string(),
        (w, g) => format!("{w}{g}"),
    }
}

/// "2–3" for a range (en dash), else the number alone.
pub fn format_amount_quantity(a: &Amount) -> String {
    let lo = format_quantity(a.min);
    match a.max.map(format_quantity) {
        Some(hi) if hi != lo => format!("{lo}–{hi}"),
        _ => lo,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_scale_ts() {
        for (v, want) in [
            (1.5, "1½"),
            (0.333, "⅓"),
            (2.0 / 3.0, "⅔"),
            (12.4, "12"),
            (1234.0, "1,234"),
            (0.01, "⅛"),
            (0.0, "⅛"),
            (3.0, "3"),
            (4.6, "4½"),
            (9.9, "10"),
            (0.99, "1"),
            (7.125, "7¼"),
        ] {
            assert_eq!(format_quantity(v), want, "{v}");
        }
    }
}
