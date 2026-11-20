import * as vscode from "vscode";
import { COMMANDS, CONTEXT_KEYS } from "./constants";
import { getExtensionConfiguration } from "./configuration";
import type { ExtensionConfiguration } from "./configuration";
import { normalizeTypedCharacter } from "./hintInput";
import type { TypeHintCharacterArgs } from "./hintInput";
import { generateHintLabels } from "./labels";
import { executeBuiltInCommand, filterAvailableCommandTargets } from "./vscodeCommands";

type WorkbenchHintExecutor = () => Promise<void> | Thenable<void> | void;

export interface WorkbenchHintTarget {
  readonly title: string;
  readonly section: string;
  readonly description: string;
  readonly command?: string;
  readonly args?: readonly unknown[];
  readonly execute?: WorkbenchHintExecutor;
}

interface CommandWorkbenchHintTarget extends WorkbenchHintTarget {
  readonly command: string;
}

interface LabeledWorkbenchHintTarget extends WorkbenchHintTarget {
  readonly label: string;
}

interface WorkbenchHintItem extends vscode.QuickPickItem {
  readonly hintLabel: string;
  readonly target: LabeledWorkbenchHintTarget;
}

interface WorkbenchHintSession {
  readonly targets: readonly LabeledWorkbenchHintTarget[];
  readonly autoAcceptExactHint: boolean;
  readonly quickPick: vscode.QuickPick<WorkbenchHintItem>;
  readonly disposables: vscode.Disposable[];
  prefix: string;
}

const WORKBENCH_TARGETS: readonly CommandWorkbenchHintTarget[] = [
  {
    title: "Explorer",
    section: "Activity Bar",
    description: "Open the file explorer",
    command: "workbench.view.explorer"
  },
  {
    title: "Search",
    section: "Activity Bar",
    description: "Search across files",
    command: "workbench.view.search"
  },
  {
    title: "Source Control",
    section: "Activity Bar",
    description: "Review repository changes",
    command: "workbench.view.scm"
  },
  {
    title: "Run and Debug",
    section: "Activity Bar",
    description: "Open run and debug",
    command: "workbench.view.debug"
  },
  {
    title: "Extensions",
    section: "Activity Bar",
    description: "Manage extensions",
    command: "workbench.view.extensions"
  },
  {
    title: "Focus Activity Bar",
    section: "Layout",
    description: "Move keyboard focus to the Activity Bar",
    command: "workbench.action.focusActivityBar"
  },
  {
    title: "Focus Side Bar",
    section: "Layout",
    description: "Move keyboard focus to the Side Bar",
    command: "workbench.action.focusSideBar"
  },
  {
    title: "Focus Files Explorer",
    section: "Explorer Buttons",
    description: "Move keyboard focus to the Explorer tree",
    command: "workbench.files.action.focusFilesExplorer"
  },
  {
    title: "Reveal Active File",
    section: "Explorer Buttons",
    description: "Reveal the active editor in the Explorer tree",
    command: "workbench.files.action.showActiveFileInExplorer"
  },
  {
    title: "New File",
    section: "Explorer Buttons",
    description: "Create a file in the Explorer",
    command: "explorer.newFile"
  },
  {
    title: "New Folder",
    section: "Explorer Buttons",
    description: "Create a folder in the Explorer",
    command: "explorer.newFolder"
  },
  {
    title: "Refresh Explorer",
    section: "Explorer Buttons",
    description: "Refresh the Explorer tree",
    command: "workbench.files.action.refreshFilesExplorer"
  },
  {
    title: "Collapse Explorer",
    section: "Explorer Buttons",
    description: "Collapse all folders in the Explorer",
    command: "workbench.files.action.collapseExplorerFolders"
  },
  {
    title: "Tree Up",
    section: "Focused List or Tree",
    description: "Move focus to the previous tree/list item",
    command: "list.focusUp"
  },
  {
    title: "Tree Down",
    section: "Focused List or Tree",
    description: "Move focus to the next tree/list item",
    command: "list.focusDown"
  },
  {
    title: "Tree Expand",
    section: "Focused List or Tree",
    description: "Expand the focused tree item",
    command: "list.expand"
  },
  {
    title: "Tree Collapse",
    section: "Focused List or Tree",
    description: "Collapse the focused tree item",
    command: "list.collapse"
  },
  {
    title: "Tree Open",
    section: "Focused List or Tree",
    description: "Open or select the focused tree/list item",
    command: "list.select"
  },
  {
    title: "Quick Open File",
    section: "Global",
    description: "Search files in the current workspace",
    command: "workbench.action.quickOpen"
  },
  {
    title: "Command Palette",
    section: "Global",
    description: "Run any VS Code command",
    command: "workbench.action.showCommands"
  },
  {
    title: "Editor Symbols",
    section: "Global",
    description: "Jump to a symbol in the active file",
    command: "workbench.action.gotoSymbol"
  },
  {
    title: "Workspace Symbols",
    section: "Global",
    description: "Search symbols across the workspace",
    command: "workbench.action.showAllSymbols"
  },
  {
    title: "Problems",
    section: "Panel Buttons",
    description: "Open diagnostics",
    command: "workbench.actions.view.problems"
  },
  {
    title: "Toggle Terminal",
    section: "Panel Buttons",
    description: "Open or hide the integrated terminal",
    command: "workbench.action.terminal.toggleTerminal"
  },
  {
    title: "Focus Status Bar",
    section: "Layout",
    description: "Move keyboard focus to the Status Bar",
    command: "workbench.action.focusStatusBar"
  },
  {
    title: "Settings",
    section: "Global",
    description: "Open VS Code settings",
    command: "workbench.action.openSettings"
  }
];

