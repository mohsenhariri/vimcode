const { execFileSync } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { downloadAndUnzipVSCode, resolveCliPathFromVSCodeExecutablePath, runTests } = require("@vscode/test-electron");

function scrubExtensionHostEnvironment() {
  delete process.env.ELECTRON_RUN_AS_NODE;
  delete process.env.ELECTRON_NO_ATTACH_CONSOLE;

  for (const key of Object.keys(process.env)) {
    if (key.startsWith("VSCODE_")) {
      delete process.env[key];
    }
  }
}

function installVsix(executable, vsix, profileArgs) {
  const args = [...profileArgs, "--install-extension", path.resolve(vsix)];
  if (process.platform === "win32") {
    // Invoke the same CLI entry point as bin/code.cmd, without shell quoting.
    const cli = path.join(path.dirname(executable), "resources", "app", "out", "cli.js");
    execFileSync(executable, [cli, ...args], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      stdio: "inherit"
    });
  } else {
    execFileSync(resolveCliPathFromVSCodeExecutablePath(executable), args, { stdio: "inherit" });
  }
}

async function main() {
  const executableOverride = process.env.VSCODE_EXECUTABLE_PATH;
  const version = process.env.VSCODE_TEST_VERSION || "1.120.0";
  scrubExtensionHostEnvironment();

  const root = path.resolve(__dirname, "..");
  const ui = process.argv.includes("--ui");
  const vsix = ui && process.env.VIMCODE_VSIX;
  const extensionDevelopmentPath = vsix ? [] : [root];
  const extensionTestsPath = ui ? path.join(__dirname, "ui-tests.js") : path.join(root, "dist", "test", "suite", "index");
  const vscodeExecutablePath = executableOverride || await downloadAndUnzipVSCode(version);

  const profile = await fs.mkdtemp(path.join(os.tmpdir(), "vimcode-test-"));
  try {
    const userData = path.join(profile, "data");
    const profileArgs = [`--user-data-dir=${userData}`, `--extensions-dir=${path.join(profile, "extensions")}`];
    const launchArgs = [...profileArgs, "--disable-telemetry"];
    if (ui) {
      extensionDevelopmentPath.push(path.join(root, "test-fixtures", "webview"));
      if (process.env.VIMCODE_CODEX_PATH) {
        extensionDevelopmentPath.push(path.resolve(process.env.VIMCODE_CODEX_PATH));
      }
      if (vsix) {
        installVsix(vscodeExecutablePath, vsix, profileArgs);
      }
      const workspace = path.join(profile, "workspace");
      await fs.mkdir(workspace);
      launchArgs.unshift(workspace);
      launchArgs.push("--remote-debugging-port=0");
    }
    await runTests({
      vscodeExecutablePath,
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs,
      extensionTestsEnv: { VIMCODE_TEST_PROFILE: userData }
    });
  } finally {
    await fs.rm(profile, { recursive: true, force: true, maxRetries: 5 });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
