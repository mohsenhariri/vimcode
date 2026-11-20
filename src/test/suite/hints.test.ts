import * as assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as vscode from "vscode";
import {
  COMMANDS,
  WorkbenchHintController,
  collectWorkbenchHintTargets,
  createEditorTabHintTargets,
  createWorkbenchHintItems
} from "../../extension";
import type { TestCase } from "./extension.test";
import { waitFor } from "./waitFor";

const configuration = {
  hintCharacters: "0123456789",
  includeBlankLines: true,
  maxEditorHints: 100,
  autoAcceptExactHint: false,
  preferWorkbenchDomOverlay: false,
  workbenchDomOverlayDebugPort: 9333
};

export const hintTests: readonly TestCase[] = [
  {
    name: "selects a webview tab in another group without duplicating it or resurrecting closed tabs",
    async run() {
      const previous = vscode.window.createWebviewPanel("vimcode.previousPanel", "VimCode earlier tab", vscode.ViewColumn.One);
      const panel = vscode.window.createWebviewPanel("vimcode.testPanel", "VimCode tab fixture", vscode.ViewColumn.One);
      const document = await vscode.workspace.openTextDocument({ language: "plaintext" });
      try {
        const editor = await vscode.window.showTextDocument(document, { viewColumn: vscode.ViewColumn.Two, preview: false });
        await waitFor(() => vscode.window.tabGroups.activeTabGroup.viewColumn === editor.viewColumn, "second group");
        const target = createEditorTabHintTargets().find((entry) => entry.title.includes(panel.title));
        assert.ok(target?.execute, "Expected the webview tab in the list");
        // Closing an earlier sibling shifts the tab index after labels were assigned.
        previous.dispose();
        await waitFor(() => !createEditorTabHintTargets().some((entry) => entry.title.includes("VimCode earlier tab")), "earlier tab closure");
        const count = vscode.window.tabGroups.all.flatMap((group) => group.tabs).length;
        await target.execute();
        await waitFor(() => panel.active && vscode.window.tabGroups.activeTabGroup.activeTab?.label === panel.title, "webview tab activation");
        assert.equal(vscode.window.tabGroups.all.flatMap((group) => group.tabs).length, count);

        panel.dispose();
        await waitFor(() => vscode.window.tabGroups.all.every((group) => group.tabs.every((tab) => tab.label !== "VimCode tab fixture")), "webview tab closure");
        const active = vscode.window.tabGroups.activeTabGroup.activeTab;
        await target.execute();
        assert.equal(vscode.window.tabGroups.activeTabGroup.activeTab, active);
      } finally {
        previous.dispose();
        panel.dispose();
        const fixtureTab = vscode.window.tabGroups.all.flatMap(group => group.tabs).find(tab =>
          tab.input instanceof vscode.TabInputText && tab.input.uri.toString() === document.uri.toString());
        if (fixtureTab) {
          assert.ok(await vscode.window.tabGroups.close(fixtureTab, true), "Expected the split editor fixture to close");
          await waitFor(() => vscode.window.visibleTextEditors.every(editor => editor.document !== document), "split editor fixture closure");
        }
      }
    }
  },
  {
    name: "offers Open View and discovers the public Codex sidebar command when available",
    async run() {
      const codexCommand = "chatgpt.openSidebar";
      const installed = (await vscode.commands.getCommands(true)).includes(codexCommand);
      let invoked = 0;
      const before = await collectWorkbenchHintTargets();
      assert.ok(before.some((target) => target.command === "workbench.action.openView"));
      assert.equal(before.some((target) => target.command === codexCommand), installed);
      if (installed) {
        return;
      }
      const fixture = vscode.commands.registerCommand(codexCommand, () => { ++invoked; });
      const controller = new WorkbenchHintController(() => configuration);
      try {
        const items = createWorkbenchHintItems(await collectWorkbenchHintTargets(), configuration.hintCharacters);
        const codex = items.find((item) => item.target.command === codexCommand);
        assert.ok(codex);
        assert.match(codex.hintLabel, /^[0-9]{2,}$/);
        await controller.openHints();
        // Exercise an invalid prefix and a correction before manual acceptance.
        await controller.typeHintCharacter("x");
        controller.backspaceHint();
        for (const character of codex.hintLabel) {
          await controller.typeHintCharacter(character);
        }
        assert.equal(invoked, 0);
        assert.ok(controller.isActive);
        await controller.acceptHint();
        assert.equal(invoked, 1);
        assert.equal(controller.isActive, false);
      } finally {
        controller.dispose();
        fixture.dispose();
      }
    }
  },
  {
    name: "cancelling while targets load does not open a stale picker",
    async run() {
      const controller = new WorkbenchHintController(() => configuration);
      try {
        const first = controller.openHints();
        const second = controller.openHints(configuration, true);
        await controller.cancelHint();
        await Promise.all([first, second]);
        assert.equal(controller.isActive, false);
        await controller.openHints();
        assert.ok(controller.isActive);
        await controller.cancelHint();
        assert.equal(controller.isActive, false);
      } finally {
        controller.dispose();
      }
    }
  },
  {
    name: "line hints preserve a preview tab and an edit cancels its pending label",
    async run() {
      const profile = process.env.VIMCODE_TEST_PROFILE;
      const file = join(profile || tmpdir(), `vimcode-preview-${randomUUID()}.txt`);
      await writeFile(file, "one\n  two\nthree", { flag: "wx" });
      try {
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
        const editor = await vscode.window.showTextDocument(document, { preview: true });
        const group = vscode.window.tabGroups.activeTabGroup;
        const tab = group.activeTab;
        assert.ok(tab);
        try {
          assert.ok(tab.isPreview, "Expected a real preview tab before entering hint mode");
          await vscode.commands.executeCommand(COMMANDS.enterHintMode);
          await vscode.commands.executeCommand(COMMANDS.typeHintCharacter, { character: "s" });
          assert.deepEqual([editor.selection.active.line, editor.selection.active.character], [1, 2]);
          assert.equal(group.activeTab, tab);
          assert.ok(tab.isPreview, "Jumping must preserve preview state");

          await vscode.commands.executeCommand(COMMANDS.enterHintMode);
          await editor.edit((edit) => edit.insert(new vscode.Position(0, 0), "text "));
          await vscode.commands.executeCommand(COMMANDS.typeHintCharacter, { character: "a" });
          assert.equal(editor.selection.active.line, 1);
          // Saving a dirty editor sends a document event with no content changes.
          await vscode.commands.executeCommand(COMMANDS.enterHintMode);
          await document.save();
          await vscode.commands.executeCommand(COMMANDS.typeHintCharacter, { character: "a" });
          assert.equal(editor.selection.active.line, 0, "Saving the same text should preserve hints");
        } finally {
          if (document.isDirty) {
            await document.save();
          }
          await vscode.window.tabGroups.close(tab);
        }
      } finally {
        // The runner removes its profile after VS Code releases its Windows directory handles.
        if (!profile) {
          await rm(file, { force: true });
        }
      }
    }
  }
];
