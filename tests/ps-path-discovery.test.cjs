// Photoshop 主程序路径发现（desktop-mac/ps-interop.js）的回归测试。
// 全部用例在临时目录里造假的 .app 目录树，并向发现函数注入目录，
// 因此不依赖本机是否装了 Photoshop，也不会读写真实 /Applications。
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const psInterop = require("../desktop-mac/ps-interop.js");

const IS_WIN = process.platform === "win32";
// open -a / 假的可执行文件依赖 POSIX shell，仅在 macOS 上验证。
const ONLY_MAC = { skip: IS_WIN ? "open -a 行为仅在 macOS 上可验证" : false };

function makeSandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "canvasflow-ps-path-"));
  return {
    root,
    // 造一个 .app 目录（只建目录骨架，不需要真的 app 内容）
    app(relative) {
      const target = path.join(root, relative);
      fs.mkdirSync(target, { recursive: true });
      return target;
    },
    file(relative, content = "") {
      const target = path.join(root, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
      return target;
    },
    cleanup() {
      // 只删除本次用例自己创建的临时目录，且必须位于系统临时目录内
      const parent = path.resolve(os.tmpdir()) + path.sep;
      assert.ok(path.resolve(root).startsWith(parent));
      assert.ok(path.basename(root).startsWith("canvasflow-ps-path-"));
      try {
        fs.rmSync(root, { recursive: true, force: true });
      } catch (error) {
        // 宿主安全策略或杀软可能拒绝删除（.app 目录常被当成应用包保护）。
        // 清理失败不代表被测逻辑有问题，留下临时目录比误报失败更可取。
        console.warn(`[ps-path-discovery] 临时目录未能删除（${error.code || error.message}）：${root}`);
      }
    }
  };
}

// 准备 launchInPs 需要的运行环境：dataRoot 下的 ps-path.txt 决定"用户手动保存的路径"。
function prepareLaunch(dataRoot, savedAppPath) {
  psInterop.init({ dataRoot, appRoot: path.dirname(dataRoot) });
  if (savedAppPath !== undefined) {
    fs.mkdirSync(path.join(dataRoot, "data"), { recursive: true });
    fs.writeFileSync(path.join(dataRoot, "data", "ps-path.txt"), savedAppPath);
  }
}

async function waitForFile(target, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(target)) return true;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  return fs.existsSync(target);
}

test("Applications 根目录下直接挂载的 Adobe Photoshop.app 能被发现", () => {
  const sandbox = makeSandbox();
  try {
    const applications = sandbox.app("Applications");
    const expected = sandbox.app("Applications/Adobe Photoshop 2022.app");
    assert.equal(psInterop.defaultMacPhotoshopApp([applications]), expected);

    // 用符号链接指过去的安装也要能发现（旧实现不校验条目类型，不能比它更严格）
    const linkedApplications = sandbox.app("linked/Applications");
    fs.symlinkSync(expected, path.join(linkedApplications, "Adobe Photoshop 2022.app"), "dir");
    assert.equal(
      psInterop.defaultMacPhotoshopApp([linkedApplications]),
      path.join(linkedApplications, "Adobe Photoshop 2022.app")
    );
  } finally {
    sandbox.cleanup();
  }
});

test("Adobe 年份子目录里的 .app 能被发现（旧实现扫不到这一层）", () => {
  const sandbox = makeSandbox();
  try {
    const applications = sandbox.app("Applications");
    const expected = sandbox.app("Applications/Adobe Photoshop 2026/Adobe Photoshop 2026.app");
    // 干扰项：同目录下的非应用目录不应被当成候选
    sandbox.app("Applications/Adobe Photoshop 2026/Presets");
    assert.equal(psInterop.defaultMacPhotoshopApp([applications]), expected);
    assert.equal(psInterop.photoshopVersionYear(expected), 2026);
  } finally {
    sandbox.cleanup();
  }
});

