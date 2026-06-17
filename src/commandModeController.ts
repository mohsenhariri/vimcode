import * as vscode from "vscode";
import { CONTEXT_KEYS } from "./constants";

export interface ExitCommandModeArgs {
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
 * Text insertion is suppressed by temporarily owning the global `type` command
 * while active; keys with command-mode keybindings still run because
 * keybindings take precedence over `type`.
 */
export class CommandModeController implements vscode.Disposable {
  private readonly statusBar: vscode.StatusBarItem;
  private readonly disposables: vscode.Disposable[] = [];
  private active = false;
  private typeInterceptor: vscode.Disposable | undefined;
  private cursorEditor: vscode.TextEditor | undefined;
  private previousCursorStyle: vscode.TextEditorCursorStyle | undefined;

  public constructor() {
    this.statusBar = vscode.window.createStatusBarItem("vimiumCode.commandMode", vscode.StatusBarAlignment.Left, 101);
    this.statusBar.name = "Vimium Command Mode";
    this.statusBar.text = "$(keyboard) -- COMMAND --";
    this.statusBar.tooltip = "VimCode command mode: f hints · h/j/k/l move · i/a/o edit · Esc exits.";
    this.statusBar.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");

    this.disposables.push(
      this.statusBar,
      // Leave command mode if focus moves to another editor so the `type`
      // interception never lingers on the wrong document.
      vscode.window.onDidChangeActiveTextEditor(() => void this.exit())
    );
  }

  public get isActive(): boolean {
    return this.active;
  }

  public async enter(): Promise<void> {
    const editor = vscode.window.activeTextEditor;

    if (this.active || !editor) {
      return;
    }

    this.active = true;
    this.interceptTyping();
    this.applyBlockCursor(editor);
    this.statusBar.show();
    await vscode.commands.executeCommand("setContext", CONTEXT_KEYS.commandMode, true);
  }

  public async exit(): Promise<void> {
    if (!this.active) {
      return;
    }

    this.active = false;
    this.releaseTyping();
    this.restoreCursor();
    this.statusBar.hide();
    await vscode.commands.executeCommand("setContext", CONTEXT_KEYS.commandMode, false);
  }

  /** Leave command mode and optionally run an editor command to resume editing. */
  public async exitWith(args: ExitCommandModeArgs | undefined): Promise<void> {
    await this.exit();

    if (args?.action) {
      await vscode.commands.executeCommand(args.action);
    }
  }

  public dispose(): void {
    void this.exit();

    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  private interceptTyping(): void {
    if (this.typeInterceptor) {
      return;
    }

    try {
      // Swallow text input while command mode is active. Keys that have a
      // command-mode keybinding are handled before `type`, so only unbound
      // characters are dropped instead of being inserted into the document.
      this.typeInterceptor = vscode.commands.registerCommand("type", () => undefined);
    } catch {
      // Another extension already owns `type` (e.g. a Vim emulator). Command-mode
      // keybindings still work; only the text-suppression safety net is missing.
      this.typeInterceptor = undefined;
    }
  }

  private releaseTyping(): void {
    this.typeInterceptor?.dispose();
    this.typeInterceptor = undefined;
  }

  private applyBlockCursor(editor: vscode.TextEditor): void {
    this.cursorEditor = editor;
    this.previousCursorStyle = editor.options.cursorStyle ?? undefined;
    editor.options = { cursorStyle: vscode.TextEditorCursorStyle.Block };
  }

  private restoreCursor(): void {
    if (this.cursorEditor && this.previousCursorStyle !== undefined) {
      this.cursorEditor.options = { cursorStyle: this.previousCursorStyle };
    }

    this.cursorEditor = undefined;
    this.previousCursorStyle = undefined;
  }
}
