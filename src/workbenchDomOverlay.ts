import { randomUUID } from "node:crypto";
import * as path from "node:path";
import * as vscode from "vscode";
import type { ExtensionConfiguration } from "./configuration";

export interface DevToolsTarget {
  readonly id: string;
  readonly title?: string;
  readonly type?: string;
  readonly url?: string;
  readonly webSocketDebuggerUrl?: string;
}

interface CdpResponse {
  readonly id?: number;
  readonly result?: unknown;
  readonly error?: {
    readonly message?: string;
  };
}

interface PendingCdpRequest {
  resolve(value: unknown): void;
  reject(reason: Error): void;
}

interface WorkbenchDomOverlayOptions {
  readonly hintCharacters: string;
  readonly maxHints: number;
  readonly sessionId: string;
  readonly autoAcceptExactHint: boolean;
  /** Show hints even when a webview/iframe is focused, taking focus from it so labels can be typed. */
  readonly force?: boolean;
}

export interface WorkbenchDevToolsTargetSelectionHints {
  readonly workspaceNames: readonly string[];
}

const DEVTOOLS_REQUEST_TIMEOUT_MS = 400;
const DEVTOOLS_EVAL_TIMEOUT_MS = 2000;
const WORKBENCH_PATH = /\/out\/vs\/code\/electron-(?:sandbox|browser)\/workbench\/workbench\.html$/;

export class WorkbenchDomOverlayController {
  private closeActive?: () => Promise<void>;

  public async cancel(): Promise<void> {
    await this.closeActive?.();
  }

  public async open(
    configuration: ExtensionConfiguration,
    force: boolean,
    signal: AbortSignal
  ): Promise<boolean> {
    if (!configuration.preferWorkbenchDomOverlay || !vscode.workspace.isTrusted || signal.aborted) {
      return false;
    }

    let connection: CdpConnection | undefined;
    let watchingOverlay = false;

    try {
      const port = configuration.workbenchDomOverlayDebugPort;
      const target = await findWorkbenchDevToolsTarget(port);

      if (!target?.webSocketDebuggerUrl || !vscode.window.state.focused || signal.aborted) {
        return false;
      }

      const socketUrl = new URL(target.webSocketDebuggerUrl);
      if (socketUrl.origin !== `ws://127.0.0.1:${port}` || socketUrl.username || socketUrl.password ||
          socketUrl.pathname !== `/devtools/page/${target.id}`) {
        return false;
      }

      const socket = await connectCdp(socketUrl.href, DEVTOOLS_REQUEST_TIMEOUT_MS);
      connection = socket;
      if (signal.aborted) {
        return false;
      }

      const sessionId = randomUUID();
      let pendingClose: Promise<void> | undefined;
      const closeOverlay = () => {
        pendingClose ??= socket.send("Runtime.evaluate", {
          expression: `if (document.getElementById("vimium-code-workbench-dom-overlay")?.dataset.session === ${JSON.stringify(sessionId)}) window.__vimiumCodeWorkbenchDomOverlayCleanup__?.()`
        }).then(() => undefined, () => undefined);
        return pendingClose;
      };
      this.closeActive = closeOverlay;
      signal.addEventListener("abort", closeOverlay, { once: true });
      try {
        const response = await socket.send("Runtime.evaluate", {
          expression: createWorkbenchDomOverlayScript({
            hintCharacters: configuration.hintCharacters,
            autoAcceptExactHint: configuration.autoAcceptExactHint,
            maxHints: 350,
            sessionId,
            force
          }),
          userGesture: true
        }, DEVTOOLS_EVAL_TIMEOUT_MS) as {
          result?: { objectId?: string; subtype?: string; value?: boolean };
          exceptionDetails?: unknown;
        } | undefined;
        if (!response || response.exceptionDetails || signal.aborted) {
          return false;
        }

        // A focused webview ignored a bare binding. Leave keyboard focus there.
        if (response.result?.value === true) {
          return true;
        }
        const { objectId, subtype } = response.result ?? {};
        if (!objectId || subtype !== "promise") {
          return false;
        }

        watchingOverlay = true;
        // The renderer resolves this promise when it removes the overlay. Keep
        // the connection only while there is a session for this host to cancel.
        void socket.send("Runtime.awaitPromise", { promiseObjectId: objectId }, 0)
          .catch(() => undefined)
          .finally(() => {
            signal.removeEventListener("abort", closeOverlay);
            if (this.closeActive === closeOverlay) this.closeActive = undefined;
            socket.dispose();
          });
        return true;
      } catch {
        await closeOverlay();
        return false;
      } finally {
        if (!watchingOverlay) {
          if (this.closeActive === closeOverlay) this.closeActive = undefined;
          await pendingClose;
          signal.removeEventListener("abort", closeOverlay);
        }
      }
    } catch {
      return false;
    } finally {
      if (!watchingOverlay) {
        connection?.dispose();
      }
    }
  }
}

