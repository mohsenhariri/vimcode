import * as vscode from "vscode";
import { CONTEXT_KEYS } from "./constants";

export interface CommandModeArgs {
  /** The default keyboard shortcut already updated the workbench context. */
  readonly contextSet?: boolean;
}

export interface ExitCommandModeArgs extends CommandModeArgs {
  /** Optional editor command to run after leaving command mode (e.g. to position the cursor for editing). */
  readonly action?: string;
}

/**
 * A lightweight, Vim-style "command mode" for the editor.
 *
 * VS Code's editor has no native modal layer, so a bare printable key is always
 * text input. Command mode adds a deliberate, visible state: the editor stops
 * inserting text and single keys act as navigation commands instead. It is
 * entered with `Escape` (see the keybinding guards in package.json) and left by
 * editing (`i`/`a`/`o`) or pressing `Escape` again.
 *
 * Keybindings in the manifest handle navigation and unassigned printable keys
 * only in the focused editor. The workbench's shared typing pipeline stays
 * available to other editors and extensions throughout the session.
 */
export class CommandModeController implements vscode.Disposable {
  private readonly statusBar: vscode.StatusBarItem;
  private readonly disposables: vscode.Disposable[] = [];
  private cursorEditor: vscode.TextEditor | undefined;
  private previousCursorStyle: vscode.TextEditorCursorStyle | undefined;

  public constructor() {
    this.statusBar = vscode.window.createStatusBarItem("vimiumCode.commandMode", vscode.StatusBarAlignment.Left, 101);
    this.statusBar.name = "VimCode Command Mode";
    this.statusBar.text = "$(keyboard) -- COMMAND --";
    this.statusBar.tooltip = "VimCode command mode: f hints · h/j/k/l move · i/a/o edit · Esc exits.";
    this.statusBar.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");

    // The API's setContext crosses the extension-host boundary. Use its
    // renderer implementation for keyboard transitions when VS Code provides
    // it, so the next key sees the new mode immediately. The manifest also
    // declares public command bindings for hosts without this implementation.
    void vscode.commands.getCommands(false).then(
      (commands) => vscode.commands.executeCommand("setContext", CONTEXT_KEYS.nativeModeSwitch, commands.includes("_setContext")),
      () => undefined
    );
    this.disposables.push(
      this.statusBar,
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor !== this.cursorEditor) {
          void this.exit();
        }
      })
    );
  }

  public get isActive(): boolean {
    return this.cursorEditor !== undefined;
  }

  public async enter(args?: CommandModeArgs): Promise<void> {
    const editor = vscode.window.activeTextEditor;

    if (!editor) {
      if (args?.contextSet) {
        await vscode.commands.executeCommand("setContext", CONTEXT_KEYS.commandMode, false);
      }
      return;
    }
    if (this.isActive) {
      return;
    }

    this.applyBlockCursor(editor);
    this.statusBar.show();
    if (!args?.contextSet) {
      await vscode.commands.executeCommand("setContext", CONTEXT_KEYS.commandMode, true);
    }
  }

  public async exit(args?: CommandModeArgs): Promise<void> {
    if (!this.isActive) {
      return;
    }

    this.restoreCursor();
    this.statusBar.hide();
    if (!args?.contextSet) {
      await vscode.commands.executeCommand("setContext", CONTEXT_KEYS.commandMode, false);
    }
  }

  /** Leave command mode and optionally run an editor command to resume editing. */
  public async exitWith(args: ExitCommandModeArgs | undefined): Promise<void> {
    const editor = this.cursorEditor;
    await this.exit(args);

    if (args?.action && editor && editor === vscode.window.activeTextEditor && !this.isActive) {
      await vscode.commands.executeCommand(args.action);
    }
  }

  public dispose(): void {
    void this.exit();

    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  private applyBlockCursor(editor: vscode.TextEditor): void {
    this.cursorEditor = editor;
    this.previousCursorStyle = editor.options.cursorStyle ?? undefined;
    editor.options = { cursorStyle: vscode.TextEditorCursorStyle.Block };
  }

  private restoreCursor(): void {
    if (this.cursorEditor?.options.cursorStyle === vscode.TextEditorCursorStyle.Block && this.previousCursorStyle !== undefined) {
      this.cursorEditor.options = { cursorStyle: this.previousCursorStyle };
    }

    this.cursorEditor = undefined;
    this.previousCursorStyle = undefined;
  }
}
