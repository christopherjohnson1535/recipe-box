//! Reading the quantity, unit and name of an ingredient line. A hand-written port of `QUANTITY` and
//! `SECOND_AMOUNT` in `frontend/src/lib/scale.ts` (no regex crate): the two sides must find the same quantity.

use super::Amount;
use super::format::format_quantity;
use super::key::{clean_words, key_of};

/// An ingredient line read: the amount (None when there is none or it is ambiguous), the cleaned name and its merge key.
#[derive(Debug, Clone, PartialEq)]
pub struct ParsedLine {
    pub amount: Option<Amount>,
    pub name: String,
    pub key: String,
}

type Span = (usize, usize);

/// A leading quantity: first number, optional range end, optional unit, and where the match ends.
struct Qty {
    a: Span,
    b: Option<Span>,
    unit: Option<Span>,
    end: usize,
}

fn glyph(c: Option<&char>) -> Option<f64> {
    Some(match c? {
        '½' => 1.0 / 2.0,
        '⅓' => 1.0 / 3.0,
        '⅔' => 2.0 / 3.0,
        '¼' => 1.0 / 4.0,
        '¾' => 3.0 / 4.0,
        '⅛' => 1.0 / 8.0,
        '⅜' => 3.0 / 8.0,
        '⅝' => 5.0 / 8.0,
        '⅞' => 7.0 / 8.0,
        _ => return None,
    })
}

/// Canonical short singular unit for a lower-case word from scale.ts's `UNIT` list.
fn canon_unit(w: &str) -> Option<&'static str> {
    Some(match w {
        "lb" | "lbs" | "pound" | "pounds" => "lb",
        "oz" | "ounce" | "ounces" => "oz",
        "g" | "gram" | "grams" => "g",
        "kg" => "kg",
        "ml" => "ml",
        "l" | "liter" | "liters" | "litre" | "litres" => "l",
        "tsp" | "teaspoon" | "teaspoons" => "tsp",
        "tbsp" | "tablespoon" | "tablespoons" => "tbsp",
        "cup" | "cups" => "cup",
        "clove" | "cloves" => "clove",
        "pinch" | "pinches" => "pinch",
        "dash" | "dashes" => "dash",
        "can" | "cans" => "can",
        "stick" | "sticks" => "stick",
        "slice" | "slices" => "slice",
        "bunch" | "bunches" => "bunch",
        "sprig" | "sprigs" => "sprig",
        "head" | "heads" => "head",
        "stalk" | "stalks" => "stalk",
        "piece" | "pieces" => "piece",
        "package" | "packages" => "package",
        "handful" | "handfuls" => "handful",
        "quart" | "quarts" | "qt" => "qt",
        "pint" | "pints" | "pt" => "pt",
        "gal" => "gal",
        _ => return None,
    })
}

fn digits(c: &[char], i: usize) -> usize {
    i + c[i.min(c.len())..]
        .iter()
        .take_while(|ch| ch.is_ascii_digit())
        .count()
}

fn skip_ws(c: &[char], mut i: usize) -> usize {
    while c.get(i).is_some_and(|ch| ch.is_whitespace()) {
        i += 1;
    }
    i
}

/// Ends of the number alternatives at `i`, in the order of scale.ts's `NUMBER`: "1,000", "1 1/2", "1-1/2", "1½",
/// "1/2", "2.5", "½". The caller takes the first one the rest of the pattern accepts.
fn number_ends(c: &[char], i: usize) -> Vec<usize> {
    let mut ends = Vec::new();
    let d = digits(c, i);
    if d == i {
        if glyph(c.get(i)).is_some() {
            ends.push(i + 1);
        }
        return ends;
    }
    let frac_end = |from: usize| {
        let e = digits(c, from + 1);
        (c.get(from) == Some(&'/') && e > from + 1).then_some(e)
    };
    if d - i <= 3 {
        let mut j = d;
        while c.get(j) == Some(&',') && digits(c, j + 1) >= j + 4 {
            j += 4;
        }
        if j > d {
            let e = digits(c, j + 1);
            ends.push(if c.get(j) == Some(&'.') && e > j + 1 {
                e
            } else {
                j
            });
        }
    }
    let j = skip_ws(c, d);
    if j > d && digits(c, j) > j {
        ends.extend(frac_end(digits(c, j)));
    }
    if c.get(d) == Some(&'-') && digits(c, d + 1) > d + 1 {
        ends.extend(frac_end(digits(c, d + 1)));
    }
    if glyph(c.get(d)).is_some() {
        ends.push(d + 1);
    }
    ends.extend(frac_end(d));
    let e = digits(c, d + 1);
    ends.push(if c.get(d) == Some(&'.') && e > d + 1 {
        e
    } else {
        d
    });
    ends
}