export function createWorkbenchDomOverlayScript(options: WorkbenchDomOverlayOptions): string {
  const serializedOptions = JSON.stringify(options);

  return `(${runWorkbenchDomOverlay.toString()})(${serializedOptions});`;
}

async function findWorkbenchDevToolsTarget(port: number): Promise<DevToolsTarget | undefined> {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
    redirect: "error",
    signal: AbortSignal.timeout(DEVTOOLS_REQUEST_TIMEOUT_MS)
  });
  if (!response.ok) {
    return undefined;
  }
  const targets: unknown = await response.json();
  return Array.isArray(targets)
    ? selectWorkbenchDevToolsTarget(targets.filter(isDevToolsTarget), getWorkbenchTargetSelectionHints())
    : undefined;
}

export function selectWorkbenchDevToolsTarget(
  targets: readonly DevToolsTarget[],
  hints: WorkbenchDevToolsTargetSelectionHints
): DevToolsTarget | undefined {
  const workbenchTargets = targets.filter(
    (target) =>
      target.type === "page" &&
      Boolean(target.webSocketDebuggerUrl) &&
      isWorkbenchUrl(target.url)
  );

  if (workbenchTargets.length <= 1) {
    return workbenchTargets[0];
  }

  const normalizedHints = hints.workspaceNames.map(normalizeTargetText).filter((hint) => hint.length > 0);

  if (normalizedHints.length === 0) {
    return undefined;
  }

  const matchingTargets = workbenchTargets.filter((target) => {
    const targetText = normalizeTargetText(`${target.title ?? ""} ${target.url ?? ""}`);

    return normalizedHints.some((hint) => targetText.includes(hint));
  });

  return matchingTargets.length === 1 ? matchingTargets[0] : undefined;
}

function isWorkbenchUrl(value?: string): boolean {
  if (!value || !URL.canParse(value)) {
    return false;
  }
  const url = new URL(value);
  return url.protocol === "vscode-file:" && url.hostname === "vscode-app" && WORKBENCH_PATH.test(url.pathname);
}

function getWorkbenchTargetSelectionHints(): WorkbenchDevToolsTargetSelectionHints {
  return {
    workspaceNames: getWorkspaceNames()
  };
}

function getWorkspaceNames(): readonly string[] {
  const names = new Set<string>();

  if (vscode.workspace.name) {
    names.add(vscode.workspace.name);
  }

  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    names.add(folder.name);

    if (folder.uri.scheme === "file") {
      names.add(path.basename(folder.uri.fsPath));
    }
  }

  if (vscode.workspace.workspaceFile?.scheme === "file") {
    const workspaceFileName = path.basename(vscode.workspace.workspaceFile.fsPath, ".code-workspace");

    names.add(workspaceFileName);
  }

  return Array.from(names);
}

function normalizeTargetText(value: string): string {
  return value.toLowerCase();
}

function isDevToolsTarget(value: unknown): value is DevToolsTarget {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const target = value as Partial<DevToolsTarget>;

  return typeof target.id === "string" && typeof target.url === "string" &&
    typeof target.webSocketDebuggerUrl === "string" && (target.title === undefined || typeof target.title === "string");
}

async function connectCdp(url: string, timeoutMs: number): Promise<CdpConnection> {
  const socket = new WebSocket(url);

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error("Timed out connecting to VS Code DevTools endpoint"));
    }, timeoutMs);

    socket.addEventListener(
      "open",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      {
        once: true
      }
    );
    socket.addEventListener(
      "error",
      () => {
        clearTimeout(timeout);
        socket.close();
        reject(new Error("Failed to connect to VS Code DevTools endpoint"));
      },
      {
        once: true
      }
    );
  });

  return new CdpConnection(socket);
}