test("多个版本共存时按版本年份取最新，而不是对路径做字符串排序", () => {
  const sandbox = makeSandbox();
  try {
    const applications = sandbox.app("Applications");
    sandbox.app("Applications/Adobe Photoshop 2024/Adobe Photoshop 2024.app");
    sandbox.app("Applications/Adobe Photoshop 2025/Adobe Photoshop 2025.app");
    const newest = sandbox.app("Applications/Adobe Photoshop 2026/Adobe Photoshop 2026.app");
    // "Adobe Photoshop (Beta).app" 在纯字符串排序里排在 "2026" 之后，
    // 若只比字符串会误选预发布版；按年份排序时应让正式版胜出。
    sandbox.app("Applications/Adobe Photoshop (Beta).app");
    assert.equal(psInterop.defaultMacPhotoshopApp([applications]), newest);
    assert.equal(psInterop.photoshopVersionYear("/x/Adobe Photoshop (Beta).app"), 0);
  } finally {
    sandbox.cleanup();
  }
});

test("系统与用户 Applications 并存时两个目录都扫描，仍取最新版本", () => {
  const sandbox = makeSandbox();
  try {
    const systemApplications = sandbox.app("system/Applications");
    const userApplications = sandbox.app("home/Applications");
    sandbox.app("system/Applications/Adobe Photoshop 2024/Adobe Photoshop 2024.app");
    const userNewest = sandbox.app("home/Applications/Adobe Photoshop 2026/Adobe Photoshop 2026.app");
    assert.equal(
      psInterop.defaultMacPhotoshopApp([systemApplications, userApplications]),
      userNewest
    );
    // 目录顺序不影响"取最新"
    assert.equal(
      psInterop.defaultMacPhotoshopApp([userApplications, systemApplications]),
      userNewest
    );

    // 用户目录里只有旧版本时，应取系统目录里的新版本
    const oldUserApplications = sandbox.app("old-home/Applications");
    sandbox.app("old-home/Applications/Adobe Photoshop 2021/Adobe Photoshop 2021.app");
    const newerSystemApplications = sandbox.app("new-system/Applications");
    const systemNewest = sandbox.app("new-system/Applications/Adobe Photoshop 2025/Adobe Photoshop 2025.app");
    assert.equal(
      psInterop.defaultMacPhotoshopApp([systemApplications, newerSystemApplications, oldUserApplications]),
      systemNewest
    );
  } finally {
    sandbox.cleanup();
  }
});

test("用户在设置里手动保存的有效路径优先于自动扫描结果", () => {
  const sandbox = makeSandbox();
  try {
    const applications = sandbox.app("Applications");
    sandbox.app("Applications/Adobe Photoshop 2026/Adobe Photoshop 2026.app");
    const savedOlder = sandbox.app("custom/Adobe Photoshop 2024.app");
    assert.equal(psInterop.resolvePhotoshopApp(savedOlder, [applications]), savedOlder);
  } finally {
    sandbox.cleanup();
  }
});

test("保存的路径已失效（应用被卸载）时自动回退到扫描结果", () => {
  const sandbox = makeSandbox();
  try {
    const applications = sandbox.app("Applications");
    const discovered = sandbox.app("Applications/Adobe Photoshop 2026/Adobe Photoshop 2026.app");
    const uninstalled = path.join(sandbox.root, "custom/Adobe Photoshop 2023.app");
    assert.equal(psInterop.resolvePhotoshopApp(uninstalled, [applications]), discovered);
  } finally {
    sandbox.cleanup();
  }
});

test("完全找不到 Photoshop 时抛出明确的中文错误并引导手动选择", () => {
  const sandbox = makeSandbox();
  try {
    const emptySystem = sandbox.app("empty/Applications");
    const missingDir = path.join(sandbox.root, "not-created-Applications");
    assert.equal(psInterop.defaultMacPhotoshopApp([emptySystem, missingDir]), "");
    assert.throws(
      () => psInterop.resolvePhotoshopApp("", [emptySystem, missingDir]),
      error => {
        assert.match(error.message, /未找到 Photoshop\.app/);
        assert.match(error.message, /手动选择/);
        return true;
      }
    );

    // 应用被删后残留的断链 .app 不算"已安装"：既不能被当成候选，
    // 也不能盖掉同一目录下仍然有效的旧版本。
    const danglingApplications = sandbox.app("dangling/Applications");
    fs.symlinkSync(
      path.join(sandbox.root, "已删除/Adobe Photoshop 2026.app"),
      path.join(danglingApplications, "Adobe Photoshop 2026.app"),
      "dir"
    );
    assert.equal(psInterop.defaultMacPhotoshopApp([danglingApplications]), "");
    assert.throws(
      () => psInterop.resolvePhotoshopApp("", [danglingApplications]),
      /未找到 Photoshop\.app/
    );
    const olderValid = sandbox.app("dangling/Applications/Adobe Photoshop 2024/Adobe Photoshop 2024.app");
    assert.equal(psInterop.defaultMacPhotoshopApp([danglingApplications]), olderValid);
  } finally {
    sandbox.cleanup();
  }
});

