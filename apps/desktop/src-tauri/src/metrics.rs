//! One JSON line per snip with step timings, to check the latency budget
//! (docs/desktop-v0.md §7). Never contains the image or the LaTeX itself.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;

use serde::Serialize;

#[derive(Debug, Default, Serialize, PartialEq)]
pub struct SnipTimings {
    /// Unix milliseconds when the user released the mouse.
    pub at: u128,
    pub outcome: String,
    /// Read, resize and encode the capture.
    pub prepare_ms: u128,
    /// Upload plus server time, as seen by the app.
    pub request_ms: u128,
    /// Server-reported recognition time.
    pub server_ms: Option<u64>,
    /// Mouse release to clipboard (or to the error).
    pub total_ms: u128,
    pub width: u32,
    pub height: u32,
    /// Whether the capture was downscaled before upload.
    pub resized: bool,
    pub upload_bytes: usize,
    pub engine: Option<String>,
}

pub fn append(path: &Path, timings: &SnipTimings) -> std::io::Result<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let mut file = OpenOptions::new().create(true).append(true).open(path)?;
    writeln!(
        file,
        "{}",
        serde_json::to_string(timings).map_err(std::io::Error::other)?
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn appends_one_json_line_per_snip() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("logs/snips.jsonl");
        let timings = SnipTimings {
            outcome: "copied".into(),
            total_ms: 1400,
            ..Default::default()
        };

        append(&path, &timings).unwrap();
        append(&path, &timings).unwrap();

        let text = fs::read_to_string(&path).unwrap();
        let lines: Vec<&str> = text.lines().collect();
        assert_eq!(lines.len(), 2);
        let parsed: serde_json::Value = serde_json::from_str(lines[0]).unwrap();
        assert_eq!(parsed["outcome"], "copied");
        assert_eq!(parsed["total_ms"], 1400);
    }
}