class CdpConnection {
  private nextId = 1;
  private readonly pending = new Map<number, PendingCdpRequest>();

  public constructor(private readonly socket: WebSocket) {
    this.socket.addEventListener("message", (event: MessageEvent) => this.handleMessage(event));
    this.socket.addEventListener("close", () => this.rejectPending(new Error("VS Code DevTools connection closed")));
    this.socket.addEventListener("error", () => this.rejectPending(new Error("VS Code DevTools connection failed")));
  }

  public async send(
    method: string,
    params: Record<string, unknown>,
    timeoutMs: number = DEVTOOLS_REQUEST_TIMEOUT_MS
  ): Promise<unknown> {
    if (this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("VS Code DevTools connection is closed");
    }
    const id = this.nextId;

    this.nextId += 1;
    this.socket.send(
      JSON.stringify({
        id,
        method,
        params
      })
    );

    return await new Promise<unknown>((resolve, reject) => {
      const timer = timeoutMs > 0 ? setTimeout(() => {
        if (this.pending.delete(id)) {
          reject(new Error(`VS Code DevTools request "${method}" timed out`));
        }
      }, timeoutMs) : undefined;

      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (reason) => {
          clearTimeout(timer);
          reject(reason);
        }
      });
    });
  }

  public dispose(): void {
    this.socket.close();
  }

  private handleMessage(event: MessageEvent): void {
    const response = parseCdpResponse(event.data);

    if (typeof response.id !== "number") {
      return;
    }

    const pending = this.pending.get(response.id);

    if (!pending) {
      return;
    }

    this.pending.delete(response.id);

    if (response.error) {
      pending.reject(new Error(response.error.message ?? "VS Code DevTools request failed"));
      return;
    }

    pending.resolve(response.result);
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }

    this.pending.clear();
  }
}

function parseCdpResponse(data: unknown): CdpResponse {
  if (typeof data !== "string") {
    return {};
  }

  try {
    const parsed = JSON.parse(data) as unknown;

    if (typeof parsed === "object" && parsed !== null) {
      return parsed as CdpResponse;
    }
  } catch {
    return {};
  }

  return {};
}

