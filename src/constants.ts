export const EXTENSION_NAMESPACE = "vimiumCode";

export const COMMANDS = {
  enterHintMode: `${EXTENSION_NAMESPACE}.enterHintMode`,
  openWorkbenchHints: `${EXTENSION_NAMESPACE}.openWorkbenchHints`,
  typeHintCharacter: `${EXTENSION_NAMESPACE}.typeHintCharacter`,
  acceptHint: `${EXTENSION_NAMESPACE}.acceptHint`,
  backspaceHint: `${EXTENSION_NAMESPACE}.backspaceHint`,
  cancelHint: `${EXTENSION_NAMESPACE}.cancelHint`,
  enterCommandMode: `${EXTENSION_NAMESPACE}.enterCommandMode`,
  exitCommandMode: `${EXTENSION_NAMESPACE}.exitCommandMode`,
  scrollDown: `${EXTENSION_NAMESPACE}.scrollDown`,
  scrollUp: `${EXTENSION_NAMESPACE}.scrollUp`,
  pageDown: `${EXTENSION_NAMESPACE}.pageDown`,
  pageUp: `${EXTENSION_NAMESPACE}.pageUp`,
  goToTop: `${EXTENSION_NAMESPACE}.goToTop`,
  goToBottom: `${EXTENSION_NAMESPACE}.goToBottom`,
  focusNextEditor: `${EXTENSION_NAMESPACE}.focusNextEditor`,
  focusPreviousEditor: `${EXTENSION_NAMESPACE}.focusPreviousEditor`,
  focusExplorer: `${EXTENSION_NAMESPACE}.focusExplorer`,
  focusSearch: `${EXTENSION_NAMESPACE}.focusSearch`,
  focusSourceControl: `${EXTENSION_NAMESPACE}.focusSourceControl`,
  focusRunAndDebug: `${EXTENSION_NAMESPACE}.focusRunAndDebug`,
  focusExtensions: `${EXTENSION_NAMESPACE}.focusExtensions`,
  focusActivityBar: `${EXTENSION_NAMESPACE}.focusActivityBar`,
  focusSideBar: `${EXTENSION_NAMESPACE}.focusSideBar`,
  focusFilesExplorer: `${EXTENSION_NAMESPACE}.focusFilesExplorer`,
  revealActiveFileInExplorer: `${EXTENSION_NAMESPACE}.revealActiveFileInExplorer`,
  explorerNewFile: `${EXTENSION_NAMESPACE}.explorerNewFile`,
  explorerNewFolder: `${EXTENSION_NAMESPACE}.explorerNewFolder`,
  explorerRefresh: `${EXTENSION_NAMESPACE}.explorerRefresh`,
  explorerCollapseAll: `${EXTENSION_NAMESPACE}.explorerCollapseAll`,
  listFocusUp: `${EXTENSION_NAMESPACE}.listFocusUp`,
  listFocusDown: `${EXTENSION_NAMESPACE}.listFocusDown`,
  listExpand: `${EXTENSION_NAMESPACE}.listExpand`,
  listCollapse: `${EXTENSION_NAMESPACE}.listCollapse`,
  listSelect: `${EXTENSION_NAMESPACE}.listSelect`,
  focusPanel: `${EXTENSION_NAMESPACE}.focusPanel`,
  focusStatusBar: `${EXTENSION_NAMESPACE}.focusStatusBar`,
  toggleSideBar: `${EXTENSION_NAMESPACE}.toggleSideBar`,
  togglePanel: `${EXTENSION_NAMESPACE}.togglePanel`,
  toggleTerminal: `${EXTENSION_NAMESPACE}.toggleTerminal`
} as const;

export const CONTEXT_KEYS = {
  hintMode: `${EXTENSION_NAMESPACE}.hintMode`,
  commandMode: `${EXTENSION_NAMESPACE}.commandMode`
} as const;

export const DEFAULT_HINT_CHARACTERS = "asdfghjklqwertyuiopzxcvbnm";
