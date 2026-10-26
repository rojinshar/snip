# apps/desktop

Snip's macOS menu-bar app, built with [Tauri 2](https://v2.tauri.app). Design:
[docs/desktop-v0.md](../../docs/desktop-v0.md).

**Status: M3.** Press `⌘⇧2` (or use the menu-bar ∫ icon → Snip Equation), drag a box over an
equation, and the LaTeX lands on your clipboard as `$…$`, with a notification showing what
was copied. While it works, `…` appears next to the menu-bar icon.

The app needs the Snip API running: `npm run dev:api` in another terminal. It connects to
`http://127.0.0.1:8790` by default; set `SNIP_API_URL` to change that.

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
| `npm run test --workspace @snip/desktop` | Rust unit tests                                                         |
| `npm run lint --workspace @snip/desktop` | `cargo clippy`, warnings as errors                                      |

End-to-end check against a running API, using the app's own resize and upload code:

```sh
cd apps/desktop/src-tauri
SNIP_E2E_IMAGE=/path/to/equation.png cargo test --release e2e -- --ignored --nocapture
```

## Diagnostics

- **Timings:** each snip appends one JSON line (prepare, request, server and total ms, size,
  engine; never the image or the LaTeX) to
  `~/Library/Logs/io.github.rojinshar.snip/snips.jsonl`.
- **Captures** are deleted after each snip. Set `SNIP_KEEP_CAPTURES=1` to keep them in
  `~/Library/Caches/io.github.rojinshar.snip/captures/`.

## Install a local build

1. Run `npm run build:desktop`.
2. Open `apps/desktop/src-tauri/target/release/bundle/dmg/Snip_0.0.0_aarch64.dmg` and drag
   Snip into Applications.
3. Launch Snip from Applications. It lives in the menu bar (∫) and has no Dock icon.

Local builds are ad-hoc signed (`signingIdentity: "-"` in `tauri.conf.json`), which seals the
whole bundle without an Apple Developer account. Without it, the bundle's signature is
incomplete and macOS can refuse to open it from Finder. Because the signature is ad-hoc:

- **First launch:** macOS may say it can't verify the developer. Open **System Settings →
  Privacy & Security** and click **Open Anyway**.
- **Screen Recording:** the first snip asks for permission. Enable Snip under **Privacy &
  Security → Screen Recording**. Rebuilds change the ad-hoc signature, so macOS may ask
  again after each rebuild; signing fixes this in a later phase.
- **`npm run dev:desktop`:** in development, macOS attributes Screen Recording to the
  terminal app that started it (Terminal, iTerm or VS Code), so grant it there.

## Layout

| Path                           | What                                                              |
| ------------------------------ | ----------------------------------------------------------------- |
| `src-tauri/src/lib.rs`         | App setup: tray menu, global shortcut, snip flow, notifications   |
| `src-tauri/src/capture.rs`     | `screencapture -i` wrapper (unit-tested)                          |
| `src-tauri/src/api.rs`         | Client for `POST /v1/recognize`; maps API error codes             |
| `src-tauri/src/image_prep.rs`  | Downscales captures to at most 2000 px before upload              |
| `src-tauri/src/format.rs`      | Clipboard delimiters and notification previews                    |
| `src-tauri/src/metrics.rs`     | Per-snip timing log                                               |
| `src-tauri/src/permissions.rs` | Screen Recording checks (CoreGraphics)                            |
| `src-tauri/tauri.conf.json`    | Bundle config (identifier, icons, targets)                        |
| `src-tauri/Info.plist`         | `LSUIElement`: menu-bar only                                      |
| `src-tauri/icons/`             | App icons (`source-1024.png` is the master) and the tray template |
| `ui/`                          | Placeholder web UI; the settings window arrives in M5             |
| `QA.md`                        | Manual test checklist                                             |
