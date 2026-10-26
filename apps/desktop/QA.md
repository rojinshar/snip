# Manual QA checklist

Run this on a build installed from the `.dmg`, before merging any milestone that touches
capture or permissions. Mark each item ✅/❌ in the PR description.

## M1: shell and capture

- [ ] Launch: the ∫ icon appears in the menu bar; there is no Dock icon.
- [ ] The menu shows **Snip Equation ⌘⇧2** and **Quit Snip ⌘Q**.
- [ ] First snip without permission: the system prompt appears; System Settings opens at
      Screen Recording; the notification explains what to do.
- [ ] After granting access and retrying: the crosshair appears.
- [ ] Drag a box over an equation: the capture contains the equation, not just the
      wallpaper (check with `SNIP_KEEP_CAPTURES=1`).
- [ ] Press `Esc` during selection: no notification, no file.
- [ ] `⌘⇧2` works while each of these is focused: Preview (PDF), Chrome, VS Code, Obsidian,
      Finder.
- [ ] Press `⌘⇧2` twice quickly: only one capture starts.
- [ ] External display: capture a region on the second screen.
- [ ] **Quit Snip** exits the app, and the icon disappears.

## M3: recognition and clipboard

Start the API first: `npm run dev:api`.

- [ ] Snip a single-line equation: `…` shows next to the icon, then "Copied to clipboard" with
      a preview; ⌘V pastes `$…$` LaTeX that compiles in Overleaf.
- [ ] Snip a multi-line aligned equation: it pastes as one `\begin{aligned}…` block.
- [ ] Snip something with no math (wallpaper, plain text): "No equation found", and the
      clipboard keeps its previous content.
- [ ] Stop the API and snip: "Snip couldn't reach the server", clipboard unchanged.
- [ ] Press ⌘⇧2 while a snip is still processing: it is ignored; no second capture.
- [ ] After 20 real snips: check `~/Library/Logs/io.github.rojinshar.snip/snips.jsonl` and
      record p50/p95 `total_ms` in the PR (target: p50 < 2000, p95 < 3000).
- [ ] The captures folder stays empty after snips (files are deleted).
