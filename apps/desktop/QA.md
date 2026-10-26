# Manual QA checklist

Run this on a build installed from the `.dmg`, before merging any milestone that touches
capture or permissions. Mark each item ✅/❌ in the PR description.

## M1: shell and capture

- [ ] Launch: the ∫ icon appears in the menu bar; there is no Dock icon.
- [ ] The menu shows **Snip Equation ⌘⇧2** and **Quit Snip ⌘Q**.
- [ ] First snip without permission: the system prompt appears; System Settings opens at
      Screen Recording; the notification explains what to do.
- [ ] After granting access and retrying: the crosshair appears.
- [ ] Drag a box: a notification shows `W×H region saved.`, and the PNG in
      `~/Library/Caches/io.github.rojinshar.snip/captures/` contains the equation (not just
      the wallpaper).
- [ ] Press `Esc` during selection: no notification, no file.
- [ ] `⌘⇧2` works while each of these is focused: Preview (PDF), Chrome, VS Code, Obsidian,
      Finder.
- [ ] Press `⌘⇧2` twice quickly: only one capture starts.
- [ ] External display: capture a region on the second screen.
- [ ] **Quit Snip** exits the app, and the icon disappears.