/// End of the separator of a range ("-", "–", " to ") that starts at `i`.
fn range_sep(c: &[char], i: usize) -> Option<usize> {
    let j = skip_ws(c, i);
    if matches!(c.get(j), Some('-' | '–')) {
        return Some(skip_ws(c, j + 1));
    }
    let word: String = c.get(j..j + 2)?.iter().collect();
    (j > i && word.eq_ignore_ascii_case("to") && c.get(j + 2).is_some_and(|ch| ch.is_whitespace()))
        .then(|| skip_ws(c, j + 2))
}

/// After a quantity: whitespace, a comma not followed by a digit, or the end.
fn boundary(c: &[char], i: usize) -> bool {
    match c.get(i) {
        None => true,
        Some(ch) if ch.is_whitespace() => true,
        Some(',') => !c.get(i + 1).is_some_and(char::is_ascii_digit),
        _ => false,
    }
}

/// A unit word at `i` (after optional spaces), with an optional ".": its span and where the match ends.
fn unit_at(c: &[char], i: usize) -> Option<(Span, usize)> {
    let s = skip_ws(c, i);
    let e = s + c[s..]
        .iter()
        .take_while(|ch| ch.is_ascii_alphabetic())
        .count();
    let word: String = c[s..e].iter().collect::<String>().to_lowercase();
    canon_unit(&word)?;
    Some(((s, e), if c.get(e) == Some(&'.') { e + 1 } else { e }))
}

fn match_quantity(c: &[char]) -> Option<Qty> {
    let start = skip_ws(c, 0);
    for e1 in number_ends(c, start) {
        let mut tries = Vec::new();
        if let Some(j) = range_sep(c, e1) {
            tries.extend(number_ends(c, j).into_iter().map(|e2| (Some((j, e2)), e2)));
        }
        tries.push((None, e1));
        for (b, e) in tries {
            if let Some((unit, after)) = unit_at(c, e)
                && boundary(c, after)
            {
                return Some(Qty {
                    a: (start, e1),
                    b,
                    unit: Some(unit),
                    end: after,
                });
            }
            if boundary(c, e) {
                return Some(Qty {
                    a: (start, e1),
                    b,
                    unit: None,
                    end: e,
                });
            }
        }
    }
    None
}

/// "plus 2 tbsp", "and 1 cup", "+ 2", "cup/240 ml", "1/2-inch": a second amount follows, so the line has no single quantity.
fn second_amount(r: &[char]) -> bool {
    let after_ws_digit = |i: usize| {
        let j = skip_ws(r, i);
        r.get(j).is_some_and(char::is_ascii_digit)
    };
    for w in ["plus", "and", "+"] {
        let n = w.chars().count();
        let head: String = r.iter().take(n).collect();
        if head.eq_ignore_ascii_case(w)
            && r.get(n).is_some_and(|ch| ch.is_whitespace())
            && after_ws_digit(n)
        {
            return true;
        }
    }
    let token = r.iter().take_while(|ch| !ch.is_whitespace()).count();
    if (0..token).any(|p| r[p] == '/' && after_ws_digit(p + 1)) {
        return true;
    }
    let d = digits(r, 0);
    d > 0 && r.get(d) == Some(&'/') && r.get(d + 1).is_some_and(char::is_ascii_digit)
}

/// "1 1/2" or "1½" or "2.5" -> 1.5, 2.5 (scale.ts `parseNumber`).
fn parse_number(c: &[char]) -> f64 {
    let mut s: Vec<char> = Vec::new();
    for (i, &ch) in c.iter().enumerate() {
        let thousands = ch == ','
            && i > 0
            && c[i - 1].is_ascii_digit()
            && c.get(i + 1..i + 4)
                .is_some_and(|t| t.iter().all(char::is_ascii_digit));
        if !thousands {
            s.push(ch);
        }
    }
    let (mut total, mut i) = (0.0, 0);
    while i < s.len() {
        let d = digits(&s, i);
        if d == i {
            total += glyph(s.get(i)).unwrap_or(0.0);
            i += 1;
            continue;
        }
        let text = |a: usize, b: usize| {
            s[a..b]
                .iter()
                .collect::<String>()
                .parse::<f64>()
                .unwrap_or(0.0)
        };
        let den = digits(&s, d + 1);
        if s.get(d) == Some(&'/') && den > d + 1 {
            total += text(i, d) / text(d + 1, den);
            i = den;
        } else {
            let e = if s.get(d) == Some(&'.') && digits(&s, d + 1) > d + 1 {
                digits(&s, d + 1)
            } else {
                d
            };
            total += text(i, e);
            i = e;
        }
    }
    total
}

