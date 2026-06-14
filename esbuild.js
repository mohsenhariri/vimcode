const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");
const root = __dirname;
const dist = path.join(root, "dist");

function collectTypeScriptFiles(directory) {
  if (!fs.existsSync(directory)) {
    return [];
  }

  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return collectTypeScriptFiles(fullPath);
    }

    return entry.isFile() && entry.name.endsWith(".ts") ? [fullPath] : [];
  });
}

const sharedOptions = {
  bundle: false,
  format: "cjs",
  logLevel: "info",
  platform: "node",
  sourcemap: !production,
  sourcesContent: !production,
  target: "node18"
};

const extensionConfig = {
  ...sharedOptions,
  bundle: true,
  entryPoints: [path.join(root, "src", "extension.ts")],
  external: ["vscode"],
  minify: production,
  outfile: path.join(root, "dist", "extension.js")
};

const testFiles = collectTypeScriptFiles(path.join(root, "src", "test"));
const testConfig = {
  ...sharedOptions,
  entryPoints: testFiles,
  outbase: path.join(root, "src"),
  outdir: path.join(root, "dist")
};

async function build() {
  if (!watch) {
    fs.rmSync(dist, { recursive: true, force: true });
  }

  const shouldBuildTests = !production && testFiles.length > 0;
  const configs = shouldBuildTests ? [extensionConfig, testConfig] : [extensionConfig];

  if (watch) {
    const contexts = await Promise.all(configs.map((config) => esbuild.context(config)));
    await Promise.all(contexts.map((context) => context.watch()));
    console.log("Watching for changes...");
    return;
  }

  await Promise.all(configs.map((config) => esbuild.build(config)));
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
