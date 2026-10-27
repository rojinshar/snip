//! The tester's access key (docs/beta-v1.md §4), kept in its own file in the app config
//! directory, readable only by the user (mode 0600) and never in settings.json.
//!
//! Not the Keychain: with ad-hoc signed builds macOS asks for permission on every read, and
//! the key is revocable and quota-limited, so a private file is the better trade-off until
//! builds are signed with a Developer ID.

use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::os::unix::fs::OpenOptionsExt;
use std::path::{Path, PathBuf};

pub const FILE_NAME: &str = "access-key";

const PREFIX: &str = "snip_";
const RANDOM_LEN: usize = 26;

#[derive(Debug, PartialEq, Eq)]
pub enum KeyError {
    Format,
    Storage(String),
}

impl KeyError {
    pub fn message(&self) -> &'static str {
        match self {
            Self::Format => {
                "That doesn't look like a Snip access key (snip_ and 26 letters or digits)."
            }
            Self::Storage(_) => "Couldn't save the key. Try again.",
        }
    }
}

/// Trims what a paste may add and checks the shape: `snip_` plus 26 base32 characters.
pub fn normalize(key: &str) -> Result<String, KeyError> {
    let key = key.trim();
    let random = key.strip_prefix(PREFIX).ok_or(KeyError::Format)?;
    let base32 = random
        .chars()
        .all(|c| c.is_ascii_lowercase() || ('2'..='7').contains(&c));
    if random.len() != RANDOM_LEN || !base32 {
        return Err(KeyError::Format);
    }
    Ok(key.to_string())
}

/// Enough of the key to recognize it in Settings without showing it: `snip_…k3q7`.
pub fn hint(key: &str) -> String {
    let tail: String = key
        .chars()
        .rev()
        .take(4)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    format!("{PREFIX}…{tail}")
}

pub fn path_in(config_dir: &Path) -> PathBuf {
    config_dir.join(FILE_NAME)
}

/// The saved key, or None if there is none or the file doesn't hold a valid key.
pub fn load(path: &Path) -> Option<String> {
    match fs::read_to_string(path) {
        Ok(text) => normalize(&text).ok(),
        Err(error) if error.kind() == io::ErrorKind::NotFound => None,
        Err(error) => {
            log::warn!("could not read the access key: {error}");
            None
        }
    }
}

/// Writes atomically, with the file created as 0600 so no other user can read it.
pub fn save(path: &Path, key: &str) -> Result<(), KeyError> {
    write_private(path, key).map_err(|error| KeyError::Storage(error.to_string()))
}

pub fn delete(path: &Path) -> Result<(), KeyError> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(KeyError::Storage(error.to_string())),
    }
}

fn write_private(path: &Path, key: &str) -> io::Result<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension("tmp");
    let _ = fs::remove_file(&tmp);
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(&tmp)?;
    file.write_all(key.as_bytes())?;
    file.sync_all()?;
    fs::rename(&tmp, path)
}

#[cfg(test)]
mod tests {
    use std::os::unix::fs::PermissionsExt;

    use super::*;

    const KEY: &str = "snip_abcdefghijklmnopqrstuvwx23";

    fn key_path() -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let path = path_in(&dir.path().join("config"));
        (dir, path)
    }

    #[test]
    fn accepts_a_well_formed_key_and_trims_paste_whitespace() {
        assert_eq!(normalize(KEY), Ok(KEY.to_string()));
        assert_eq!(normalize(&format!("  {KEY}\n")), Ok(KEY.to_string()));
    }

    #[test]
    fn rejects_malformed_keys() {
        for bad in [
            "",
            "snip_",
            "abcdefghijklmnopqrstuvwx23",
            "snip_abcdefghijklmnopqrstuvwx2",   // too short
            "snip_abcdefghijklmnopqrstuvwx234", // too long
            "snip_ABCDEFGHIJKLMNOPQRSTUVWX23",  // upper case
            "snip_abcdefghijklmnopqrstuvwx01",  // 0 and 1 are not base32
            "snip_abcdefghijklmnop rstuvwx23",
        ] {
            assert_eq!(normalize(bad), Err(KeyError::Format), "{bad:?}");
        }
    }

    #[test]
    fn hint_shows_only_the_last_four_characters() {
        assert_eq!(hint(KEY), "snip_…wx23");
    }

    #[test]
    fn saves_loads_and_deletes() {
        let (_dir, path) = key_path();
        assert_eq!(load(&path), None);
        save(&path, KEY).unwrap();
        assert_eq!(load(&path), Some(KEY.to_string()));
        delete(&path).unwrap();
        assert_eq!(load(&path), None);
        delete(&path).unwrap();
    }

    #[test]
    fn the_file_is_readable_only_by_the_user() {
        let (_dir, path) = key_path();
        save(&path, KEY).unwrap();
        let mode = fs::metadata(&path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600);
        assert!(!path.with_extension("tmp").exists());
    }

    #[test]
    fn a_damaged_file_counts_as_no_key() {
        let (_dir, path) = key_path();
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, "not a key").unwrap();
        assert_eq!(load(&path), None);
    }
}
