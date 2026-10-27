//! User settings (docs/desktop-v0.md §14), stored as JSON in the app config directory.
//! Rust owns the file: the settings window changes it only through commands.

use std::fs;
use std::io;
use std::path::Path;
use std::str::FromStr;

use serde::{Deserialize, Serialize};
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};

use crate::format::Delimiters;

pub const FILE_NAME: &str = "settings.json";

/// ⌘⇧2 (docs/desktop-v0.md §13). Same syntax as menu accelerators, so it doubles as the
/// menu item's shortcut label.
pub const DEFAULT_HOTKEY: &str = "Cmd+Shift+Digit2";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub hotkey: String,
    pub delimiters: Delimiters,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            hotkey: DEFAULT_HOTKEY.into(),
            delimiters: Delimiters::default(),
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum HotkeyError {
    Invalid,
    /// Shift alone is not enough: the key would stop typing its character system-wide.
    NeedsModifier,
}

impl HotkeyError {
    pub fn message(&self) -> &'static str {
        match self {
            Self::Invalid => "That key combination isn't supported.",
            Self::NeedsModifier => "Include ⌘, ⌃ or ⌥ so the hotkey doesn't replace normal typing.",
        }
    }
}

pub fn parse_hotkey(hotkey: &str) -> Result<Shortcut, HotkeyError> {
    let shortcut = Shortcut::from_str(hotkey).map_err(|_| HotkeyError::Invalid)?;
    if !shortcut
        .mods
        .intersects(Modifiers::SUPER | Modifiers::CONTROL | Modifiers::ALT)
    {
        return Err(HotkeyError::NeedsModifier);
    }
    if is_modifier_key(shortcut.key) {
        return Err(HotkeyError::Invalid);
    }
    Ok(shortcut)
}

fn is_modifier_key(code: Code) -> bool {
    matches!(
        code,
        Code::MetaLeft
            | Code::MetaRight
            | Code::ControlLeft
            | Code::ControlRight
            | Code::AltLeft
            | Code::AltRight
            | Code::ShiftLeft
            | Code::ShiftRight
    )
}

/// Reads the settings file. Never fails: a missing file means defaults, and an unreadable or
/// invalid one is logged and ignored, so a bad file can't stop Snip from launching.
pub fn load(path: &Path) -> Settings {
    let text = match fs::read_to_string(path) {
        Ok(text) => text,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Settings::default(),
        Err(error) => {
            log::warn!("could not read {}: {error}; using defaults", path.display());
            return Settings::default();
        }
    };
    let mut settings: Settings = match serde_json::from_str(&text) {
        Ok(settings) => settings,
        Err(error) => {
            log::warn!("invalid {}: {error}; using defaults", path.display());
            return Settings::default();
        }
    };
    if let Err(error) = parse_hotkey(&settings.hotkey) {
        log::warn!(
            "invalid hotkey {:?} ({error:?}); using {DEFAULT_HOTKEY}",
            settings.hotkey
        );
        settings.hotkey = DEFAULT_HOTKEY.into();
    }
    settings
}

/// Writes atomically (temp file, then rename), so a crash mid-write can't corrupt the file.
pub fn save(path: &Path, settings: &Settings) -> io::Result<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let json = serde_json::to_string_pretty(settings).map_err(io::Error::other)?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, json)?;
    fs::rename(&tmp, path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn settings_path() -> (tempfile::TempDir, std::path::PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(FILE_NAME);
        (dir, path)
    }

    #[test]
    fn default_hotkey_is_cmd_shift_2() {
        assert_eq!(
            parse_hotkey(DEFAULT_HOTKEY),
            Ok(Shortcut::new(
                Some(Modifiers::SUPER | Modifiers::SHIFT),
                Code::Digit2
            ))
        );
    }

    #[test]
    fn hotkeys_need_a_non_shift_modifier() {
        assert!(parse_hotkey("Ctrl+Alt+KeyL").is_ok());
        assert_eq!(parse_hotkey("Shift+KeyA"), Err(HotkeyError::NeedsModifier));
        assert_eq!(parse_hotkey("KeyA"), Err(HotkeyError::NeedsModifier));
    }

    #[test]
    fn rejects_unparseable_and_modifier_only_hotkeys() {
        assert_eq!(parse_hotkey(""), Err(HotkeyError::Invalid));
        assert_eq!(parse_hotkey("Cmd+Banana"), Err(HotkeyError::Invalid));
        assert_eq!(parse_hotkey("Cmd+ShiftLeft"), Err(HotkeyError::Invalid));
    }

    #[test]
    fn missing_file_means_defaults() {
        let (_dir, path) = settings_path();
        assert_eq!(load(&path), Settings::default());
    }

    #[test]
    fn round_trips_through_the_file() {
        let (_dir, path) = settings_path();
        let settings = Settings {
            hotkey: "Ctrl+Alt+KeyL".into(),
            delimiters: Delimiters::DisplayBracket,
        };
        save(&path, &settings).unwrap();
        assert_eq!(load(&path), settings);
        assert!(!path.with_extension("json.tmp").exists());
    }

    #[test]
    fn stores_readable_json() {
        let (_dir, path) = settings_path();
        save(&path, &Settings::default()).unwrap();
        let json: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(
            json,
            serde_json::json!({ "hotkey": "Cmd+Shift+Digit2", "delimiters": "inlineDollar" })
        );
    }

    #[test]
    fn corrupt_file_falls_back_to_defaults() {
        let (_dir, path) = settings_path();
        fs::write(&path, "{ not json").unwrap();
        assert_eq!(load(&path), Settings::default());
    }

    #[test]
    fn partial_file_keeps_known_fields_and_ignores_unknown_ones() {
        let (_dir, path) = settings_path();
        fs::write(&path, r#"{ "delimiters": "none", "fromTheFuture": 1 }"#).unwrap();
        assert_eq!(
            load(&path),
            Settings {
                hotkey: DEFAULT_HOTKEY.into(),
                delimiters: Delimiters::None,
            }
        );
    }

    #[test]
    fn invalid_hotkey_in_file_falls_back_to_the_default_hotkey() {
        let (_dir, path) = settings_path();
        fs::write(
            &path,
            r#"{ "hotkey": "KeyA", "delimiters": "displayDollar" }"#,
        )
        .unwrap();
        assert_eq!(
            load(&path),
            Settings {
                hotkey: DEFAULT_HOTKEY.into(),
                delimiters: Delimiters::DisplayDollar,
            }
        );
    }
}
