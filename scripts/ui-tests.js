// Runs inside the disposable Extension Development Host created by run-tests.js.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { setTimeout: delay } = require("node:timers/promises");
const vscode = require("vscode");

async function until(description, probe) {
  const end = Date.now() + 12000;
  while (Date.now() < end) {
    const result = await probe();
    if (result) return result;
    await delay(50);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function connectWorkbench() {
  const portFile = path.join(process.env.VIMCODE_TEST_PROFILE, "DevToolsActivePort");
  const port = Number((await fs.readFile(portFile, "utf8")).split("\n")[0]);
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = pages.find(p => p.type === "page" && p.url.startsWith("vscode-file:") && p.url.endsWith("/workbench.html"));
  assert.ok(page, "Expected a workbench in the isolated test profile");
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    pending.get(message.id)?.(message);
  });
  async function send(method, params = {}) {
    const id = ++nextId;
    try {
      const response = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timed out running ${method}`)), 5000);
        pending.set(id, message => {
          clearTimeout(timer);
          resolve(message);
        });
        socket.send(JSON.stringify({ id, method, params }));
      });
      assert.ok(!response.error, JSON.stringify(response.error));
      return response.result;
    } finally {
      pending.delete(id);
    }
  }
  async function evaluate(expression) {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true });
    assert.ok(!result.exceptionDetails, result.exceptionDetails?.exception?.description);
    return result.result.value;
  }
  async function key(key, modifiers = 0) {
    const special = { Escape: 27, Enter: 13, F1: 112, Backspace: 8, ArrowDown: 40, ".": 190 };
    let code = key;
    if (key === ".") code = "Period";
    if (/^[a-z]$/i.test(key)) code = "Key" + key.toUpperCase();
    if (/^[0-9]$/.test(key)) code = "Digit" + key;
    const windowsVirtualKeyCode = special[key] ?? key.toUpperCase().charCodeAt(0);
    const args = { key, code, modifiers, windowsVirtualKeyCode };
    const text = key.length === 1 && !(modifiers & 7) ? key : undefined;
    await send("Input.dispatchKeyEvent", { ...args, type: "keyDown", text });
    await send("Input.dispatchKeyEvent", { ...args, type: "keyUp" });
  }
  await send("Page.bringToFront");
  return { port, evaluate, send, key, close: () => socket.close() };
}

exports.run = async function run() {
  const ui = await connectWorkbench();
  const command = (name, ...args) => vscode.commands.executeCommand(name, ...args);
  const config = vscode.workspace.getConfiguration("vimiumCode");
  const setting = (key, value) => config.update(key, value, vscode.ConfigurationTarget.Global);
  const overlay = 'document.getElementById("vimium-code-workbench-dom-overlay")';
  const picker = 'document.querySelector(".quick-input-widget")';
  const pickerVisible = `${picker}?.offsetHeight > 0`;
  const idePicker = () => ui.evaluate(`${pickerVisible} && ${picker}.contains(document.activeElement) &&
    ${picker}.querySelector(".quick-input-titlebar")?.textContent.includes("Vimium IDE Hints")`);
  const fixture = await vscode.extensions.getExtension("vimcode-tests.vimcode-ui-fixture").activate();

  async function focusDraft(webview) {
    await until("the fixture draft to acquire keyboard focus", async () => {
      await webview.postMessage("focusDraft");
      return fixture.focusedWebview === webview;
    });
  }

  function waitForEditorFocus() {
    return until("document editor keyboard focus", () => ui.evaluate(
      '!!document.activeElement?.closest(".part.editor .monaco-editor")'
    ));
  }

  async function runFromPalette(title) {
    await ui.key("F1");
    await until("Command Palette input", () => ui.evaluate(`${pickerVisible} && ${picker}.contains(document.activeElement) &&
      document.activeElement.value?.startsWith(">")`));
    await ui.send("Input.insertText", { text: `Vimium: ${title}` });
    await until(title, () => ui.evaluate(`${picker}.querySelector(".monaco-list-row.focused")?.textContent.includes(${JSON.stringify(title)})`));
    await ui.key("Enter");
  }

  async function openFromPalette() {
    await runFromPalette("Show IDE Navigation Hints");
    await until("command-backed hint picker", idePicker);
  }

  async function testEditorHintsFromSearch(editor) {
    await command("workbench.action.findInFiles");
    await until("Search box focus", () => ui.evaluate('!!document.activeElement?.closest(".search-view")'));
    await runFromPalette("Show Editor Navigation Hints");
    await waitForEditorFocus();
    await until("editor hints from Search", () => ui.evaluate('document.querySelector(".statusbar")?.textContent.includes("3 hints")'));
    await ui.key("a");
    await until("jump from Search to first line", () => editor.selection.active.line === 0);
    await ui.key("Escape");
    await until("command mode immediately after the jump", () => ui.evaluate('document.querySelector(".statusbar")?.textContent.includes("-- COMMAND --")'));
    await command("vimiumCode.exitCommandMode");
    console.log("PASS UI Search to editor hints, line jump and immediate Escape");
  }

  try {
    await setting("workbenchDomOverlayDebugPort", ui.port);
    await setting("preferWorkbenchDomOverlay", false);
    if (process.env.VIMCODE_UI_KEY_LOG) await command("workbench.action.toggleKeybindingsLog");
    const panel = fixture.openPanel();
    await until("fixture panel ready", () => fixture.latestInput === "");
    await focusDraft(panel.webview);
    for (const key of "fgjhkli") await ui.key(key);
    await until("unmodified webview editor draft", () => fixture.latestInput === "fgjhkli");

    await openFromPalette();
    await ui.key("Escape");
    await until("picker dismissed", async () => !await idePicker());
    assert.equal(fixture.latestInput, "fgjhkli");
    console.log("PASS UI webview editor typing, Command Palette and picker dismissal");

    // A native picker hides before keyboard focus finishes returning to its webview.
    await until("keyboard focus restored to the fixture panel", () => ui.evaluate(`
      document.activeElement instanceof HTMLIFrameElement &&
      new URL(document.activeElement.src).searchParams.get("extensionId") === "vimcode-tests.vimcode-ui-fixture"
    `));
    await openFromPalette();
    await ui.key("ArrowDown");
    await until("Search selected", () => ui.evaluate(`${picker}.querySelector(".monaco-list-row.focused")?.textContent.includes("Search")`));
    await ui.key("Enter");
    await until("Search view input", () => ui.evaluate('!!document.activeElement?.closest(".search-view")'));
    console.log("PASS UI Quick Pick arrows and Enter focus the highlighted view");

    await command("workbench.files.action.focusFilesExplorer");
    await until("Explorer tree keyboard focus", () => ui.evaluate(
      '!!document.activeElement?.closest(".part.sidebar .monaco-list")'
    ));
    await ui.key("F", 8);
    await until("IDE hints from the Explorer shortcut", idePicker);
    await ui.key("Escape");
    await until("Explorer hint picker dismissal", async () => !await idePicker());
    console.log("PASS UI Shift+F in the Explorer tree opens IDE hints");

    await command("vimcodeFixture.input.focus");
    await until("side view resolved", () => fixture.sideView && fixture.latestInput === "");
    await focusDraft(fixture.sideView.webview);
    for (const key of "gfhjk") await ui.key(key);
    await until("unmodified sidebar draft", () => fixture.latestInput === "gfhjk");
    console.log("PASS UI contributed sidebar webview typing");

    await setting("preferWorkbenchDomOverlay", true);
    await setting("autoAcceptExactHint", false);
    await command("vimiumCode.openWorkbenchHints");
    await until("renderer overlay", () => ui.evaluate(`!!${overlay}`));
    const label = await ui.evaluate(`${overlay}.firstElementChild.textContent.toLowerCase()`);
    for (const char of label) await ui.key(char);
    await until("one visible overlay label", () => ui.evaluate(`[...(${overlay}?.children || [])].filter(e => e.style.display !== "none").length === 1`));
    assert.equal(fixture.latestInput, "gfhjk");
    await ui.key("Backspace");
    await ui.key("Escape");
    await until("overlay dismissed", async () => !await ui.evaluate(`!!${overlay}`));
    await command("vimiumCode.openWorkbenchHints");
    await until("reopened overlay", () => ui.evaluate(`!!${overlay}`));
    await command("vimiumCode.cancelHint");
    await until("overlay removed by command", async () => !await ui.evaluate(`!!${overlay}`));
    console.log("PASS UI forced overlay, manual acceptance setting, backspace and cancellation");

    await setting("autoAcceptExactHint", true);
    const document = await vscode.workspace.openTextDocument({ content: "alpha\nbeta\ngamma" });
    const editor = await vscode.window.showTextDocument(document);
    await command("workbench.action.focusActiveEditorGroup");
    await waitForEditorFocus();
    await ui.key("f");
    await until("a literal f in the editor", () => document.getText().startsWith("falpha"));
    await ui.key("j", 1); // Alt+J
    await until("editor hint status", () => ui.evaluate('document.querySelector(".statusbar")?.textContent.includes("3 hints")'));
    await ui.key(".");
    await ui.key("S", 8); // Shift+S as displayed on the line label
    await until("the second editor line", () => editor.selection.active.line === 1);
    assert.equal(document.getText(), "falpha\nbeta\ngamma");
    console.log("PASS UI editor typing, punctuation during hints and shifted line label");
    await testEditorHintsFromSearch(editor);

    // A tab in the renderer is a real workbench control with an observable effect.
    await setting("autoAcceptExactHint", false);
    await command("vimiumCode.openWorkbenchHints");
    await until("overlay over editor tabs", () => ui.evaluate(`!!${overlay}`));
    const tabLabel = await ui.evaluate(`(() => {
      const tab = [...document.querySelectorAll(".tabs-container .tab")].find(t => t.textContent.includes("Fixture draft"));
      const rect = tab?.getBoundingClientRect();
      return rect && [...${overlay}.children].find(e => Math.abs(parseFloat(e.style.left) - rect.left - 2) < 1
        && Math.abs(parseFloat(e.style.top) - rect.top - 2) < 1)?.textContent.toLowerCase();
    })()`);
    assert.ok(tabLabel, "The background webview tab should have a visible overlay label");
    for (const char of tabLabel) await ui.key(char);
    assert.ok(!panel.active, "Exact overlay label should wait for Enter");
    await ui.key("Enter");
    await until("activation of the selected webview tab", () => panel.active);
    console.log("PASS UI overlay activates the chosen webview tab on Enter");

    const output = new vscode.EventEmitter();
    let terminalInput = "";
    const terminal = vscode.window.createTerminal({
      name: "VimCode input fixture",
      pty: { onDidWrite: output.event, open() {}, close() {}, handleInput(text) { terminalInput += text; } }
    });
    const terminalFocused = () => ui.evaluate('!!document.activeElement?.closest(".xterm")');
    try {
      await setting("preferWorkbenchDomOverlay", false);
      terminal.show();
      await until("terminal keyboard focus", terminalFocused);
      for (const char of "fgjhk") await ui.key(char);
      await until("literal terminal input", () => terminalInput === "fgjhk");
      await ui.key("j", 1);
      await until("Alt+J opens IDE hints from the terminal", idePicker);
      await ui.key("Escape");
      await until("terminal keyboard focus after picker dismissal", terminalFocused);
      await ui.key("p");
      await until("terminal input after leaving the picker", () => terminalInput === "fgjhkp");
      console.log("PASS UI terminal Alt+J opens the IDE picker and preserves shell input");

      await setting("preferWorkbenchDomOverlay", true);
      await ui.key("j", 1);
      await until("Alt+J opens an overlay from the terminal", () => ui.evaluate(`!!${overlay}`));
      await ui.key("Escape");
      await until("terminal keyboard focus after overlay dismissal", terminalFocused);
      await ui.key("q");
      await until("terminal input after leaving the overlay", () => terminalInput === "fgjhkpq");
      console.log("PASS UI terminal Alt+J opens the overlay and Escape restores typing");

      const editorWithTerminal = await vscode.window.showTextDocument(document);
      await command("workbench.action.focusActiveEditorGroup");
      await waitForEditorFocus();
      assert.ok(await ui.evaluate('document.querySelector(".part.panel .xterm")?.checkVisibility()'),
        "Expected the terminal panel to stay visible while editing");
      editorWithTerminal.selection = new vscode.Selection(0, 0, 0, 0);
      await ui.key("j", 1);
      await until("editor line hints with the terminal panel open", () => ui.evaluate(
        'document.querySelector(".statusbar")?.textContent.includes("3 hints")'
      ));
      await ui.key("s");
      await ui.key("Enter");
      await until("editor line jump with the terminal panel open", () => editorWithTerminal.selection.active.line === 1);
      assert.equal(document.getText(), "falpha\nbeta\ngamma");
      assert.equal(terminalInput, "fgjhkpq");
      console.log("PASS UI editor Alt+J jumps to a line with the terminal panel open");
    } finally {
      terminal.dispose();
      output.dispose();
    }

    // A listening port may belong to another local service.
    const server = http.createServer((_req, res) => res.end("not a debugger"));
    try {
      await new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
      await setting("workbenchDomOverlayDebugPort", server.address().port);
      await command("vimiumCode.openWorkbenchHints");
      await until("picker fallback for malformed debugger response", idePicker);
      await ui.key("Escape");
    } finally {
      server.closeAllConnections();
      server.close();
      await setting("workbenchDomOverlayDebugPort", ui.port);
    }
    console.log("PASS UI unusable overlay endpoint falls back to the picker");

    if (process.env.VIMCODE_CODEX_PATH) {
      await setting("preferWorkbenchDomOverlay", false);
      await setting("autoAcceptExactHint", true);
      await command("vimiumCode.openWorkbenchHints");
      await until("Codex picker entry", () => ui.evaluate(`[...${picker}.querySelectorAll(".monaco-list-row")].some(r => r.textContent.includes("Codex"))`));
      const label = await ui.evaluate(`[...${picker}.querySelectorAll(".monaco-list-row")].find(r => r.textContent.includes("Codex")).querySelector(".label-name").textContent.trim().split(/\\s+/)[0].toLowerCase()`);
      for (const char of label) await ui.key(char);
      await until("Codex extension activation", () => vscode.extensions.getExtension("openai.chatgpt")?.isActive);
      await until("visible Codex webview", () => ui.evaluate(`[...document.querySelectorAll("iframe.webview")].some(e => e.offsetWidth && /codex|chatgpt/i.test([e.title,e.getAttribute("aria-label"),new URL(e.src).searchParams.get("extensionId")].join(" ")))`));
      const codexFocused = () => ui.evaluate(`document.activeElement instanceof HTMLIFrameElement &&
        new URL(document.activeElement.src).searchParams.get("extensionId") === "openai.chatgpt"`);
      // Cold activation can reveal the container before VS Code mounts the webview.
      await until("Codex webview mounted", () => ui.evaluate(`[...document.querySelectorAll("iframe.webview.ready")].some(e =>
        e.offsetWidth && new URL(e.src).searchParams.get("extensionId") === "openai.chatgpt")`));
      if (!await codexFocused()) await command("chatgpt.openSidebar");
      await until("keyboard focus in the Codex frame", codexFocused);
      await openFromPalette();
      await ui.key("Escape");
      console.log("PASS UI opened installed Codex via its hint and returned to IDE hints");
    }
    const resumedEditor = await vscode.window.showTextDocument(document);
    await command("workbench.action.focusActiveEditorGroup");
    await waitForEditorFocus();
    resumedEditor.selection = new vscode.Selection(1, 0, 1, 0);
    await ui.key("Escape");
    await until("editor command mode", () => ui.evaluate('document.querySelector(".statusbar")?.textContent.includes("-- COMMAND --")'));
    const beforeNavigation = document.getText();
    await ui.key("z");
    await ui.key("j");
    await until("command-mode movement", () => resumedEditor.selection.active.line === 2);
    assert.equal(document.getText(), beforeNavigation);
    await ui.key("i");
    await ui.key("x");
    await until("text entry after leaving command mode", () => document.getText().includes("xgamma"));
    await ui.key("Escape");
    await until("append command mode", () => ui.evaluate('document.querySelector(".statusbar")?.textContent.includes("-- COMMAND --")'));
    await ui.key("a");
    await ui.key("y");
    await until("text on the right of the cursor after append", () => document.getText().includes("xgyamma"));
    await ui.key("Escape");
    await until("open-line command mode", () => ui.evaluate('document.querySelector(".statusbar")?.textContent.includes("-- COMMAND --")'));
    await ui.key("o");
    await ui.key("z");
    await until("text on the newly opened line", () => document.getText().endsWith("xgyamma\nz"));
    console.log("PASS UI command-mode suppression, motion and rapid insert, append and open-line typing");

  } catch (error) {
    console.error("UI diagnostic", await ui.evaluate(`({
      focus: [document.activeElement?.tagName, document.activeElement?.className],
      hints: [...document.querySelectorAll(".statusbar-item")].map(e => e.textContent).filter(s => /vimium|hint|command --/i.test(s)),
      picker: document.querySelector(".quick-input-titlebar")?.textContent,
      webviews: [...document.querySelectorAll("iframe.webview")].map(e => [e.title, e.getAttribute("aria-label"), new URL(e.src).searchParams.get("extensionId")]),
      overlay: !!${overlay}
    })`));
    const logs = path.join(process.env.VIMCODE_TEST_PROFILE, "logs");
    for (const file of await fs.readdir(logs, { recursive: true })) {
      if (file.endsWith("renderer.log")) {
        const log = await fs.readFile(path.join(logs, file), "utf8");
        console.error(log.split("\n").filter(line => line.includes("[KeybindingService]")).slice(-18).join("\n"));
      }
    }
    throw error;
  } finally {
    ui.close();
  }
};
