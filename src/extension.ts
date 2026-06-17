import * as vscode from "vscode";
import { COMMANDS } from "./constants";
import { getExtensionConfiguration } from "./configuration";
import { CommandModeController } from "./commandModeController";
import type { ExitCommandModeArgs } from "./commandModeController";
import { EditorHintController } from "./editorHintController";
import { executeBuiltInCommand } from "./vscodeCommands";
import { tryOpenWorkbenchDomOverlay } from "./workbenchDomOverlay";
import { WorkbenchHintController } from "./workbenchHints";

export { COMMANDS } from "./constants";
export { collectEditorHintTargets } from "./editorTargets";
export { generateHintLabels, normalizeHintCharacters } from "./labels";
export {
  collectWorkbenchHintTargets,
  createEditorTabHintTargets,
  createWorkbenchHintItems,
  getWorkbenchHintTargetsForTest
} from "./workbenchHints";
export { selectWorkbenchDevToolsTarget } from "./workbenchDomOverlay";

export function activate(context: vscode.ExtensionContext): void {
  const hintController = new EditorHintController();
  const workbenchHintController = new WorkbenchHintController();
  const commandModeController = new CommandModeController();
  let warnedOverlayUnavailable = false;

  context.subscriptions.push(
    hintController,
    workbenchHintController,
    commandModeController,
    vscode.commands.registerCommand(COMMANDS.enterCommandMode, () => commandModeController.enter()),
    vscode.commands.registerCommand(COMMANDS.exitCommandMode, (args: ExitCommandModeArgs | undefined) =>
      commandModeController.exitWith(args)
    ),
    vscode.commands.registerCommand(COMMANDS.enterHintMode, async () => {
      await commandModeController.exit();
      await workbenchHintController.cancelHint();
      await hintController.enterHintMode();
    }),
    vscode.commands.registerCommand(COMMANDS.openWorkbenchHints, async (args?: { force?: boolean }) => {
      await hintController.cancelHint();
      const configuration = getExtensionConfiguration();
      // Default to taking focus from a focused webview (e.g. when run from the
      // Command Palette while a chat panel is focused). The bare-key bindings
      // pass force:false so an accidental key never overrides a webview.
      const force = args?.force !== false;

      if (await tryOpenWorkbenchDomOverlay(configuration, force)) {
        return;
      }

      if (configuration.preferWorkbenchDomOverlay && !warnedOverlayUnavailable) {
        warnedOverlayUnavailable = true;
        void vscode.window.setStatusBarMessage(
          `$(info) VimCode: launch with \`--remote-debugging-port=${configuration.workbenchDomOverlayDebugPort}\` (e.g. "code --vim") to draw IDE hints over the workbench. Showing the list for now.`,
          6000
        );
      }

      await workbenchHintController.openHints(configuration);
    }),
    vscode.commands.registerCommand(COMMANDS.typeHintCharacter, (args) =>
      workbenchHintController.isActive ? workbenchHintController.typeHintCharacter(args) : hintController.typeHintCharacter(args)
    ),
    vscode.commands.registerCommand(COMMANDS.acceptHint, () =>
      workbenchHintController.isActive ? workbenchHintController.acceptHint() : hintController.acceptHint()
    ),
    vscode.commands.registerCommand(COMMANDS.backspaceHint, () => {
      if (workbenchHintController.isActive) {
        workbenchHintController.backspaceHint();
      } else {
        hintController.backspaceHint();
      }
    }),
    vscode.commands.registerCommand(COMMANDS.cancelHint, async () => {
      await hintController.cancelHint();
      await workbenchHintController.cancelHint();
    }),
    vscode.commands.registerCommand(COMMANDS.scrollDown, () => scrollEditor("down", "line")),
    vscode.commands.registerCommand(COMMANDS.scrollUp, () => scrollEditor("up", "line")),
    vscode.commands.registerCommand(COMMANDS.pageDown, () => scrollEditor("down", "page")),
    vscode.commands.registerCommand(COMMANDS.pageUp, () => scrollEditor("up", "page")),
    vscode.commands.registerCommand(COMMANDS.goToTop, () => vscode.commands.executeCommand("cursorTop")),
    vscode.commands.registerCommand(COMMANDS.goToBottom, () => vscode.commands.executeCommand("cursorBottom")),
    vscode.commands.registerCommand(COMMANDS.focusNextEditor, () => executeBuiltInCommand("workbench.action.nextEditor")),
    vscode.commands.registerCommand(COMMANDS.focusPreviousEditor, () => executeBuiltInCommand("workbench.action.previousEditor")),
    vscode.commands.registerCommand(COMMANDS.focusExplorer, () => executeBuiltInCommand("workbench.view.explorer")),
    vscode.commands.registerCommand(COMMANDS.focusSearch, () => executeBuiltInCommand("workbench.view.search")),
    vscode.commands.registerCommand(COMMANDS.focusSourceControl, () => executeBuiltInCommand("workbench.view.scm")),
    vscode.commands.registerCommand(COMMANDS.focusRunAndDebug, () => executeBuiltInCommand("workbench.view.debug")),
    vscode.commands.registerCommand(COMMANDS.focusExtensions, () => executeBuiltInCommand("workbench.view.extensions")),
    vscode.commands.registerCommand(COMMANDS.focusActivityBar, () => executeBuiltInCommand("workbench.action.focusActivityBar")),
    vscode.commands.registerCommand(COMMANDS.focusSideBar, () => executeBuiltInCommand("workbench.action.focusSideBar")),
    vscode.commands.registerCommand(COMMANDS.focusFilesExplorer, () =>
      executeBuiltInCommand("workbench.files.action.focusFilesExplorer")
    ),
    vscode.commands.registerCommand(COMMANDS.revealActiveFileInExplorer, () =>
      executeBuiltInCommand("workbench.files.action.showActiveFileInExplorer")
    ),
    vscode.commands.registerCommand(COMMANDS.explorerNewFile, () => executeBuiltInCommand("explorer.newFile")),
    vscode.commands.registerCommand(COMMANDS.explorerNewFolder, () => executeBuiltInCommand("explorer.newFolder")),
    vscode.commands.registerCommand(COMMANDS.explorerRefresh, () =>
      executeBuiltInCommand("workbench.files.action.refreshFilesExplorer")
    ),
    vscode.commands.registerCommand(COMMANDS.explorerCollapseAll, () =>
      executeBuiltInCommand("workbench.files.action.collapseExplorerFolders")
    ),
    vscode.commands.registerCommand(COMMANDS.listFocusUp, () => executeBuiltInCommand("list.focusUp")),
    vscode.commands.registerCommand(COMMANDS.listFocusDown, () => executeBuiltInCommand("list.focusDown")),
    vscode.commands.registerCommand(COMMANDS.listExpand, () => executeBuiltInCommand("list.expand")),
    vscode.commands.registerCommand(COMMANDS.listCollapse, () => executeBuiltInCommand("list.collapse")),
    vscode.commands.registerCommand(COMMANDS.listSelect, () => executeBuiltInCommand("list.select")),
    vscode.commands.registerCommand(COMMANDS.focusPanel, () => executeBuiltInCommand("workbench.action.focusPanel")),
    vscode.commands.registerCommand(COMMANDS.focusStatusBar, () => executeBuiltInCommand("workbench.action.focusStatusBar")),
    vscode.commands.registerCommand(COMMANDS.toggleSideBar, () =>
      executeBuiltInCommand("workbench.action.toggleSidebarVisibility")
    ),
    vscode.commands.registerCommand(COMMANDS.togglePanel, () => executeBuiltInCommand("workbench.action.togglePanel")),
    vscode.commands.registerCommand(COMMANDS.toggleTerminal, () =>
      executeBuiltInCommand("workbench.action.terminal.toggleTerminal")
    )
  );
}

export function deactivate(): void {
  // VS Code disposes subscriptions registered on the extension context.
}

function scrollEditor(to: "up" | "down", by: "line" | "page"): Thenable<unknown> {
  return vscode.commands.executeCommand("editorScroll", {
    to,
    by,
    value: by === "line" ? 5 : 1,
    revealCursor: true
  });
}
