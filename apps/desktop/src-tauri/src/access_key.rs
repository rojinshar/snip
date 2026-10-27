//! The tester's access key (docs/beta-v1.md §4), kept in the macOS Keychain rather than in
//! settings.json.

use security_framework::passwords::{
    delete_generic_password, get_generic_password, set_generic_password,
};

const SERVICE: &str = "io.github.rojinshar.snip";
const ACCOUNT: &str = "access-key";
const PREFIX: &str = "snip_";
const RANDOM_LEN: usize = 26;
/// `errSecItemNotFound`.
const NOT_FOUND: i32 = -25300;

#[derive(Debug, PartialEq, Eq)]
pub enum KeyError {
    Format,
    Keychain(String),
}

impl KeyError {
    pub fn message(&self) -> &'static str {
        match self {
            Self::Format => {
                "That doesn't look like a Snip access key (snip_ and 26 letters or digits)."
            }
            Self::Keychain(_) => "Couldn't use the Keychain. Try again.",
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

/// The saved key, or None if there is none or the Keychain can't be read.
pub fn load() -> Option<String> {
    match get_generic_password(SERVICE, ACCOUNT) {
        Ok(bytes) => String::from_utf8(bytes).ok(),
        Err(error) if error.code() == NOT_FOUND => None,
        Err(error) => {
            log::warn!("could not read the access key: {error}");
            None
        }
    }
}

pub fn save(key: &str) -> Result<(), KeyError> {
    set_generic_password(SERVICE, ACCOUNT, key.as_bytes())
        .map_err(|error| KeyError::Keychain(error.to_string()))
}

pub fn delete() -> Result<(), KeyError> {
    match delete_generic_password(SERVICE, ACCOUNT) {
        Ok(()) => Ok(()),
        Err(error) if error.code() == NOT_FOUND => Ok(()),
        Err(error) => Err(KeyError::Keychain(error.to_string())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const KEY: &str = "snip_abcdefghijklmnopqrstuvwx23";

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
}