// VS Code evaluates contributed view "when" clauses in its native Open View
// picker. Codex also provides a command that handles its two sidebar locations.
const EXTENSION_VIEW_TARGETS: readonly CommandWorkbenchHintTarget[] = [
  {
    title: "Codex",
    section: "Extension Views",
    description: "Open the Codex sidebar",
    command: "chatgpt.openSidebar"
  },
  {
    title: "Open View…",
    section: "Extension Views",
    description: "Choose an available VS Code or extension view by name",
    command: "workbench.action.openView"
  }
];

export class WorkbenchHintController implements vscode.Disposable {
  private readonly statusBar: vscode.StatusBarItem;
  private generation = 0;
  private session: WorkbenchHintSession | undefined;

  public constructor(private readonly readConfiguration: () => ExtensionConfiguration = getExtensionConfiguration) {
    this.statusBar = vscode.window.createStatusBarItem("vimiumCode.workbenchHints", vscode.StatusBarAlignment.Left, 99);
    this.statusBar.name = "Vimium IDE Hint Mode";
    this.statusBar.command = COMMANDS.cancelHint;
    this.statusBar.tooltip = "Vimium IDE hint mode is active. Press Escape to cancel.";
  }

  public get isActive(): boolean {
    return this.session !== undefined;
  }

  public async openHints(configuration: ExtensionConfiguration = this.readConfiguration()): Promise<void> {
    // Keep labels fixed until this picker closes. Reassigning a label while
    // the user types could launch a different tab or action.
    const closed = this.cancelHint();
    const generation = this.generation;
    const [targets] = await Promise.all([collectWorkbenchHintTargets(), closed]);

    if (generation !== this.generation) {
      return;
    }

    if (targets.length === 0) {
      void vscode.window.setStatusBarMessage("VimCode: no IDE targets are available in this window.", 1800);
      return;
    }

    const quickPick = vscode.window.createQuickPick<WorkbenchHintItem>();
    const labeledTargets = labelWorkbenchHintTargets(targets, configuration.hintCharacters);
    const session: WorkbenchHintSession = {
      targets: labeledTargets,
      autoAcceptExactHint: configuration.autoAcceptExactHint,
      quickPick,
      disposables: [],
      prefix: ""
    };

    quickPick.ignoreFocusOut = false;
    quickPick.matchOnDescription = false;
    quickPick.matchOnDetail = false;

    session.disposables.push(
      quickPick.onDidChangeValue((value) => {
        if (this.session === session && session.prefix !== value.toLowerCase()) {
          void this.replacePrefix(value.toLowerCase());
        }
      }),
      quickPick.onDidAccept(() => {
        if (this.session === session) {
          void this.acceptHint();
        }
      }),
      quickPick.onDidHide(() => {
        if (this.session === session) {
          void this.cancelHint();
        }
      })
    );

    this.session = session;
    this.renderSession();
    quickPick.show();
    await vscode.commands.executeCommand("setContext", CONTEXT_KEYS.workbenchHintMode, true);
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

    const value = `${session.prefix}${character}`;
    session.quickPick.value = value;
    await this.replacePrefix(value);
  }

  public async acceptHint(): Promise<void> {
    const session = this.session;

    if (!session) {
      return;
    }

    const matchingTargets = getMatchingTargets(session.targets, session.prefix);
    const exactTarget = matchingTargets.find((target) => target.label === session.prefix);
    const selected = session.quickPick.selectedItems[0] ?? session.quickPick.activeItems[0];
    const target = exactTarget ?? (selected && matchingTargets.includes(selected.target) ? selected.target : undefined)
      ?? (matchingTargets.length === 1 ? matchingTargets[0] : undefined);

    if (!target) {
      const message = matchingTargets.length ? "Choose an IDE hint or finish its label." : "No matching hint. Use Backspace to edit the label.";
      void vscode.window.setStatusBarMessage(`VimCode: ${message}`, 1200);
      return;
    }

    await this.executeTarget(target);
  }

