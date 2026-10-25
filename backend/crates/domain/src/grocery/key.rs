//! The merge key: what two ingredient lines must share to land on one grocery item.

const SIZE_WORDS: [&str; 5] = ["large", "medium", "small", "extra-large", "big"];
/// Words that end in "s" but are not plurals, or whose plural is the same word.
const INVARIANT: [&str; 9] = [
    "molasses",
    "hummus",
    "asparagus",
    "couscous",
    "greens",
    "citrus",
    "grits",
    "swiss",
    "bitters",
];

/// The words of a name with prep notes (after a comma, in parentheses) and size words removed, lower-cased.
pub(super) fn clean_words(name: &str) -> Vec<String> {
    let chars: Vec<char> = name.chars().collect();
    let mut text = String::new();
    let mut depth = 0;
    for (i, &ch) in chars.iter().enumerate() {
        let decimal_comma = i > 0
            && chars[i - 1].is_ascii_digit()
            && chars.get(i + 1).is_some_and(char::is_ascii_digit);
        match ch {
            '(' => depth += 1,
            ')' if depth > 0 => depth -= 1,
            ',' if depth == 0 && !decimal_comma => break,
            ')' => text.push(' '),
            _ if depth == 0 => text.push(ch),
            _ => {}
        }
    }
    let mut words: Vec<String> = Vec::new();
    for raw in text.to_lowercase().split_whitespace() {
        let w =
            raw.trim_matches(|c: char| matches!(c, '.' | ';' | ':' | '!' | '*' | '-' | '–' | '—'));
        if w.is_empty() {
            continue;
        }
        if w == "large" && words.last().is_some_and(|p| p == "extra") {
            words.pop();
        } else if !SIZE_WORDS.contains(&w) {
            words.push(w.to_string());
        }
    }
    words
}

/// Lower-case, prep notes and size words dropped, whitespace collapsed, last word made singular.
pub fn merge_key(name: &str) -> String {
    key_of(&clean_words(name))
}

pub(super) fn key_of(words: &[String]) -> String {
    match words.split_last() {
        Some((last, head)) => head
            .iter()
            .map(String::as_str)
            .chain([singular(last).as_str()])
            .collect::<Vec<_>>()
            .join(" "),
        None => String::new(),
    }
}

fn singular(w: &str) -> String {
    if w.len() <= 3
        || !w.ends_with('s')
        || w.ends_with("ss")
        || w.ends_with("us")
        || INVARIANT.contains(&w)
    {
        return w.to_string();
    }
    match w {
        "leaves" => return "leaf".into(),
        "loaves" => return "loaf".into(),
        "halves" => return "half".into(),
        _ => {}
    }
    let keep_ie = matches!(
        w,
        "cookies" | "brownies" | "smoothies" | "veggies" | "chilies" | "pies"
    );
    match w.strip_suffix("ies") {
        Some(stem) if w.len() > 4 && !keep_ie => return format!("{stem}y"),
        _ => {}
    }
    let es = ["oes", "ches", "shes", "xes", "sses"]
        .iter()
        .any(|s| w.ends_with(s));
    w[..w.len() - if es { 2 } else { 1 }].to_string()
}

/// Display plural of a singular key's last word ("onion" -> "onions"); the reverse of `singular` for common foods.
pub(super) fn plural_key(key: &str) -> String {
    let (head, last) = key.rsplit_once(' ').map_or(("", key), |(h, l)| (h, l));
    let p = match last {
        "leaf" => "leaves".to_string(),
        "loaf" => "loaves".to_string(),
        "half" => "halves".to_string(),
        "tomato" | "potato" | "mango" => format!("{last}es"),
        _ if last.is_empty()
            || last == "garlic"
            || last.ends_with('s')
            || INVARIANT.contains(&last) =>
        {
            last.to_string()
        }
        _ if last.ends_with("ch") || last.ends_with("sh") || last.ends_with('x') => {
            format!("{last}es")
        }
        _ if last.ends_with('y') && !last.ends_with(['a', 'e', 'i', 'o', 'u']) => {
            format!("{}ies", &last[..last.len() - 1])
        }
        _ => format!("{last}s"),
    };
    if head.is_empty() {
        p
    } else {
        format!("{head} {p}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keys() {
        for (name, want) in [
            ("Large Onions, diced", "onion"),
            ("tomatoes (about 2 lb)", "tomato"),
            ("Extra-Large Eggs", "egg"),
            ("extra large eggs", "egg"),
            ("fresh   basil  leaves", "fresh basil leaf"),
            ("blueberries", "blueberry"),
            ("potatoes", "potato"),
            ("peaches", "peach"),
            ("cookies", "cookie"),
            ("molasses", "molasses"),
            ("hummus", "hummus"),
            ("asparagus", "asparagus"),
            ("couscous", "couscous"),
            ("red pepper flakes", "red pepper flake"),
            ("salt to taste", "salt to taste"),
            ("cloves", "clove"),
            ("", ""),
        ] {
            assert_eq!(merge_key(name), want, "{name}");
        }
    }

    #[test]
    fn plurals_round_trip() {
        for k in [
            "onion",
            "berry",
            "tomato",
            "green onion",
            "peach",
            "bay leaf",
            "egg",
            "pea",
            "clove",
        ] {
            assert_eq!(merge_key(&plural_key(k)), k);
        }
    }
}
