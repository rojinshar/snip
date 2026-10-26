//! Region capture via macOS's built-in `screencapture -i`: the same crosshair as ⌘⇧4.

use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

const SCREENCAPTURE: &str = "/usr/sbin/screencapture";

#[derive(Debug, PartialEq, Eq)]
pub enum CaptureOutcome {
    /// The user selected a region; the PNG is at this path.
    Captured(PathBuf),
    /// The user pressed Esc or clicked without dragging.
    Cancelled,
}

#[derive(Debug)]
pub enum CaptureError {
    Io(std::io::Error),
    /// `screencapture` exited unsuccessfully.
    Failed(Option<i32>),
}

impl fmt::Display for CaptureError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => write!(f, "could not run screencapture: {error}"),
            Self::Failed(code) => write!(f, "screencapture failed (exit code {code:?})"),
        }
    }
}

impl std::error::Error for CaptureError {}

impl From<std::io::Error> for CaptureError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error)
    }
}

/// Lets the user drag a box on screen and saves it as a PNG in `dir`. Blocks until the user
/// finishes or cancels, so call it off the main thread.
pub fn capture_region(dir: &Path) -> Result<CaptureOutcome, CaptureError> {
    fs::create_dir_all(dir)?;
    let path = dir.join(capture_file_name(SystemTime::now()));

    // -i: interactive selection, -x: no shutter sound.
    let status = Command::new(SCREENCAPTURE)
        .args(["-i", "-x"])
        .arg(&path)
        .status()?;

    interpret(status.success(), status.code(), &path)
}

/// Maps screencapture's result to an outcome. It exits 0 when the user cancels, but writes
/// no file, so the file's existence is the real signal.
fn interpret(
    success: bool,
    code: Option<i32>,
    path: &Path,
) -> Result<CaptureOutcome, CaptureError> {
    if !success {
        return Err(CaptureError::Failed(code));
    }
    if path.exists() {
        Ok(CaptureOutcome::Captured(path.to_path_buf()))
    } else {
        Ok(CaptureOutcome::Cancelled)
    }
}

/// `snip-<unix millis>.png`: sortable and collision-free for one user.
pub fn capture_file_name(now: SystemTime) -> String {
    let millis = now
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("snip-{millis}.png")
}

/// Width and height from a PNG's IHDR chunk, without decoding the image.
pub fn png_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    const SIGNATURE: [u8; 8] = [0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1a, b'\n'];
    if bytes.len() < 24 || bytes[..8] != SIGNATURE || &bytes[12..16] != b"IHDR" {
        return None;
    }
    let width = u32::from_be_bytes(bytes[16..20].try_into().ok()?);
    let height = u32::from_be_bytes(bytes[20..24].try_into().ok()?);
    Some((width, height))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn file_name_uses_unix_millis() {
        let t = UNIX_EPOCH + Duration::from_millis(1_793_053_395_123);
        assert_eq!(capture_file_name(t), "snip-1793053395123.png");
    }

    #[test]
    fn existing_file_means_captured_and_missing_file_means_cancelled() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("a.png");
        assert_eq!(
            interpret(true, Some(0), &path).unwrap(),
            CaptureOutcome::Cancelled
        );

        fs::write(&path, b"png").unwrap();
        assert_eq!(
            interpret(true, Some(0), &path).unwrap(),
            CaptureOutcome::Captured(path.clone())
        );
    }

    #[test]
    fn nonzero_exit_is_an_error() {
        let path = Path::new("/nonexistent/a.png");
        assert!(matches!(
            interpret(false, Some(1), path),
            Err(CaptureError::Failed(Some(1)))
        ));
    }

    #[test]
    fn reads_png_dimensions_from_ihdr() {
        let mut png = vec![
            0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1a, b'\n', 0, 0, 0, 13,
        ];
        png.extend_from_slice(b"IHDR");
        png.extend_from_slice(&640u32.to_be_bytes());
        png.extend_from_slice(&120u32.to_be_bytes());
        assert_eq!(png_dimensions(&png), Some((640, 120)));
    }

    #[test]
    fn rejects_non_png_bytes() {
        assert_eq!(png_dimensions(b"GIF89a not a png at all......"), None);
        assert_eq!(png_dimensions(b"short"), None);
    }
}
