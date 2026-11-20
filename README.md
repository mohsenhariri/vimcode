# VimCode

Keyboard-first navigation for VS Code, inspired by [Vimium](https://github.com/philc/vimium). This extension adds visible hint labels in the active editor and a Vimium-style IDE hint mode for open editor tabs, Activity Bar entries, Explorer buttons, panels, terminals, and focused lists or trees.

## Install

Search for `harimo9.vimcode` in the Extensions view, or install VimCode from the command line. [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=harimo9.vimcode)

```sh
code --install-extension harimo9.vimcode
```

### Install from source

Use Node.js 24. From the root of your VimCode checkout, build and install the VSIX.

```sh
npm ci
npm run vsix -- --out vimcode.vsix
code --install-extension ./vimcode.vsix
```

For VS Code Insiders, use `code-insiders` in the last command. You can also open the Extensions view menu and choose **Install from VSIX…**.

#### Optional launcher wrappers

The VS Code extension API does not expose the workbench DOM. VimCode can use the local Chrome DevTools Protocol endpoint to draw a temporary overlay with hint labels over workbench controls.

Fully quit VS Code, then run one of the included Bash launchers from your checkout.

```sh
./scripts/code --vim .
./scripts/code-insiders --vim .
```

The wrappers consume `--vim` and launch VS Code with `--remote-debugging-port=9333` by default. They also accept these forms.

```sh
./scripts/code-insiders --vim=true .
./scripts/code-insiders --vim=1 .
./scripts/code-insiders --vim-port=9444 .
```

To run `code --vim` or `code-insiders --vim` from any directory, add the checkout's `scripts/` directory ahead of the VS Code executables on `PATH`. From the checkout root, run this in your shell.

```sh
export PATH="$(pwd -P)/scripts:$PATH"
```

You can also create symlinks in a directory that already comes first on `PATH`. These examples use `$HOME/.local/bin`.

```sh
mkdir -p "$HOME/.local/bin"
ln -s "$(pwd -P)/scripts/code-insiders" "$HOME/.local/bin/code-insiders"
ln -s "$(pwd -P)/scripts/code" "$HOME/.local/bin/code"
```

Each wrapper skips itself when looking for the actual VS Code executable on `PATH`. See [overlay setup](#experimental-direct-workbench-overlays) for trusted workspaces, custom ports, and the fallback picker.

## Features

- `Vimium: Show Editor Navigation Hints` overlays hint labels on visible editor lines.
- Type the shown label to jump the cursor directly to that line.
- `Esc` cancels hint mode, `Backspace` edits the typed label, and `Enter` accepts the remaining exact target.
- `Vimium: Show IDE Navigation Hints` assigns labels to current editor tabs, Activity Bar targets, Explorer controls, tree/list actions, global navigation, panels, terminals, status bar focus, and settings.
- The [experimental overlay](#experimental-direct-workbench-overlays) draws IDE hint labels directly over visible workbench buttons, tabs, rows, and controls.
- If the DOM overlay endpoint is unavailable, IDE hints fall back to the supported command-backed hint HUD/list.
- IDE hints auto-run when you type the exact displayed label.
- Direct wrapper commands are contributed for Activity Bar views, Side Bar focus, Explorer toolbar actions, tree/list movement, panels, terminal, status bar, and editor switching.

## Activation

- In a **document editor**, press `Alt+J` and type the label beside a line. The cursor lands on its first non-whitespace character.
- At a **terminal prompt**, press `Alt+J` for IDE hints. Press `Esc` to return to the prompt. If the terminal panel is visible while the editor has focus, `Alt+J` still shows editor line hints.
- In a **focused workbench list, tree, or status bar**, press `f` or `Shift+F` for IDE hints. In other workbench areas, use `Alt+J` or run **Vimium: Show IDE Navigation Hints** from the Command Palette.
- In **Codex or another extension webview**, type normally. To leave the view with hints, press `F1` and run **Vimium: Show IDE Navigation Hints**. `Alt+J` also works when the webview forwards the shortcut. The picker offers **Codex** when its sidebar command is available and **Open View…** for other installed views. Open webview tabs appear alongside document tabs.
- In the **IDE hint picker**, type a displayed label, or use the arrow keys and press `Enter`. Labels stay fixed until the picker closes. Reopen it to see newly opened tabs and terminals.

### Editor command mode

Press `Esc` in a document editor to enter command mode when there is no selection or widget to dismiss. A block cursor and the `-- COMMAND --` status item indicate the mode. Use `h`, `j`, `k`, and `l` to move. Press `f` for IDE hints, `g f` for line hints, or `i` to resume editing. Command mode uses editor keybindings and leaves VS Code’s shared typing command available to other extensions.

## Default Keys

| Key | Action | When |
| --- | --- | --- |
| `f` | Show IDE hints | Focused workbench list, tree, or status bar |
| `Shift+F` | Show IDE hints | Focused workbench list, tree, status bar, or editor command mode |
| `Alt+J` | Show editor line-jump hints | Document editor focus |
| `Alt+J` | Show IDE hints | Integrated terminal, workbench chrome, or webview forwarding the shortcut |
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
| `g e`, `g s`, `g c`, `g r`, `g x`, `g t` | Focus Explorer, Search, Source Control, Run and Debug, Extensions, or terminal | Focused workbench list, tree, or status bar |
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

To show hint labels directly over the workbench, fully quit desktop VS Code and launch it with a local debugging port.

```sh
code --remote-debugging-port=9333 .
```

Use `code-insiders` for VS Code Insiders. In a trusted workspace, run **Vimium: Show IDE Navigation Hints** or press the configured IDE hint key, then type a label to activate its control.

Keep the debugging endpoint on loopback. To use a custom port, set `vimiumCode.workbenchDomOverlayDebugPort` to the same number in User Settings. Fully quit VS Code before changing its launch flags, or start it with a separate `--user-data-dir`. VimCode uses the IDE hint picker when the endpoint is unavailable, including on a normal launch or in Restricted Mode.

## Settings

- `vimiumCode.hintCharacters`: characters used to generate labels. Default: `asdfghjklqwertyuiopzxcvbnm`.
- `vimiumCode.maxEditorHints`: maximum visible editor line targets per session. Default: `250`.
- `vimiumCode.includeBlankLines`: include blank visible lines as targets. Default: `false`.
- `vimiumCode.autoAcceptExactHint`: jump as soon as the typed label exactly matches a target. Default: `true`.
- `vimiumCode.preferWorkbenchDomOverlay`: try experimental direct workbench DOM labels before falling back to the supported IDE hint HUD/list. Default: `true`.
- `vimiumCode.workbenchDomOverlayDebugPort`: local DevTools port for experimental direct workbench DOM labels. Default: `9333`.

Choose at least two distinct ASCII letters or digits for the hint alphabet. VimCode ignores duplicates and uses the default alphabet if fewer than two supported characters remain.
