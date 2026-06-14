import * as vscode from "vscode";
import { COMMANDS, CONTEXT_KEYS } from "./constants";
import { getExtensionConfiguration } from "./configuration";
import type { ExtensionConfiguration } from "./configuration";
import { collectEditorHintTargets } from "./editorTargets";
import type { EditorHintTarget } from "./editorTargets";
import { normalizeTypedCharacter } from "./hintInput";
import type { TypeHintCharacterArgs } from "./hintInput";

interface HintSession {
  readonly editor: vscode.TextEditor;
  readonly targets: readonly EditorHintTarget[];
  readonly autoAcceptExactHint: boolean;
  prefix: string;
}

export class EditorHintController implements vscode.Disposable {
  private readonly decorationType: vscode.TextEditorDecorationType;
  private readonly statusBar: vscode.StatusBarItem;
  private readonly disposables: vscode.Disposable[] = [];
  private session: HintSession | undefined;

  public constructor(private readonly readConfiguration: () => ExtensionConfiguration = getExtensionConfiguration) {
    this.decorationType = vscode.window.createTextEditorDecorationType({
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
    });
    this.statusBar = vscode.window.createStatusBarItem("vimiumCode.hints", vscode.StatusBarAlignment.Left, 100);
    this.statusBar.name = "Vimium Hint Mode";
    this.statusBar.command = COMMANDS.cancelHint;
    this.statusBar.tooltip = "Vimium hint mode is active. Press Escape to cancel.";

    this.disposables.push(
      this.decorationType,
      this.statusBar,
      vscode.window.onDidChangeActiveTextEditor((editor) => this.cancelIfActiveEditorChanged(editor)),
      vscode.window.onDidChangeTextEditorVisibleRanges((event) => this.cancelIfEditorMoved(event.textEditor)),
      vscode.workspace.onDidChangeTextDocument((event) => this.cancelIfDocumentChanged(event.document))
    );
  }

  public get isActive(): boolean {
    return this.session !== undefined;
  }

  public async enterHintMode(): Promise<void> {
    const editor = vscode.window.activeTextEditor;

    if (!editor) {
      await vscode.commands.executeCommand(COMMANDS.openWorkbenchHints);
      return;
    }

    await this.cancelHint();
    const configuration = this.readConfiguration();
    const targets = collectEditorHintTargets(editor, configuration);

    if (targets.length === 0) {
      await vscode.window.showInformationMessage("Vimium: no visible editor targets to hint.");
      return;
    }

    this.session = {
      editor,
      targets,
      prefix: "",
      autoAcceptExactHint: configuration.autoAcceptExactHint
    };

    await vscode.commands.executeCommand("setContext", CONTEXT_KEYS.hintMode, true);
    this.renderSession();
  }

  public async typeHintCharacter(args: TypeHintCharacterArgs | string | undefined): Promise<void> {
    const session = this.session;

    if (!session) {
      return;
    }

    const character = normalizeTypedCharacter(args);

    if (!character) {
      return;
    }

    const nextPrefix = `${session.prefix}${character}`;
    const matchingTargets = session.targets.filter((target) => target.label.startsWith(nextPrefix));

    if (matchingTargets.length === 0) {
      void vscode.window.setStatusBarMessage(`Vimium: no hint matches "${nextPrefix}".`, 1200);
      return;
    }

    session.prefix = nextPrefix;
    const exactTarget = matchingTargets.find((target) => target.label === nextPrefix);

    if (exactTarget && session.autoAcceptExactHint) {
      await this.executeTarget(exactTarget);
      return;
    }

    this.renderSession();
  }

  public async acceptHint(): Promise<void> {
    const session = this.session;

    if (!session) {
      return;
    }

    const matchingTargets = session.targets.filter((target) => target.label.startsWith(session.prefix));
    const exactTarget = matchingTargets.find((target) => target.label === session.prefix);
    const target = exactTarget ?? (matchingTargets.length === 1 ? matchingTargets[0] : undefined);

    if (!target) {
      void vscode.window.setStatusBarMessage("Vimium: keep typing until one hint remains.", 1200);
      return;
    }

    await this.executeTarget(target);
  }

  public backspaceHint(): void {
    const session = this.session;

    if (!session || session.prefix.length === 0) {
      return;
    }

    session.prefix = session.prefix.slice(0, -1);
    this.renderSession();
  }

  public async cancelHint(): Promise<void> {
    if (!this.session) {
      await vscode.commands.executeCommand("setContext", CONTEXT_KEYS.hintMode, false);
      return;
    }

    this.clearSession();
    await vscode.commands.executeCommand("setContext", CONTEXT_KEYS.hintMode, false);
  }

  public dispose(): void {
    void this.cancelHint();

    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  private renderSession(): void {
    const session = this.session;

    if (!session) {
      return;
    }

    const matchingTargets = session.targets.filter((target) => target.label.startsWith(session.prefix));
    const decorations = matchingTargets.map((target) => createDecoration(target, target.label === session.prefix));

    session.editor.setDecorations(this.decorationType, decorations);
    this.statusBar.text = `Vimium: ${matchingTargets.length} hints${session.prefix ? ` | ${session.prefix}` : ""}`;
    this.statusBar.show();
  }

  private async executeTarget(target: EditorHintTarget): Promise<void> {
    const session = this.session;

    if (!session) {
      return;
    }

    const editor = session.editor;
    this.clearSession();
    await vscode.commands.executeCommand("setContext", CONTEXT_KEYS.hintMode, false);
    const activeEditor = await vscode.window.showTextDocument(editor.document, {
      viewColumn: editor.viewColumn,
      preserveFocus: false,
      preview: false
    });
    const position = new vscode.Position(target.line, target.character);

    activeEditor.selection = new vscode.Selection(position, position);
    activeEditor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }

  private clearSession(): void {
    if (this.session) {
      this.session.editor.setDecorations(this.decorationType, []);
    }

    this.statusBar.hide();
    this.session = undefined;
  }

  private cancelIfActiveEditorChanged(editor: vscode.TextEditor | undefined): void {
    if (this.session && editor !== this.session.editor) {
      void this.cancelHint();
    }
  }

  private cancelIfEditorMoved(editor: vscode.TextEditor): void {
    if (this.session && editor === this.session.editor) {
      void this.cancelHint();
    }
  }

  private cancelIfDocumentChanged(document: vscode.TextDocument): void {
    if (this.session && document === this.session.editor.document) {
      void this.cancelHint();
    }
  }
}

function createDecoration(target: EditorHintTarget, exactMatch: boolean): vscode.DecorationOptions {
  const backgroundColor = exactMatch ? "#7dd3fc" : "#ffd33d";
  const borderColor = exactMatch ? "#0284c7" : "#b08300";

  return {
    range: target.range,
    hoverMessage: `Jump to line ${target.line + 1}: ${target.preview}`,
    renderOptions: {
      before: {
        contentText: `${target.label.toUpperCase()} `,
        color: "#111827",
        backgroundColor,
        border: `1px solid ${borderColor}`,
        fontWeight: "700",
        margin: "0 0.35em 0 0"
      }
    }
  };
}
