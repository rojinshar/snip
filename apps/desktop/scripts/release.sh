#!/usr/bin/env bash
# Builds a Developer ID signed and notarized Snip .dmg (docs/beta-v1.md, milestone B4).
#
#   npm run release:desktop        (from the repo root)
#
# Needs in the repo-root .env (never committed):
#   APPLE_SIGNING_IDENTITY   "Developer ID Application: <Org> (<TEAMID>)", in the login keychain
#   APPLE_API_ISSUER         App Store Connect API issuer ID
#   APPLE_API_KEY            App Store Connect API key ID
#   APPLE_API_KEY_PATH       path to AuthKey_<KEYID>.p8 (outside the repo)
#   TAURI_SIGNING_PRIVATE_KEY           path to the updater key (~/.tauri/snip-updater.key)
#   TAURI_SIGNING_PRIVATE_KEY_PASSWORD  its password
#
# Tauri signs the app with the hardened runtime and notarizes it when these are set. This
# script then signs, notarizes and staples the .dmg, and checks both with Apple's tools.
# Tauri also writes the update archive (Snip.app.tar.gz) and its updater signature (.sig),
# which npm run publish:desktop uploads.
set -euo pipefail

# Notarization can wait on Apple for many minutes; keep the Mac from idle-sleeping and
# dropping the connection meanwhile.
if [[ -z "${SNIP_RELEASE_CAFFEINATED:-}" ]]; then
  exec env SNIP_RELEASE_CAFFEINATED=1 caffeinate -i "$0" "$@"
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
DESKTOP="$REPO_ROOT/apps/desktop"
BUNDLE="$DESKTOP/src-tauri/target/release/bundle"

SETTINGS=(APPLE_SIGNING_IDENTITY APPLE_API_ISSUER APPLE_API_KEY APPLE_API_KEY_PATH
  TAURI_SIGNING_PRIVATE_KEY TAURI_SIGNING_PRIVATE_KEY_PASSWORD)

# Export only these settings from .env, without echoing them.
while IFS='=' read -r name value; do
  case "$name" in
    APPLE_SIGNING_IDENTITY | APPLE_API_ISSUER | APPLE_API_KEY | APPLE_API_KEY_PATH | \
      TAURI_SIGNING_PRIVATE_KEY | TAURI_SIGNING_PRIVATE_KEY_PASSWORD)
      value="${value%\"}"
      value="${value#\"}"
      export "$name=${value/#\~/$HOME}"
      ;;
  esac
done < "$REPO_ROOT/.env"

for name in "${SETTINGS[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "error: $name is not set in $REPO_ROOT/.env" >&2
    exit 1
  fi
done
[[ -f "$APPLE_API_KEY_PATH" ]] || { echo "error: no file at APPLE_API_KEY_PATH" >&2; exit 1; }
[[ -f "$TAURI_SIGNING_PRIVATE_KEY" ]] || { echo "error: no file at TAURI_SIGNING_PRIVATE_KEY" >&2; exit 1; }
security find-identity -v -p codesigning | grep -qF "$APPLE_SIGNING_IDENTITY" ||
  { echo "error: signing identity not found or not valid in the keychain" >&2; exit 1; }

notary=(--key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY" --issuer "$APPLE_API_ISSUER")

# A temporary disk left mounted by an earlier failed run makes the .dmg step fail.
for volume in /Volumes/dmg.*; do
  [[ -d "$volume" ]] && hdiutil detach "$volume" -force -quiet || true
done
rm -f "$BUNDLE"/macos/rw.*.dmg

echo "==> Building, signing and notarizing Snip.app"
# CI=true makes Tauri skip the Finder-scripted .dmg layout: it opened a window on screen
# mid-build and failed whenever that window was touched or closed.
(cd "$DESKTOP" && CI=true npx tauri build)

app="$BUNDLE/macos/Snip.app"
dmg="$(ls -t "$BUNDLE"/dmg/Snip_*.dmg | head -1)"

echo "==> Signing, notarizing and stapling $(basename "$dmg")"
codesign --force --timestamp --sign "$APPLE_SIGNING_IDENTITY" "$dmg"
xcrun notarytool submit "$dmg" "${notary[@]}" --wait
xcrun stapler staple "$dmg"

echo "==> Verifying"
codesign --verify --deep --strict "$app"
xcrun stapler validate "$app"
xcrun stapler validate "$dmg"
[[ -f "$app.tar.gz" && -f "$app.tar.gz.sig" ]] ||
  { echo "error: update archive or its signature is missing" >&2; exit 1; }
spctl --assess --type execute --verbose=2 "$app"
spctl --assess --type open --context context:primary-signature --verbose=2 "$dmg"

# The .dmg holds its own copy. Removing the build copy keeps Spotlight from listing a second
# Snip next to the installed one.
rm -rf "$app"

echo "==> Ready to distribute: $dmg"
echo "    Update archive: $app.tar.gz (publish both with npm run publish:desktop)"
