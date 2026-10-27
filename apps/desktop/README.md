# apps/desktop

Snip's macOS menu-bar app, built with [Tauri 2](https://v2.tauri.app). Design:
[docs/desktop-v0.md](../../docs/desktop-v0.md).

**Status: M5.** Press `⌘⇧2` (or use the menu-bar ∫ icon → Snip Equation), drag a box over an
equation, and the LaTeX lands on your clipboard as `$…$`, with a notification showing what
was copied. While it works, `…` appears next to the menu-bar icon. **Settings…** in the menu
changes the hotkey and the delimiters; they are saved to
`~/Library/Application Support/com.rojinsharma.snip/settings.json`.

**API:** release builds (`npm run build:desktop`) use the hosted API at
`https://api.snip.rojinsharma.com`, which needs an access key: paste it under **Settings… →
Access key**. It is saved to `~/Library/Application Support/com.rojinsharma.snip/access-key`,
readable only by you, and never in `settings.json`. Debug builds
(`npm run dev:desktop`) use the local API (`npm run dev:api`, no key needed). `SNIP_API_URL`
overrides either.

## Requirements

- macOS 13+
- Rust (stable) and the Xcode command-line tools
- Node.js 22 (repo `.nvmrc`)

## Commands

From the repo root:

| Command                                  | What it does                                                            |
| ---------------------------------------- | ----------------------------------------------------------------------- |
| `npm run dev:desktop`                    | Run the app in development mode                                         |
| `npm run build:desktop`                  | Build `Snip.app` and the `.dmg` (in `src-tauri/target/release/bundle/`) |
| `npm run test --workspace @snip/desktop` | Rust unit tests (settings UI tests run with the root `npm test`)        |
| `npm run lint --workspace @snip/desktop` | `cargo clippy`, warnings as errors                                      |

End-to-end check against a running API, using the app's own resize and upload code:

```sh
cd apps/desktop/src-tauri
SNIP_E2E_IMAGE=/path/to/equation.png cargo test --release e2e -- --ignored --nocapture
```

## Diagnostics

- **Timings:** each snip appends one JSON line (prepare, request, server and total ms, size,
  engine; never the image or the LaTeX) to
  `~/Library/Logs/com.rojinsharma.snip/snips.jsonl`.
- **Captures** are deleted after each snip. Set `SNIP_KEEP_CAPTURES=1` to keep them in
  `~/Library/Caches/com.rojinsharma.snip/captures/`.

## Release build (signed and notarized)

```sh
npm run release:desktop
```

Builds `Snip_<version>_aarch64.dmg` signed with the Developer ID of Simple Storage LLC
(team `2S5B4HX685`), notarized by Apple, with the ticket stapled to both the app and the
`.dmg`, then verifies them with `codesign`, `stapler` and `spctl`. It needs the `APPLE_*`
values in the root `.env` (see `.env.example`): the signing identity in the login keychain
and an App Store Connect API key (`.p8`, kept in `~/.appstoreconnect/`, never in the repo).
The script keeps the Mac awake with `caffeinate`, since Apple can take minutes to answer.

Because the signature is stable, the Screen Recording grant survives updates, and the app
opens without security warnings.

## Local build (ad hoc signed)

```sh
npm run build:desktop
```

For quick local testing; no Apple account needed. The bundle is ad-hoc signed
(`signingIdentity: "-"` in `tauri.conf.json`), and that signature changes on every build, so:

- **First launch:** macOS may say it can't verify the developer. Open **System Settings →
  Privacy & Security** and click **Open Anyway**.
- **Screen Recording:** after installing a new local build, run
  `npm run reset:desktop-permission` (quits Snip, runs
  `tccutil reset ScreenCapture com.rojinsharma.snip`, relaunches), then grant it again and
  choose **Restart Snip** from the ∫ menu. macOS only applies a grant after a relaunch.
- **`npm run dev:desktop`:** in development, macOS attributes Screen Recording to the
  terminal app that started it (Terminal, iTerm or VS Code), so grant it there.

Check which identity a build used with
`codesign -dv /Applications/Snip.app 2>&1 | grep Authority`.

## Layout

| Path                               | What                                                              |
| ---------------------------------- | ----------------------------------------------------------------- |
| `src-tauri/src/lib.rs`             | App setup: tray menu, global shortcut, snip flow, notifications   |
| `src-tauri/src/capture.rs`         | `screencapture -i` wrapper (unit-tested)                          |
| `src-tauri/src/api.rs`             | Client for `POST /v1/recognize`; maps API error codes             |
| `src-tauri/src/image_prep.rs`      | Downscales captures to at most 2000 px before upload              |
| `src-tauri/src/format.rs`          | Clipboard delimiters and notification previews                    |
| `src-tauri/src/metrics.rs`         | Per-snip timing log                                               |
| `src-tauri/src/permissions.rs`     | Screen Recording checks (CoreGraphics)                            |
| `src-tauri/src/settings.rs`        | Settings file: load, save, hotkey validation                      |
| `src-tauri/src/settings_window.rs` | Settings window and the commands it calls                         |
| `src-tauri/tauri.conf.json`        | Bundle config (identifier, icons, targets)                        |
| `src-tauri/Info.plist`             | `LSUIElement`: menu-bar only                                      |
| `src-tauri/icons/`                 | App icons (`source-1024.png` is the master) and the tray template |
| `ui/`                              | Settings window (Vite + TypeScript); built into `dist/`           |
| `test/`                            | Vitest tests for the settings window                              |
| `QA.md`                            | Manual test checklist                                             |
