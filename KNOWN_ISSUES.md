# Compatibility notes

## Codex and other extension views

Run **Vimium: Show IDE Navigation Hints** from the Command Palette to navigate away from a webview. The standard palette shortcut is `F1`, `Ctrl+Shift+P` on Windows/Linux, or `Cmd+Shift+P` on macOS. Webviews control which shortcuts reach VS Code. Use the workbench menu to open the palette if a webview consumes your shortcut.

The picker can focus the Codex sidebar, switch to an existing webview tab, or open VS Code’s **Open View…** picker. The experimental overlay can focus a visible webview frame. Controls inside that frame use the keyboard navigation supplied by the extension that owns it.

## Experimental workbench overlay

A normal VS Code launch uses the IDE hint picker. For labels over the workbench, start desktop VS Code with a loopback debugging port and use a trusted workspace. Fully quit a running instance before changing its launch flags, or use a separate profile directory. In a multi-window session, ambiguous window titles can also cause VimCode to use the picker. [Overlay setup](README.md#experimental-direct-workbench-overlays)

Workbench markup can change between VS Code releases. Native dropdowns and keyboard-only controls may receive focus and require another keystroke to open. Press `Esc` to dismiss labels or disable `vimiumCode.preferWorkbenchDomOverlay` in User Settings to always use the picker.

## Editor command mode

Command mode handles navigation and unassigned printable keys using VS Code’s keybinding service. IME composition, extension-issued edits and commands such as Paste use VS Code’s native editing paths. The `Esc` entry shortcut yields to VSCodeVim when it reports itself active. Use Keyboard Shortcuts to resolve customized bindings on your keyboard layout.

## Menu mnemonics

Windows and Linux can reserve `Alt+F` for the File menu. VimCode uses `Alt+J` by default. Both hint commands can be rebound in Keyboard Shortcuts.

## Terminal shortcuts

VimCode uses VS Code’s built-in `runCommands` binding for `Alt+J` in the terminal. If you have enabled `terminal.integrated.sendKeybindingsToShell` or added `-runCommands` to `terminal.integrated.commandsToSkipShell`, your shell can receive the shortcut instead. [VS Code terminal key routing](https://code.visualstudio.com/docs/terminal/advanced#_keyboard-shortcuts-and-the-shell)
