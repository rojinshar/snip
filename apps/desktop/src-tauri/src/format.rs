//! How recognized LaTeX is written to the clipboard and shown in notifications.

use serde::{Deserialize, Serialize};

/// Delimiters wrapped around the LaTeX (docs/desktop-v0.md §6), chosen in settings.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Delimiters {
    #[default]
    InlineDollar,
    DisplayBracket,
    DisplayDollar,
    None,
}

pub fn wrap(latex: &str, delimiters: Delimiters) -> String {
    let latex = latex.trim();
    match delimiters {
        Delimiters::InlineDollar => format!("${latex}$"),
        Delimiters::DisplayBracket => format!("\\[{latex}\\]"),
        Delimiters::DisplayDollar => format!("$${latex}$$"),
        Delimiters::None => latex.to_string(),
    }
}

/// One-line preview for a notification: whitespace collapsed, cut at `max_chars`.
pub fn preview(latex: &str, max_chars: usize) -> String {
    let flat = latex.split_whitespace().collect::<Vec<_>>().join(" ");
    if flat.chars().count() <= max_chars {
        return flat;
    }
    let cut: String = flat.chars().take(max_chars.saturating_sub(1)).collect();
    format!("{}…", cut.trim_end())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wraps_with_each_delimiter_style() {
        assert_eq!(
            wrap(" \\frac{a}{b} ", Delimiters::InlineDollar),
            "$\\frac{a}{b}$"
        );
        assert_eq!(
            wrap("\\frac{a}{b}", Delimiters::DisplayBracket),
            "\\[\\frac{a}{b}\\]"
        );
        assert_eq!(
            wrap("\\frac{a}{b}", Delimiters::DisplayDollar),
            "$$\\frac{a}{b}$$"
        );
        assert_eq!(wrap("\\frac{a}{b}", Delimiters::None), "\\frac{a}{b}");
    }

    #[test]
    fn default_is_inline_dollar() {
        assert_eq!(Delimiters::default(), Delimiters::InlineDollar);
    }

    #[test]
    fn preview_flattens_and_truncates() {
        let latex = "\\begin{aligned}\n  a &= b \\\\\n  c &= d\n\\end{aligned}";
        assert_eq!(
            preview(latex, 200),
            "\\begin{aligned} a &= b \\\\ c &= d \\end{aligned}"
        );
        assert_eq!(preview(latex, 12), "\\begin{alig…");
        assert_eq!(preview("x^2", 12), "x^2");
    }
}