  public backspaceHint(): void {
    const session = this.session;

    if (!session || session.prefix.length === 0) {
      return;
    }

    const value = session.prefix.slice(0, -1);
    session.quickPick.value = value;
    void this.replacePrefix(value);
  }

  public async cancelHint(): Promise<void> {
    ++this.generation;
    if (!this.session) {
      return;
    }
    this.clearSession();
    await vscode.commands.executeCommand("setContext", CONTEXT_KEYS.workbenchHintMode, false);
  }

  public dispose(): void {
    void this.cancelHint();
    this.statusBar.dispose();
  }

  private async replacePrefix(prefix: string): Promise<void> {
    const session = this.session;

    if (!session) {
      return;
    }

    const matchingTargets = getMatchingTargets(session.targets, prefix);

    session.prefix = prefix;
    const exactTarget = matchingTargets.find((target) => target.label === prefix);

    if (exactTarget && session.autoAcceptExactHint) {
      await this.executeTarget(exactTarget);
      return;
    }

    this.renderSession();
  }

  private renderSession(): void {
    const session = this.session;

    if (!session) {
      return;
    }

    const matchingTargets = getMatchingTargets(session.targets, session.prefix);

    session.quickPick.title = `Vimium IDE Hints (${matchingTargets.length})`;
    session.quickPick.placeholder = "Type a hint label, or use the arrow keys and Enter";
    session.quickPick.items = createWorkbenchHintItemsFromLabeledTargets(matchingTargets);

    this.statusBar.text = `$(keyboard) Vimium IDE: ${matchingTargets.length}${session.prefix ? ` | ${session.prefix.toUpperCase()}` : ""}`;
    this.statusBar.show();
  }