fn slashed(text: &str) -> Vec<char> {
    text.chars()
        .map(|ch| if ch == '\u{2044}' { '/' } else { ch })
        .collect()
}

/// Reads a line like scale.ts `splitIngredient`: the quantity match and the text after it. None when there is no
/// quantity or a second amount follows.
fn split(c: &[char]) -> Option<(Qty, String)> {
    let q = match_quantity(c)?;
    let rest: String = c[q.end..].iter().collect();
    let rest = rest.trim_start();
    let rest_chars: Vec<char> = rest.chars().collect();
    (!second_amount(&rest_chars)).then(|| (q, rest.to_string()))
}

fn leading_word(s: &str) -> &str {
    let end = s
        .find(|ch: char| !ch.is_ascii_alphabetic())
        .unwrap_or(s.len());
    &s[..end]
}

/// Reads one ingredient line. Never fails: a line without a usable amount keeps its whole text as the name.
pub fn parse_line(text: &str) -> ParsedLine {
    let t = text.trim();
    match parse_amount(t) {
        Some((amount, words)) => ParsedLine {
            amount: Some(amount),
            name: words.join(" "),
            key: key_of(&words),
        },
        None => ParsedLine {
            amount: None,
            name: t.to_string(),
            key: super::merge_key(t),
        },
    }
}

fn parse_amount(t: &str) -> Option<(Amount, Vec<String>)> {
    let c = slashed(t);
    let (q, mut rest) = split(&c)?;
    let num = |s: Span| parse_number(&c[s.0..s.1]);
    let mut unit = q
        .unit
        .and_then(|s| canon_unit(&c[s.0..s.1].iter().collect::<String>().to_lowercase()));
    // "1 (14 oz) can tomatoes": a count, a size in parentheses, then the unit.
    if unit.is_none()
        && rest.starts_with('(')
        && let Some(close) = rest.find(')')
    {
        let after = rest[close + 1..].trim_start();
        let word = leading_word(after);
        if let Some(u) = canon_unit(&word.to_lowercase()) {
            unit = Some(u);
            rest = after[word.len()..].to_string();
        }
    }
    if unit.is_some() && rest.get(..3).is_some_and(|p| p.eq_ignore_ascii_case("of ")) {
        rest = rest[3..].to_string();
    }
    let words = clean_words(&rest);
    if words.is_empty() {
        return None;
    }
    let (a, b) = (num(q.a), q.b.map(num));
    let (min, max) = match b {
        Some(b) if b < a => (b, Some(a)),
        Some(b) if b > a => (a, Some(b)),
        _ => (a, None),
    };
    Some((
        Amount {
            min,
            max,
            unit: unit.map(str::to_string),
        },
        words,
    ))
}

/// "cup" -> "cups" above one; abbreviations never change (scale.ts `pluralize`).
fn pluralize(unit: &str, value: f64) -> String {
    const BASES: [&str; 20] = [
        "cup",
        "clove",
        "can",
        "teaspoon",
        "tablespoon",
        "pound",
        "ounce",
        "stick",
        "slice",
        "quart",
        "pint",
        "bunch",
        "pinch",
        "dash",
        "sprig",
        "head",
        "stalk",
        "piece",
        "package",
        "handful",
    ];
    let lower = unit.to_ascii_lowercase();
    for base in BASES {
        if let Some(r) = lower.strip_prefix(base)
            && matches!(r, "" | "s" | "es")
        {
            let es = base.ends_with("ch") || base.ends_with("sh");
            return format!(
                "{}{}",
                &unit[..base.len()],
                if value <= 1.0 {
                    ""
                } else if es {
                    "es"
                } else {
                    "s"
                }
            );
        }
    }
    unit.to_string()
}

