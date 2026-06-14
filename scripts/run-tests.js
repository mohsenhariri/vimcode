const path = require("node:path");
const { runTests } = require("@vscode/test-electron");

function scrubExtensionHostEnvironment() {
  delete process.env.ELECTRON_RUN_AS_NODE;
  delete process.env.ELECTRON_NO_ATTACH_CONSOLE;

  for (const key of Object.keys(process.env)) {
    if (key.startsWith("VSCODE_")) {
      delete process.env[key];
    }
  }
}

async function main() {
  scrubExtensionHostEnvironment();

  const extensionDevelopmentPath = path.resolve(__dirname, "..");
  const extensionTestsPath = path.resolve(__dirname, "..", "dist", "test", "suite", "index");

  await runTests({
    version: "1.120.0",
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: ["--disable-workspace-trust"]
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
