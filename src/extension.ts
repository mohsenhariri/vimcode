import * as vscode from "vscode";

export const COMMANDS = {
  showEditingContext: "vimWorkflowTools.showEditingContext",
  openKeyboardShortcuts: "vimWorkflowTools.openKeyboardShortcuts"
} as const;

export interface EditingContext {
  readonly workspaceFolderCount: number;
  readonly activeEditorLabel?: string;
  readonly languageId?: string;
}

export function formatEditingContext(context: EditingContext): string {
  const workspacePart =
    context.workspaceFolderCount === 0
      ? "No workspace folder is open."
      : context.workspaceFolderCount === 1
        ? "1 workspace folder is open."
        : `${context.workspaceFolderCount} workspace folders are open.`;

  const editorPart = context.activeEditorLabel
    ? `Active editor: ${context.activeEditorLabel}${context.languageId ? ` (${context.languageId})` : ""}.`
    : "No active editor.";

  return `${workspacePart} ${editorPart}`;
}

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.showEditingContext, showEditingContext),
    vscode.commands.registerCommand(COMMANDS.openKeyboardShortcuts, openKeyboardShortcuts)
  );
}

export function deactivate(): void {
  // VS Code disposes subscriptions registered on the extension context.
}

async function showEditingContext(): Promise<string> {
  const summary = formatEditingContext({
    workspaceFolderCount: vscode.workspace.workspaceFolders?.length ?? 0,
    activeEditorLabel: getActiveEditorLabel(vscode.window.activeTextEditor?.document),
    languageId: vscode.window.activeTextEditor?.document.languageId
  });

  const showNotifications = vscode.workspace
    .getConfiguration("vimWorkflowTools")
    .get<boolean>("showNotifications", true);

  if (showNotifications) {
    await vscode.window.showInformationMessage(summary);
  }

  return summary;
}

async function openKeyboardShortcuts(): Promise<void> {
  await vscode.commands.executeCommand("workbench.action.openGlobalKeybindingsFile");
}

function getActiveEditorLabel(document: vscode.TextDocument | undefined): string | undefined {
  if (!document) {
    return undefined;
  }

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (workspaceFolder) {
    return vscode.workspace.asRelativePath(document.uri, false);
  }

  if (document.uri.scheme === "untitled") {
    return document.fileName;
  }

  return document.uri.toString(true);
}
