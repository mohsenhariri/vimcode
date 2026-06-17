# VimCode

Keyboard-first navigation for VS Code, inspired by Vimium. This extension adds visible hint labels in the active editor and a Vimium-style IDE hint mode for open editor tabs, Activity Bar entries, Explorer buttons, panels, terminals, and focused lists or trees.

This project is not affiliated with Vimium.

## Features

- `Vimium: Show Editor Navigation Hints` overlays hint labels on visible editor lines.
- Type the shown label to jump the cursor directly to that line.
- `Esc` cancels hint mode, `Backspace` edits the typed label, and `Enter` accepts the remaining exact target.
- `Vimium: Show IDE Navigation Hints` assigns labels to current editor tabs, Activity Bar targets, Explorer controls, tree/list actions, global navigation, panels, terminals, status bar focus, and settings.
- When VS Code is launched through the Vimium wrapper, IDE hints use an experimental DOM overlay that draws labels directly over visible workbench buttons, tabs, rows, and controls.
- If the DOM overlay endpoint is unavailable, IDE hints fall back to the supported command-backed hint HUD/list.
- IDE hints auto-run when you type the exact displayed label.
- Direct wrapper commands are contributed for Activity Bar views, Side Bar focus, Explorer toolbar actions, tree/list movement, panels, terminal, status bar, and editor switching.

## Activation

The editor is a text input, so a bare letter must always be able to type that letter. VimCode therefore never hijacks plain keys while you are editing. Hints are activated differently depending on what has focus:

