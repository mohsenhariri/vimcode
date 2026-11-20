import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import { COMMANDS } from "../../extension";
import type { TestCase } from "./extension.test";
import { waitFor } from "./waitFor";

async function showCommandModeEditor(content: string, viewColumn: vscode.ViewColumn.One | vscode.ViewColumn.Two): Promise<vscode.TextEditor> {
  const document = await vscode.workspace.openTextDocument({ content });
  const editor = await vscode.window.showTextDocument(document, { viewColumn, preview: false });
  const focusGroup = viewColumn === vscode.ViewColumn.One ? "workbench.action.focusFirstEditorGroup" : "workbench.action.focusSecondEditorGroup";
  await vscode.commands.executeCommand(focusGroup);
  const active = vscode.window.activeTextEditor;
  const group = vscode.window.tabGroups.activeTabGroup;
  await waitFor(() => vscode.window.activeTextEditor === editor,
    `${document.uri} in group ${viewColumn} (active editor ${active?.document.uri}, active tab ${group.activeTab?.label} in group ${group.viewColumn})`);
  return editor;
}

export const commandModeTests: readonly TestCase[] = [
  {
    name: "allows another extension to acquire and retain the type command during command mode",
    async run() {
      const editor = await showCommandModeEditor("unchanged", vscode.ViewColumn.One);
      const originalCursor = editor.options.cursorStyle;
      const received: string[] = [];
      let typing: vscode.Disposable | undefined;
      try {
        await vscode.commands.executeCommand(COMMANDS.enterCommandMode);
        await waitFor(() => editor.options.cursorStyle === vscode.TextEditorCursorStyle.Block, "the command-mode block cursor");
        typing = vscode.commands.registerCommand("type", ({ text }: { text: string }) => received.push(text));
        await vscode.commands.executeCommand("type", { text: "f" });
        await vscode.commands.executeCommand(COMMANDS.exitCommandMode);
        await vscode.commands.executeCommand("type", { text: "g" });
        assert.deepEqual(received, ["f", "g"]);
        await waitFor(() => editor.options.cursorStyle === originalCursor, "the original cursor after leaving command mode");
        assert.equal(editor.document.getText(), "unchanged");
      } finally {
        typing?.dispose();
        await vscode.commands.executeCommand(COMMANDS.exitCommandMode);
      }
    }
  },
  {
    name: "restores the previous editor cursor and drops pending edit actions after an editor switch",
    async run() {
      const first = await showCommandModeEditor("first", vscode.ViewColumn.One);
      const originalCursor = first.options.cursorStyle;
      try {
        first.options = { cursorStyle: vscode.TextEditorCursorStyle.Underline };
        await vscode.commands.executeCommand(COMMANDS.enterCommandMode);
        await waitFor(() => first.options.cursorStyle === vscode.TextEditorCursorStyle.Block, "the block cursor before switching editors");
        const next = await showCommandModeEditor("second", vscode.ViewColumn.Two);
        await vscode.commands.executeCommand(COMMANDS.exitCommandMode, { action: "editor.action.insertLineAfter" });
        assert.equal(next.document.getText(), "second");
        await waitFor(() => first.options.cursorStyle === vscode.TextEditorCursorStyle.Underline, "the restored underline cursor");
      } finally {
        await vscode.commands.executeCommand(COMMANDS.exitCommandMode);
        first.options = { cursorStyle: originalCursor };
      }
    }
  }
];