/// Servings text scaled like the recipe page does (scale.ts `scaleServings`): "4-6" × 0.5 -> "2–3".
/// Text without a leading number comes back unchanged.
pub fn scale_servings(text: &str, factor: f64) -> String {
    let c = slashed(text);
    let scaled = match split(&c) {
        Some((q, rest)) if factor != 1.0 => {
            let one = |s: Span| format_quantity(parse_number(&c[s.0..s.1]) * factor);
            let a = one(q.a);
            let b = q.b.map(one).filter(|b| *b != a);
            let nums = b.map_or_else(|| a.clone(), |b| format!("{a}–{b}"));
            let nums = match q.unit {
                Some(u) => {
                    let last = q.b.unwrap_or(q.a);
                    let value = parse_number(&c[last.0..last.1]) * factor;
                    format!(
                        "{nums} {}",
                        pluralize(&c[u.0..u.1].iter().collect::<String>(), value)
                    )
                }
                None => nums,
            };
            if rest.is_empty() {
                nums
            } else {
                format!("{nums} {rest}")
            }
        }
        _ => text.to_string(),
    };
    en_dash_first_range(&scaled)
}

/// First "6-8" (digit, dash, digit, spaces allowed) becomes "6–8".
fn en_dash_first_range(s: &str) -> String {
    let c: Vec<char> = s.chars().collect();
    for i in 0..c.len() {
        if !c[i].is_ascii_digit() {
            continue;
        }
        let j = skip_ws(&c, i + 1);
        if c.get(j) == Some(&'-') {
            let k = skip_ws(&c, j + 1);
            if c.get(k).is_some_and(char::is_ascii_digit) {
                return c[..=i]
                    .iter()
                    .chain(['–'].iter())
                    .chain(c[k..].iter())
                    .collect();
            }
        }
    }
    s.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn amt(s: &str) -> Option<(f64, Option<f64>, Option<String>)> {
        parse_line(s).amount.map(|a| (a.min, a.max, a.unit))
    }

    #[test]
    fn quantities_like_scale_ts() {
        assert_eq!(amt("1,000 g flour"), Some((1000.0, None, Some("g".into()))));
        assert_eq!(
            amt("1-1/2 cups flour"),
            Some((1.5, None, Some("cup".into())))
        );
        assert_eq!(
            amt("2 to 3 tablespoons butter"),
            Some((2.0, Some(3.0), Some("tbsp".into())))
        );
        assert_eq!(amt("100g flour"), Some((100.0, None, Some("g".into()))));
        assert_eq!(amt("1⁄2 cup flour"), Some((0.5, None, Some("cup".into()))));
        assert_eq!(amt("1 large egg"), Some((1.0, None, None)));
        assert_eq!(amt("3 cupboards"), Some((3.0, None, None)));
        for none in [
            "14-oz can tomatoes",
            "350°F oven",
            "2x4 board",
            "1,5 kg flour",
            "1 cup/240 ml milk",
            "1 1/2-inch piece ginger",
            "2 cups plus 2 tbsp flour",
            "salt to taste",
        ] {
            assert_eq!(amt(none), None, "{none}");
        }
    }

    #[test]
    fn names() {
        assert_eq!(parse_line("2 cups of flour").name, "flour");
        assert_eq!(
            parse_line("1 (14 oz) can tomatoes")
                .amount
                .unwrap()
                .unit
                .as_deref(),
            Some("can")
        );
        assert_eq!(parse_line("2 cups").amount, None);
        assert_eq!(parse_line(" Juice of 1 lemon ").name, "Juice of 1 lemon");
    }

    #[test]
    fn odd_text_never_panics() {
        for t in [
            "",
            "½",
            "1,",
            "1,0",
            "1 -",
            "1 to",
            "1-",
            "((",
            ")",
            "İ 2 cups of İ",
            "2 cups of",
            "1 (",
            "1 ( ) can",
            "/",
            "1 / 2",
            "９ cups",
            "0 cups flour",
            "1⁄",
            "- 1 cup",
        ] {
            let _ = parse_line(t);
            let _ = scale_servings(t, 2.0);
        }
    }

    #[test]
    fn servings() {
        for (text, f, want) in [
            ("4-6", 0.5, "2–3"),
            ("6-8", 1.0, "6–8"),
            ("4 servings", 2.0, "8 servings"),
            ("Serves 4", 2.0, "Serves 4"),
            ("2 cups", 2.0, "4 cups"),
            ("1 loaf", 3.0, "3 loaf"),
        ] {
            assert_eq!(scale_servings(text, f), want, "{text}");
        }
    }
}
