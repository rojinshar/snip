#!/usr/bin/env bash
# Publishes the release built by npm run release:desktop (docs/beta-v1.md §13).
#
#   npm run publish:desktop -- "What changed, in one line"
#
# 1. Uploads the .dmg and the update archive to the R2 bucket served at DOWNLOADS_URL.
# 2. Refreshes desktop/latest/Snip.dmg, the stable link the download page uses.
# 3. Writes apps/web/public/updates/latest.json, which installed copies poll.
#
# Nothing reaches users until latest.json is committed and pushed (the website deploys it).
set -euo pipefail

BUCKET="snip-releases"
DOWNLOADS_URL="https://downloads.snip.rojinsharma.com"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
DESKTOP="$REPO_ROOT/apps/desktop"
BUNDLE="$DESKTOP/src-tauri/target/release/bundle"
LATEST_JSON="$REPO_ROOT/apps/web/public/updates/latest.json"
NOTES="${1:-Bug fixes and improvements.}"

version="$(node -p "require('$DESKTOP/src-tauri/tauri.conf.json').version")"
dmg="$BUNDLE/dmg/Snip_${version}_aarch64.dmg"
archive="$BUNDLE/macos/Snip.app.tar.gz"

for file in "$dmg" "$archive" "$archive.sig"; do
  [[ -f "$file" ]] || { echo "error: $file not found; run npm run release:desktop first" >&2; exit 1; }
done
if [[ -f "$LATEST_JSON" ]] && [[ "$(node -p "require('$LATEST_JSON').version")" == "$version" ]]; then
  echo "error: $version is already published; bump the version for a new release" >&2
  exit 1
fi

prefix="desktop/$version"
archive_key="$prefix/Snip_${version}_aarch64.app.tar.gz"
put() { # key, file, content type, cache control
  (cd "$REPO_ROOT/apps/api" && npx wrangler r2 object put "$BUCKET/$1" --file "$2" \
    --content-type "$3" --cache-control "$4" --remote >/dev/null)
  echo "    uploaded $1"
}

echo "==> Uploading $version to R2 ($BUCKET)"
# Versioned files never change, so they can be cached for good. The "latest" copy can't.
put "$prefix/Snip_${version}_aarch64.dmg" "$dmg" application/x-apple-diskimage "public, max-age=31536000, immutable"
put "$archive_key" "$archive" application/gzip "public, max-age=31536000, immutable"
put "desktop/latest/Snip.dmg" "$dmg" application/x-apple-diskimage "no-cache"

echo "==> Checking the uploads are reachable"
for key in "$archive_key" "desktop/latest/Snip.dmg"; do
  status="$(curl -s -o /dev/null -w "%{http_code}" -I "$DOWNLOADS_URL/$key")"
  [[ "$status" == 200 ]] || { echo "error: $DOWNLOADS_URL/$key returned $status" >&2; exit 1; }
done

echo "==> Writing $LATEST_JSON"
mkdir -p "$(dirname "$LATEST_JSON")"
VERSION="$version" NOTES="$NOTES" URL="$DOWNLOADS_URL/$archive_key" \
  SIGNATURE="$(cat "$archive.sig")" node -e '
    const manifest = {
      version: process.env.VERSION,
      notes: process.env.NOTES,
      pub_date: new Date().toISOString(),
      platforms: {
        "darwin-aarch64": { signature: process.env.SIGNATURE, url: process.env.URL },
      },
    };
    process.stdout.write(JSON.stringify(manifest, null, 2) + "\n");
  ' > "$LATEST_JSON"

echo "==> Published $version to R2. Commit and push apps/web/public/updates/latest.json to"
echo "    release it; installed copies pick it up within a day, or via Check for Updates."