  private async executeTarget(target: LabeledWorkbenchHintTarget): Promise<void> {
    if (!this.session) {
      return;
    }

    this.clearSession();
    await vscode.commands.executeCommand("setContext", CONTEXT_KEYS.workbenchHintMode, false);

    try {
      if (target.execute) {
        await target.execute();
        return;
      }

      if (target.command) {
        await executeBuiltInCommand(target.command, ...(target.args ?? []));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      await vscode.window.showWarningMessage(`Vimium: failed to run ${target.title}. ${message}`);
    }
  }

  private clearSession(): void {
    const session = this.session;

    if (!session) {
      this.statusBar.hide();
      return;
    }

    this.session = undefined;

    for (const disposable of session.disposables) {
      disposable.dispose();
    }

    session.quickPick.dispose();
    this.statusBar.hide();
  }
}

export async function collectWorkbenchHintTargets(): Promise<readonly WorkbenchHintTarget[]> {
  const availableStaticTargets = await filterAvailableCommandTargets([...WORKBENCH_TARGETS, ...EXTENSION_VIEW_TARGETS]);
  const activityBarTargets = availableStaticTargets.filter((target) => target.section === "Activity Bar");
  const viewTargets = availableStaticTargets.filter((target) => target.section === "Extension Views");
  const remainingStaticTargets = availableStaticTargets.filter((target) => target.section !== "Activity Bar" && target.section !== "Extension Views");

  return [
    ...activityBarTargets,
    ...viewTargets,
    ...createEditorTabHintTargets(),
    ...createTerminalHintTargets(),
    ...remainingStaticTargets
  ];
}

export function createWorkbenchHintItems(
  targets: readonly WorkbenchHintTarget[],
  hintCharacters: string
): readonly WorkbenchHintItem[] {
  return createWorkbenchHintItemsFromLabeledTargets(labelWorkbenchHintTargets(targets, hintCharacters));
}

export function getWorkbenchHintTargetsForTest(): readonly WorkbenchHintTarget[] {
  return WORKBENCH_TARGETS;
}

export function createEditorTabHintTargets(
  tabGroups: readonly vscode.TabGroup[] = vscode.window.tabGroups.all
): readonly WorkbenchHintTarget[] {
  return tabGroups.flatMap((group) =>
    group.tabs.map((tab, index) => ({
      title: formatTabTitle(tab),
      section: group.isActive ? "Editor Tabs" : `Editor Group ${group.viewColumn}`,
      description: formatTabDescription(tab, index),
      execute: () => focusTab(tab)
    }))
  );
}

function labelWorkbenchHintTargets(
  targets: readonly WorkbenchHintTarget[],
  hintCharacters: string
): readonly LabeledWorkbenchHintTarget[] {
  const labels = generateHintLabels(targets.length, hintCharacters);

  return targets.map((target, index) => ({
    ...target,
    label: labels[index] ?? ""
  }));
}

function createWorkbenchHintItemsFromLabeledTargets(
  targets: readonly LabeledWorkbenchHintTarget[]
): readonly WorkbenchHintItem[] {
  return targets.map<WorkbenchHintItem>((target) => ({
    label: `${target.label.toUpperCase()}  ${target.title}`,
    description: target.section,
    detail: target.command ? `${target.description} (${target.command})` : target.description,
    alwaysShow: true,
    hintLabel: target.label,
    target
  }));
}

function createTerminalHintTargets(terminals: readonly vscode.Terminal[] = vscode.window.terminals): readonly WorkbenchHintTarget[] {
  return terminals.map((terminal, index) => ({
    title: terminal.name,
    section: "Terminal Tabs",
    description: `Focus terminal ${index + 1}`,
    execute: () => {
      if (vscode.window.terminals.includes(terminal)) {
        terminal.show(false);
      } else {
        void vscode.window.setStatusBarMessage("VimCode: that terminal has closed.", 1800);
      }
    }
  }));
}

async function focusTab(original: vscode.Tab): Promise<void> {
  const groups = vscode.window.tabGroups;
  let tab = resolveOpenTab(original);
  // Focusing an existing tab preserves its editor instance and preview state.
  // Never reopen a resource or use an index captured when the picker opened.
  for (let i = 0; tab && !tab.group.isActive && i < groups.all.length; i++) {
    await vscode.commands.executeCommand("workbench.action.focusNextGroup");
    tab = resolveOpenTab(original);
  }
  if (tab && tab.group === groups.activeTabGroup) {
    const index = tab.group.tabs.indexOf(tab);
    if (index >= 0) {
      await vscode.commands.executeCommand("workbench.action.openEditorAtIndex", index);
      return;
    }
  }

  void vscode.window.setStatusBarMessage("VimCode: the tab list changed. Reopen IDE hints.", 1800);
}

function resolveOpenTab(original: vscode.Tab): vscode.Tab | undefined {
  const groups = vscode.window.tabGroups.all;
  if (groups.includes(original.group)) {
    return original.group.tabs.includes(original) ? original : undefined;
  }

  // VS Code can replace every Tab/TabGroup wrapper after an unrelated tab
  // closes. Re-identify the same input in its original column only when it
  // was unique in both snapshots (panels can share a view type and title).
  const group = groups.find((candidate) => candidate.viewColumn === original.group.viewColumn);
  const key = tabInputKey(original);
  if (!group || !key || !original.group.tabs.includes(original)) {
    return undefined;
  }
  const matches = (candidate: vscode.Tab) => tabInputKey(candidate) === key;
  const candidates = group.tabs.filter(matches);
  return candidates.length === 1 && original.group.tabs.filter(matches).length === 1 ? candidates[0] : undefined;
}

function tabInputKey(tab: vscode.Tab): string | undefined {
  const input = tab.input;
  if (input instanceof vscode.TabInputWebview) {
    return JSON.stringify(["webview", input.viewType, tab.label]);
  }
  if (input instanceof vscode.TabInputText) {
    return JSON.stringify(["text", input.uri.toString()]);
  }
  if (input instanceof vscode.TabInputCustom) {
    return JSON.stringify(["custom", input.viewType, input.uri.toString()]);
  }
  if (input instanceof vscode.TabInputNotebook) {
    return JSON.stringify(["notebook", input.notebookType, input.uri.toString()]);
  }
  if (input instanceof vscode.TabInputTextDiff || input instanceof vscode.TabInputNotebookDiff) {
    return JSON.stringify(["diff", input instanceof vscode.TabInputNotebookDiff ? input.notebookType : null,
      input.original.toString(), input.modified.toString()]);
  }
  return undefined;
}

function formatTabTitle(tab: vscode.Tab): string {
  const dirtySuffix = tab.isDirty ? " *" : "";
  const activePrefix = tab.isActive && tab.group.isActive ? "Current: " : "";

  return `${activePrefix}${tab.label}${dirtySuffix}`;
}

function formatTabDescription(tab: vscode.Tab, tabIndex: number): string {
  const traits = [
    `group ${tab.group.viewColumn}`,
    `tab ${tabIndex + 1}`,
    tab.isPinned ? "pinned" : undefined,
    tab.isPreview ? "preview" : undefined
  ].filter((trait): trait is string => Boolean(trait));

  return `Open ${traits.join(", ")}`;
}

function getMatchingTargets(
  targets: readonly LabeledWorkbenchHintTarget[],
  prefix: string
): readonly LabeledWorkbenchHintTarget[] {
  if (prefix.length === 0) {
    return targets;
  }

  return targets.filter((target) => target.label.startsWith(prefix));
}