test("带空格的应用路径整体作为一个参数传给 open -a", ONLY_MAC, async () => {
  const sandbox = makeSandbox();
  const previousPath = process.env.PATH;
  try {
    const binDir = sandbox.app("bin");
    const logFile = path.join(sandbox.root, "open-args.log");
    fs.writeFileSync(
      path.join(binDir, "open"),
      `#!/bin/sh\nprintf '%s\\n' "$@" > ${JSON.stringify(logFile)}\n`,
      { mode: 0o755 }
    );
    const savedApp = sandbox.app("Adobe Photoshop 2026/Adobe Photoshop 2026.app");
    const imagePath = sandbox.file("output/poster 1.png", "png");
    prepareLaunch(sandbox.app("data-root"), savedApp);
    process.env.PATH = binDir + path.delimiter + previousPath;

    const result = await psInterop.launchInPs(imagePath, "", "");
    assert.deepEqual(result, { opened: true, path: imagePath });

    const args = fs.readFileSync(logFile, "utf-8").trim().split("\n");
    assert.deepEqual(args, ["-a", savedApp, imagePath]);
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
    sandbox.cleanup();
  }
});

test("open 启动失败时返回带目标路径的错误信息", ONLY_MAC, async () => {
  const sandbox = makeSandbox();
  const previousPath = process.env.PATH;
  try {
    const binDir = sandbox.app("bin");
    fs.writeFileSync(
      path.join(binDir, "open"),
      `#!/bin/sh\necho "Unable to find application named 'Adobe Photoshop 2026'" >&2\nexit 1\n`,
      { mode: 0o755 }
    );
    const savedApp = sandbox.app("Adobe Photoshop 2026/Adobe Photoshop 2026.app");
    const imagePath = sandbox.file("output/poster 2.png", "png");
    prepareLaunch(sandbox.app("data-root"), savedApp);
    process.env.PATH = binDir + path.delimiter + previousPath;

    await assert.rejects(
      () => psInterop.launchInPs(imagePath, "", ""),
      error => {
        assert.match(error.message, /无法打开 Photoshop/);
        assert.match(error.message, /退出码 1/);
        assert.ok(error.message.includes(savedApp), "错误信息应带出实际尝试的目标路径");
        return true;
      }
    );
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
    sandbox.cleanup();
  }
});

test("Windows 分支不受影响：仍走 photoshop.exe，不经过 mac 路径发现", ONLY_MAC, async () => {
  const sandbox = makeSandbox();
  const previousPath = process.env.PATH;
  const originalPlatform = process.platform;
  try {
    const binDir = sandbox.app("bin");
    const exeLog = path.join(sandbox.root, "photoshop-exe.log");
    const openLog = path.join(sandbox.root, "open-called.log");
    fs.writeFileSync(
      path.join(binDir, "photoshop.exe"),
      `#!/bin/sh\nprintf '%s\\n' "$@" > ${JSON.stringify(exeLog)}\n`,
      { mode: 0o755 }
    );
    fs.writeFileSync(
      path.join(binDir, "open"),
      `#!/bin/sh\ntouch ${JSON.stringify(openLog)}\n`,
      { mode: 0o755 }
    );
    const imagePath = sandbox.file("output/poster 3.png", "png");
    prepareLaunch(sandbox.app("data-root"), ""); // 未保存路径 → 退回 photoshop.exe
    process.env.PATH = binDir + path.delimiter + previousPath;
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    try {
      const result = await psInterop.launchInPs(imagePath, "", "");
      assert.deepEqual(result, { opened: true, path: imagePath });
      assert.ok(await waitForFile(exeLog), "Windows 分支应直接启动 photoshop.exe");
      assert.deepEqual(fs.readFileSync(exeLog, "utf-8").trim().split("\n"), [imagePath]);
      assert.equal(fs.existsSync(openLog), false, "Windows 分支不应调用 mac 的 open");
    } finally {
      Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
    }
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
    sandbox.cleanup();
  }
});
