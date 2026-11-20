const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

test("Bash launchers preserve CLI arguments and resolve symlinks", { skip: process.platform === "win32" }, (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "vimcode-launcher-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const bin = path.join(directory, "linked bin");
  const upstream = path.join(directory, "real bin");
  const searchPath = [bin, __dirname, upstream, process.env.PATH].join(path.delimiter);
  fs.mkdirSync(bin);
  fs.mkdirSync(upstream);
  for (const command of ["code", "code-insiders"]) {
    const wrapper = path.join(bin, command);
    fs.symlinkSync(path.relative(bin, path.join(__dirname, command)), wrapper);
    // A fake VS Code CLI reports the exact arguments it received.
    const mockCli = "#!/usr/bin/env node\nconsole.log(JSON.stringify(process.argv.slice(2)));\n";
    fs.writeFileSync(path.join(upstream, command), mockCli, { mode: 0o755 });
    function launch(args, expected, debugPort = "9333") {
      const result = spawnSync(wrapper, args, {
        env: { ...process.env, VIMIUM_CODE_DEBUG_PORT: debugPort, PATH: searchPath },
        encoding: "utf8",
        timeout: 5000
      });
      assert.ifError(result.error);
      if (expected === undefined) {
        assert.equal(result.status, 2);
        assert.match(result.stderr, /Invalid Vimium debug port/);
      } else {
        assert.equal(result.status, 0, result.stderr);
        assert.deepEqual(JSON.parse(result.stdout), expected);
      }
    }
    launch([], [], "unused");
    launch(["--vim", "a folder"], ["--remote-debugging-port=9333", "a folder"]);
    launch(["--vim-port=0099", "--", "--vim"], ["--remote-debugging-port=99", "--", "--vim"]);
    launch(["--vim", "--vim=false", "."], ["."]);
    launch(["--vim", "--remote-debugging-port=9888"], ["--remote-debugging-port=9888"], "unused");
    launch(["--vim-port=65536"], undefined);
    launch(["--vim-port=0"], undefined);
  }
});
