//! How recognized LaTeX is written to the clipboard, and how usage is described.

use serde::{Deserialize, Serialize};

use crate::api::SnipKind;

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

/// What goes on the clipboard: math in the user's delimiters, text with math as it came.
pub fn clipboard_text(latex: &str, kind: SnipKind, delimiters: Delimiters) -> String {
    match kind {
        SnipKind::Math => wrap(latex, delimiters),
        SnipKind::Text => latex.trim().to_string(),
    }
}

/// "2026-11-01T00:00:00.000Z" → "Nov 1". The server sends UTC midnight, so the date part is
/// the calendar day; None for anything else.
pub fn month_day(iso: &str) -> Option<String> {
    const MONTHS: [&str; 12] = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    let month: usize = iso.get(5..7)?.parse().ok()?;
    let day: u32 = iso.get(8..10)?.parse().ok()?;
    let name = MONTHS.get(month.checked_sub(1)?)?;
    (1..=31).contains(&day).then(|| format!("{name} {day}"))
}

/// The usage line in Settings: "37 of 200 snips this month · resets Nov 1".
pub fn usage_line(used: Option<u64>, quota: Option<u64>, resets_at: Option<&str>) -> String {
    match (used, quota) {
        (Some(used), Some(quota)) => {
            let line = format!(
                "{} of {} snips this month",
                thousands(used),
                thousands(quota)
            );
            match resets_at.and_then(month_day) {
                Some(day) => format!("{line} · resets {day}"),
                None => line,
            }
        }
        _ => "No quota (local API)".into(),
    }
}

fn thousands(n: u64) -> String {
    let digits = n.to_string();
    let mut out = String::new();
    for (i, c) in digits.chars().enumerate() {
        if i > 0 && (digits.len() - i) % 3 == 0 {
            out.push(',');
        }
        out.push(c);
    }
    out
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
    fn text_with_math_is_pasted_without_extra_delimiters() {
        let text = "The roots are $x = 1$ and $x = 2$.";
        assert_eq!(
            clipboard_text(text, SnipKind::Text, Delimiters::InlineDollar),
            text
        );
        assert_eq!(
            clipboard_text("x^2", SnipKind::Math, Delimiters::DisplayBracket),
            "\\[x^2\\]"
        );
    }

    #[test]
    fn month_day_reads_the_calendar_day() {
        assert_eq!(month_day("2026-11-01T00:00:00.000Z"), Some("Nov 1".into()));
        assert_eq!(month_day("2027-01-01T00:00:00.000Z"), Some("Jan 1".into()));
        assert_eq!(month_day("garbage"), None);
        assert_eq!(month_day("2026-13-01"), None);
    }

    #[test]
    fn usage_line_reads_naturally() {
        assert_eq!(
            usage_line(Some(37), Some(200), Some("2026-11-01T00:00:00.000Z")),
            "37 of 200 snips this month · resets Nov 1"
        );
        assert_eq!(
            usage_line(Some(6), Some(100_000), None),
            "6 of 100,000 snips this month"
        );
        assert_eq!(usage_line(None, None, None), "No quota (local API)");
    }

    #[test]
    fn thousands_groups_digits() {
        assert_eq!(thousands(0), "0");
        assert_eq!(thousands(999), "999");
        assert_eq!(thousands(1000), "1,000");
        assert_eq!(thousands(1_234_567), "1,234,567");
    }
}
