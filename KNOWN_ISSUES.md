# Known Issues & Limitations

These are inherent limitations of the VS Code extension API and of how other
extensions handle the keyboard — not bugs in VimCode. They are documented here
so the behavior is predictable.

## 1. Drawing hints over the IDE chrome requires launching with a debug port

VS Code's extension API **cannot draw over the workbench chrome** (Activity Bar,
Side Bar, tabs, status bar). Editor decorations only work inside a text editor.

The on-screen IDE overlay (labels drawn directly over those controls) is provided
by an **experimental Chrome DevTools Protocol injection**, which only works when
VS Code is launched with `--remote-debugging-port`:

```sh
./scripts/code --vim .          # wrapper adds --remote-debugging-port=9333
```

Without the debug port, IDE hints (`f` / `Shift+F` outside the editor, or
command-mode / Command Palette) fall back to a searchable **Quick Pick list**
instead of an overlay. Everything still works; it just isn't drawn on top of the
chrome. See [README › Experimental Direct Workbench Overlays](README.md#experimental-direct-workbench-overlays).

The debug port is powerful — only enable it on a trusted machine, and never
expose it beyond `localhost`.

## 2. Triggering hints from inside another extension's webview (e.g. chat panels)

Some extension UIs (OpenAI Codex, chat panels, etc.) render inside a **webview
(iframe)**. A focused webview owns its keystrokes and only forwards *some* of
them to VS Code:

- **Bare keys** can't be used — they'd type into that UI (so VimCode deliberately
  ignores `f` there).
- **`Alt` combos are swallowed by some webviews** (confirmed with OpenAI Codex),
  so `Alt+J` never reaches VimCode.
- An extension cannot capture a key a webview refuses to forward. This is a hard
  boundary, not something VimCode can patch.

**Mouse-free workaround:** webviews forward `Ctrl+Shift+P`, so use the Command
Palette → **"Vimium: Show IDE Navigation Hints"**. VimCode takes focus from the
webview and draws the overlay so you can type a label to jump out.

`Esc`-then-`f` cannot work inside a webview: `Esc` belongs to the webview's own
UI, and command mode requires a real text editor (`editorTextFocus`).

## 3. `Alt+F` opens the File menu (menu mnemonic)

On Windows/Linux, `Alt` + a menu letter (`F` File, `E` Edit, `S` Selection,
`V` View, `G` Go, `R` Run, `T` Terminal, `H` Help) opens that menu, and the
mnemonic is handled **before** extension keybindings. That is why VimCode binds
hints to **`Alt+J`** (not a menu letter). To free an `Alt`+menu-letter for a
keybinding, set `"window.enableMenuBarMnemonics": false` in your settings.

## 4. Command mode is a lightweight emulation, not real Vim

VS Code has no native modal/normal mode. VimCode's **command mode** (`Esc` to
enter) is a small emulation: while active it owns the editor's `type` command
(to suppress text insertion) and the `Esc` key, and shows a `-- COMMAND --`
status-bar indicator. It is intentionally minimal — for full Vim emulation use a
dedicated Vim extension alongside VimCode.

## 5. DOM overlay activation caveats

When the experimental overlay is active:

- Native `<select>` dropdowns and some keyboard-only widgets only receive
  **focus** when a label is chosen — browsers block opening them via synthetic
  clicks. Use the keyboard once focused.
- The overlay relies on workbench DOM class names, which can change between VS
  Code versions; it is best-effort and clearly marked experimental.
