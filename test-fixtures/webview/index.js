const vscode = require("vscode");

exports.activate = function activate(context) {
  let latestInput;
  function attach(webview) {
    latestInput = undefined;
    webview.options = { enableScripts: true };
    context.subscriptions.push(webview.onDidReceiveMessage(message => {
      latestInput = message.value;
    }));
    webview.html = `<!doctype html><html lang="en"><meta charset="utf-8">
      <label>Draft <textarea id="draft"></textarea></label>
      <script>
        const api = acquireVsCodeApi();
        const draft = document.getElementById('draft');
        const report = () => api.postMessage({value: draft.value});
        draft.addEventListener('input', report);
        draft.addEventListener('focus', report);
        window.addEventListener('message', event => {
          if (event.data === 'focusDraft') {
            draft.focus();
            api.postMessage({ value: draft.value, focusConfirmed: document.hasFocus() && document.activeElement === draft });
          }
        });
        report();
      </script></html>`;
  }
  let sideView;
  context.subscriptions.push(vscode.window.registerWebviewViewProvider("vimcodeFixture.input", {
    resolveWebviewView(view) {
      sideView = view;
      attach(view.webview);
    }
  }));
  return {
    get latestInput() { return latestInput; },
    get sideView() { return sideView; },
    openPanel() {
      const panel = vscode.window.createWebviewPanel("vimcodeFixture.draft", "Fixture draft", vscode.ViewColumn.One);
      attach(panel.webview);
      context.subscriptions.push(panel);
      return panel;
    }
  };
};
