import type { ExtensionConfiguration } from "./configuration";

interface DevToolsTarget {
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
}

const DEVTOOLS_REQUEST_TIMEOUT_MS = 400;
const WORKBENCH_TARGET_PATTERN = /(?:vscode|workbench|Visual Studio Code)/i;

export async function tryOpenWorkbenchDomOverlay(configuration: ExtensionConfiguration): Promise<boolean> {
  if (!configuration.preferWorkbenchDomOverlay) {
    return false;
  }

  const target = await findWorkbenchDevToolsTarget(configuration.workbenchDomOverlayDebugPort);

  if (!target?.webSocketDebuggerUrl) {
    return false;
  }

  const connection = await connectCdp(target.webSocketDebuggerUrl, DEVTOOLS_REQUEST_TIMEOUT_MS);

  try {
    const result = await connection.send("Runtime.evaluate", {
      expression: createWorkbenchDomOverlayScript({
        hintCharacters: configuration.hintCharacters,
        maxHints: 350
      }),
      awaitPromise: false,
      userGesture: true
    });

    return !hasCdpExceptionDetails(result);
  } finally {
    connection.dispose();
  }
}

export function createWorkbenchDomOverlayScript(options: WorkbenchDomOverlayOptions): string {
  const serializedOptions = JSON.stringify(options);

  return `(${runWorkbenchDomOverlay.toString()})(${serializedOptions});`;
}

async function findWorkbenchDevToolsTarget(port: number): Promise<DevToolsTarget | undefined> {
  let response: Response;

  try {
    response = await fetchWithTimeout(`http://127.0.0.1:${port}/json/list`, DEVTOOLS_REQUEST_TIMEOUT_MS);
  } catch {
    return undefined;
  }

  if (!response.ok) {
    return undefined;
  }

  const targets = (await response.json()) as unknown;

  if (!Array.isArray(targets)) {
    return undefined;
  }

  return targets
    .filter(isDevToolsTarget)
    .find(
      (target) =>
        target.type === "page" &&
        Boolean(target.webSocketDebuggerUrl) &&
        (WORKBENCH_TARGET_PATTERN.test(target.url ?? "") || WORKBENCH_TARGET_PATTERN.test(target.title ?? ""))
    );
}

function isDevToolsTarget(value: unknown): value is DevToolsTarget {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const target = value as Partial<DevToolsTarget>;

  return typeof target.id === "string";
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function connectCdp(url: string, timeoutMs: number): Promise<CdpConnection> {
  const socket = new WebSocket(url);

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
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

  public async send(method: string, params: Record<string, unknown>): Promise<unknown> {
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
      this.pending.set(id, {
        resolve,
        reject
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

function hasCdpExceptionDetails(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return "exceptionDetails" in value;
}

function runWorkbenchDomOverlay(options: WorkbenchDomOverlayOptions): void {
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

  const targets = collectTargets();

  if (targets.length === 0) {
    return;
  }

  let prefix = "";
  const overlay = document.createElement("div");
  const labels = new Map<HintTarget, HTMLDivElement>();

  overlay.id = overlayId;
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

  const cleanup = () => {
    window.removeEventListener("keydown", onKeyDown, true);
    overlay.remove();
    delete (window as unknown as Record<string, unknown>)[cleanupKey];
  };

  (window as unknown as Record<string, unknown>)[cleanupKey] = cleanup;
  window.addEventListener("keydown", onKeyDown, true);
  render();

  function collectTargets(): HintTarget[] {
    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>(
        [
          ".activitybar .action-item",
          ".tabs-container .tab",
          ".part.sidebar .action-label",
          ".part.panel .action-label",
          ".statusbar-item",
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

      if (!isUsableTarget(candidate)) {
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

    if (element.getAttribute("aria-hidden") === "true") {
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

  function onKeyDown(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();

    if (event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }

    if (key === "escape") {
      stop(event);
      cleanup();
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
      acceptBestMatch();
      return;
    }

    if (!alphabet.includes(key)) {
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

    if (exactTarget) {
      activate(exactTarget);
      return;
    }

    render();
  }

  function acceptBestMatch(): void {
    const matchingTargets = getMatchingTargets(prefix);
    const exactTarget = matchingTargets.find((target) => target.label === prefix);
    const target = exactTarget ?? (matchingTargets.length === 1 ? matchingTargets[0] : undefined);

    if (target) {
      activate(target);
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

  function activate(target: HintTarget): void {
    const element = target.element;
    const rect = target.rect;
    const clientX = rect.left + Math.min(rect.width / 2, 24);
    const clientY = rect.top + Math.min(rect.height / 2, 16);

    cleanup();
    element.focus({
      preventScroll: true
    });
    dispatchMouse(element, "pointerdown", clientX, clientY);
    dispatchMouse(element, "mousedown", clientX, clientY);
    dispatchMouse(element, "pointerup", clientX, clientY);
    dispatchMouse(element, "mouseup", clientX, clientY);
    element.click();
  }

  function dispatchMouse(element: HTMLElement, type: string, clientX: number, clientY: number): void {
    const event = new MouseEvent(type, {
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