- **Outside the editor area** (Side Bar, Activity Bar, panels, focused lists/trees): a bare `f` is safe and Vimium-like, so `f` and `Shift+F` show the IDE hints directly. These keys deliberately do **not** fire while focus is in a text editor, an input box, the terminal, or any webview-based UI from another extension (e.g. chat panels, docked anywhere), so they never swallow text you type there.
- **Inside the editor**: use `Alt+J` for a one-shot editor line-jump, or enter **command mode** first (see below) where `f` shows IDE hints and `g f` shows editor line-jump hints.
- **Inside a webview-based tab** (another extension's UI, e.g. a chat panel): bare keys can't be used there (they'd type into that UI), so press `Alt+J` to show IDE hints — VimCode takes focus from the webview so you can type the hint label. Some webviews (e.g. some chat panels) **swallow `Alt` shortcuts** and never forward them to VS Code; in that case use the Command Palette instead: `Ctrl+Shift+P` → **"Vimium: Show IDE Navigation Hints"**, which also takes focus from the webview and draws the overlay. (`Esc`-then-`f` can't work inside a webview: `Esc` belongs to that UI and command mode needs a real text editor.)

> **Why `Alt+J` and not `Alt+F`?** On Windows/Linux, `Alt`+a menu letter (`F`/`E`/`S`/`V`/`G`/`R`/`T`/`H`) opens that menu, and the mnemonic runs *before* extension keybindings — so `Alt+F` would just open the File menu. `Alt+J` isn't a menu letter, so it's free without disabling any VS Code setting. Rebind `vimiumCode.enterHintMode` / `vimiumCode.openWorkbenchHints` via Keyboard Shortcuts if it clashes with another extension.

### Editor command mode

Because VS Code has no native Vim "normal mode", VimCode adds a small modal layer for the editor. Press `Esc` (when no suggestion/find widget is open and nothing is selected) to enter command mode — a `-- COMMAND --` indicator appears in the status bar and the cursor becomes a block. While in command mode, single keys navigate instead of inserting text:

- `f` / `Shift+F` show **IDE hints** over the workbench (Activity Bar, Side Bar, tabs, panels, status bar).
- `g f` shows **editor line-jump hints** for the visible lines.
- `h`/`j`/`k`/`l` move the cursor; `i`/`a`/`o`/`Esc` return to editing.

> **Labeling the left navbar/sidebar requires the experimental DOM overlay.** VS Code's extension API cannot draw over the workbench chrome, so IDE hints only render as an on-screen overlay (rather than a Quick Pick list) when VS Code is launched with `--remote-debugging-port` — see [Experimental Direct Workbench Overlays](#experimental-direct-workbench-overlays). Launch with `./scripts/code --vim .` (or `code-insiders --vim .`) to enable it.

## Default Keys

| Key | Action | When |
| --- | --- | --- |
| `f` | Show IDE hints | Non-editor focus (Side Bar, Activity Bar, panels, etc.) |
| `Shift+F` | Show IDE hints | Non-editor focus, or editor command mode |
| `Alt+J` | Show editor line-jump hints | Editor focus (always available) |
| `Alt+J` | Show IDE hints (takes focus from the webview) | Inside a webview-based tab (chat panels, etc.) |
| `Esc` | Enter editor command mode | Editor focus, when `Esc` has nothing else to dismiss |
| `f` / `Shift+F` | Show IDE hints (navbar overlay when launched with the debug port) | Editor command mode |
| `g f` | Show editor line-jump hints | Editor command mode |
| `h` / `j` / `k` / `l` | Move cursor left/down/up/right | Editor command mode |
| `Backspace` | Move cursor left | Editor command mode |
| `Ctrl+D` / `Ctrl+U` | Scroll down/up | Editor command mode |
| `g g` / `Shift+G` | Go to top/bottom | Editor command mode |
| `i` / `a` / `o` | Resume editing (insert / append / open line below) | Editor command mode |
| `Esc` | Exit command mode | Editor command mode |
| `j` / `k` | Move down/up in focused VS Code list or tree | List/tree focus outside the editor |
| `h` / `l` | Collapse/expand focused tree item | List/tree focus outside the editor |
| `g e`, `g s`, `g c`, `g r`, `g x`, `g t` | Focus Explorer, Search, Source Control, Run and Debug, Extensions, or terminal | Non-editor focus |
| `Esc` | Cancel hint mode | Hint mode |
| `Backspace` | Delete typed hint character | Hint mode |
| `Enter` | Accept hint | Hint mode |
| `a`-`z`, `0`-`9` | Type hint character | Hint mode |

## Known Issues

A few behaviors are inherent limitations of the VS Code API or of how other extensions handle the keyboard — see [KNOWN_ISSUES.md](KNOWN_ISSUES.md) for details:

- The on-screen overlay over the IDE chrome (Activity Bar, Side Bar, tabs) needs VS Code launched with `--remote-debugging-port`; otherwise IDE hints fall back to a Quick Pick list.
- Inside another extension's **webview** (e.g. chat panels): bare keys can't be used and some webviews swallow `Alt` shortcuts — use the Command Palette → "Vimium: Show IDE Navigation Hints".
- `Alt+F` is reserved by the File-menu mnemonic, so hints use `Alt+J`.

## Experimental Direct Workbench Overlays

VS Code does not expose private workbench DOM through the normal extension API. For a closer Vimium-style mode, this extension can optionally connect to VS Code's local Chrome DevTools Protocol endpoint and inject a temporary overlay into the workbench renderer.

Use the included launcher wrappers to make this look like a normal VS Code or VS Code Insiders flag:

```sh
./scripts/code --vim .
./scripts/code-insiders --vim .
```

The wrappers remove `--vim` before launching VS Code and add `--remote-debugging-port=9333` internally. These forms are also accepted:

```sh
./scripts/code-insiders --vim=true .
./scripts/code-insiders --vim=1 .
./scripts/code-insiders --vim-port=9444 .
```

To make the command exactly `code-insiders --vim`, put this repository's `scripts/` directory before `/usr/bin` in your `PATH`, or symlink the wrapper into a directory that already comes first:

```sh
ln -sf /path/to/vs_code_vim/scripts/code-insiders ~/.local/bin/code-insiders
ln -sf /path/to/vs_code_vim/scripts/code ~/.local/bin/code
```

The wrapper skips itself and delegates to the real `code` or `code-insiders` binary. Then run `Vimium: Show IDE Navigation Hints` or press the configured IDE hint key. If the endpoint is available, labels are drawn directly over visible workbench controls and typing a label dispatches a DOM click. If the endpoint is not available, the extension falls back to the supported command-backed IDE hint HUD/list.

The local DevTools port is powerful; only enable it on a trusted machine and do not expose it beyond localhost.

## Settings

- `vimiumCode.hintCharacters`: characters used to generate labels. Default: `asdfghjklqwertyuiopzxcvbnm`.
- `vimiumCode.maxEditorHints`: maximum visible editor line targets per session. Default: `250`.
- `vimiumCode.includeBlankLines`: include blank visible lines as targets. Default: `false`.
- `vimiumCode.autoAcceptExactHint`: jump as soon as the typed label exactly matches a target. Default: `true`.
- `vimiumCode.preferWorkbenchDomOverlay`: try experimental direct workbench DOM labels before falling back to the supported IDE hint HUD/list. Default: `true`.
- `vimiumCode.workbenchDomOverlayDebugPort`: local DevTools port for experimental direct workbench DOM labels. Default: `9333`.

Only letters and digits have default hint-mode keybindings. If you add punctuation to `vimiumCode.hintCharacters`, bind `vimiumCode.typeHintCharacter` manually with the desired `{ "character": "..." }` argument.

## Development

```sh
npm install
npm run compile
npm test
```

Use the `Run Extension` launch configuration in VS Code to start an Extension Development Host.

## Package

```sh
npm run vsix
```

The extension is bundled into `dist/extension.js` with `vscode` kept external, as required for VS Code extensions.