function runWorkbenchDomOverlay(options: WorkbenchDomOverlayOptions): boolean | Promise<void> {
  if (!document.hasFocus() || !document.querySelector(".monaco-workbench")) {
    return false;
  }

  type HintTarget = {
    readonly element: HTMLElement;
    readonly label: string;
    readonly rect: DOMRect;
  };

  const overlayId = "vimium-code-workbench-dom-overlay";
  const cleanupKey = "__vimiumCodeWorkbenchDomOverlayCleanup__";
  const supportedCharacters = Array.from(options.hintCharacters).filter((character) => /^[a-z0-9]$/.test(character));
  const alphabet = supportedCharacters.length >= 2 ? supportedCharacters : Array.from("asdfghjklqwertyuiopzxcvbnm");

  const previousCleanup = (window as unknown as Record<string, unknown>)[cleanupKey];

  if (typeof previousCleanup === "function") {
    previousCleanup();
  }

  const previousOverlay = document.getElementById(overlayId);

  previousOverlay?.remove();

  const activeElement = document.activeElement;

  if (activeElement instanceof HTMLIFrameElement && !options.force) {
    return true;
  }

  const targets = collectTargets();

  if (targets.length === 0) {
    return false;
  }

  let prefix = "";
  const overlay = document.createElement("div");
  const labels = new Map<HintTarget, HTMLDivElement>();

  overlay.id = overlayId;
  overlay.dataset.session = options.sessionId;
  overlay.tabIndex = -1;
  overlay.setAttribute("role", "group");
  overlay.setAttribute("aria-label", "VimCode navigation hints");
  overlay.style.outline = "none";
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.zIndex = "2147483647";
  overlay.style.pointerEvents = "none";
  overlay.style.contain = "strict";
  overlay.style.fontFamily =
    "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";

  document.body.append(overlay);

  for (const target of targets) {
    const label = document.createElement("div");

    label.textContent = target.label.toUpperCase();
    label.style.position = "fixed";
    label.style.left = `${Math.max(0, target.rect.left + 2)}px`;
    label.style.top = `${Math.max(0, target.rect.top + 2)}px`;
    label.style.padding = "1px 4px";
    label.style.border = "1px solid #b08300";
    label.style.borderRadius = "3px";
    label.style.background = "#ffd33d";
    label.style.color = "#111827";
    label.style.fontSize = "12px";
    label.style.fontWeight = "800";
    label.style.lineHeight = "16px";
    label.style.boxShadow = "0 1px 2px rgba(0, 0, 0, 0.35)";
    label.style.textTransform = "uppercase";
    overlay.append(label);
    labels.set(target, label);
  }

  return new Promise<void>((resolve) => {
    function dismiss(): void {
      cleanup();
      if (activeElement instanceof HTMLElement && activeElement.isConnected) {
        activeElement.focus({ preventScroll: true });
      }
    }
    function cleanup(): void {
      window.removeEventListener("keydown", keydown, true);
      window.removeEventListener("pointerdown", cleanup, true);
      window.removeEventListener("blur", cleanup);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
      overlay.removeEventListener("blur", cleanup);
      overlay.remove();
      delete (window as unknown as Record<string, unknown>)[cleanupKey];
      resolve();
    }
    function keydown(event: KeyboardEvent): void {
      onKeyDown(event, cleanup, dismiss);
    }

    (window as unknown as Record<string, unknown>)[cleanupKey] = dismiss;
    overlay.focus({ preventScroll: true });
    overlay.addEventListener("blur", cleanup);
    window.addEventListener("keydown", keydown, true);
    window.addEventListener("pointerdown", cleanup, true);
    window.addEventListener("blur", cleanup);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    render();
  });

  function collectTargets(): HintTarget[] {
    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>(
        [
          ".activitybar .action-item",
          ".tabs-container .tab",
          ".part.sidebar .action-label",
          ".part.panel .action-label",
          ".statusbar-item",
          "iframe.webview",
          ".monaco-list-row",
          "a[href]",
          "button",
          "input:not([type='hidden'])",
          "textarea",
          "select",
          "[role='button']",
          "[role='tab']",
          "[role='treeitem']",
          "[role='menuitem']",
          "[role='option']",
          "[tabindex]:not([tabindex='-1'])"
        ].join(",")
      )
    );
    const seen = new Set<string>();
    const visibleTargets: Omit<HintTarget, "label">[] = [];

    for (const candidate of candidates) {
      if (visibleTargets.length >= options.maxHints) {
        break;
      }

      if (!(candidate instanceof HTMLElement) || !isUsableTarget(candidate)) {
        continue;
      }

      const rect = candidate.getBoundingClientRect();
      const key = `${Math.round(rect.left)}:${Math.round(rect.top)}:${Math.round(rect.width)}:${Math.round(
        rect.height
      )}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      visibleTargets.push({
        element: candidate,
        rect
      });
    }

    const hintLabels = generateLabels(visibleTargets.length);

    return visibleTargets.map((target, index) => ({
      ...target,
      label: hintLabels[index] ?? ""
    }));
  }

  function isUsableTarget(element: HTMLElement): boolean {
    if (element.id === overlayId || element.closest(`#${overlayId}`)) {
      return false;
    }

    if (element.closest('[aria-hidden="true"], [inert]') || element.matches(':disabled, [aria-disabled="true"]')) {
      return false;
    }

    const rect = element.getBoundingClientRect();

    if (rect.width < 5 || rect.height < 5 || rect.bottom < 0 || rect.right < 0) {
      return false;
    }

    if (rect.top > window.innerHeight || rect.left > window.innerWidth) {
      return false;
    }

    const style = window.getComputedStyle(element);

    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
      return false;
    }

    const centerX = Math.min(window.innerWidth - 1, Math.max(0, rect.left + Math.min(rect.width / 2, 24)));
    const centerY = Math.min(window.innerHeight - 1, Math.max(0, rect.top + Math.min(rect.height / 2, 16)));
    const hitElement = document.elementFromPoint(centerX, centerY);

    return hitElement === element || Boolean(hitElement && element.contains(hitElement));
  }

  function generateLabels(count: number): string[] {
    let labelLength = 1;
    let capacity = alphabet.length;
    const output: string[] = [];

    while (capacity < count) {
      labelLength += 1;
      capacity *= alphabet.length;
    }

    for (let index = 0; index < count; index += 1) {
      output.push(formatLabel(index, labelLength));
    }

    return output;
  }

  function formatLabel(index: number, labelLength: number): string {
    const label = new Array<string>(labelLength);
    let remaining = index;

    for (let position = labelLength - 1; position >= 0; position -= 1) {
      label[position] = alphabet[remaining % alphabet.length] ?? alphabet[0] ?? "a";
      remaining = Math.floor(remaining / alphabet.length);
    }

    return label.join("");
  }

  function onKeyDown(event: KeyboardEvent, cleanup: () => void, dismiss: () => void): void {
    const key = event.key.toLowerCase();

    if (["alt", "control", "shift", "meta"].includes(key)) {
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey || key === "tab") {
      dismiss();
      return;
    }

    if (key === "escape") {
      stop(event);
      dismiss();
      return;
    }

    if (key === "backspace") {
      stop(event);
      prefix = prefix.slice(0, -1);
      render();
      return;
    }

    if (key === "enter") {
      stop(event);
      acceptBestMatch(cleanup);
      return;
    }

    if (!alphabet.includes(key)) {
      stop(event);
      return;
    }

    stop(event);
    const nextPrefix = `${prefix}${key}`;
    const matchingTargets = getMatchingTargets(nextPrefix);

    if (matchingTargets.length === 0) {
      flashNoMatch();
      return;
    }

    prefix = nextPrefix;
    const exactTarget = matchingTargets.find((target) => target.label === prefix);

    if (exactTarget && options.autoAcceptExactHint) {
      activate(exactTarget, cleanup);
      return;
    }

    render();
  }

  function acceptBestMatch(cleanup: () => void): void {
    const matchingTargets = getMatchingTargets(prefix);
    const exactTarget = matchingTargets.find((target) => target.label === prefix);
    const target = exactTarget ?? (matchingTargets.length === 1 ? matchingTargets[0] : undefined);

    if (target) {
      activate(target, cleanup);
    }
  }

  function render(): void {
    for (const target of targets) {
      const label = labels.get(target);

      if (!label) {
        continue;
      }

      const isVisible = target.label.startsWith(prefix);

      label.style.display = isVisible ? "block" : "none";
      label.style.background = target.label === prefix ? "#7dd3fc" : "#ffd33d";
      label.style.borderColor = target.label === prefix ? "#0284c7" : "#b08300";
    }
  }

  function flashNoMatch(): void {
    overlay.style.filter = "hue-rotate(145deg)";
    window.setTimeout(() => {
      overlay.style.filter = "";
    }, 120);
  }

  function getMatchingTargets(value: string): HintTarget[] {
    return value.length === 0 ? targets : targets.filter((target) => target.label.startsWith(value));
  }

  function activate(target: HintTarget, cleanup: () => void): void {
    const element = target.element;
    if (!element.isConnected || !isUsableTarget(element)) {
      cleanup();
      return;
    }
    const rect = element.getBoundingClientRect();
    const clientX = rect.left + Math.min(rect.width / 2, 24);
    const clientY = rect.top + Math.min(rect.height / 2, 16);

    cleanup();
    element.focus({
      preventScroll: true
    });
    if (element instanceof HTMLIFrameElement) {
      return;
    }
    dispatchMouse(element, "pointerdown", clientX, clientY);
    dispatchMouse(element, "mousedown", clientX, clientY);
    dispatchMouse(element, "pointerup", clientX, clientY);
    dispatchMouse(element, "mouseup", clientX, clientY);
    element.click();
  }

  function dispatchMouse(element: HTMLElement, type: string, clientX: number, clientY: number): void {
    const EventType = type.startsWith("pointer") ? PointerEvent : MouseEvent;
    const event = new EventType(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: type.endsWith("down") ? 1 : 0,
      clientX,
      clientY,
      view: window
    });

    element.dispatchEvent(event);
  }

  function stop(event: KeyboardEvent): void {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}
