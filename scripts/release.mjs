import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const read = (path) => readFileSync(path, 'utf8');
const pkg = JSON.parse(read('package.json'));
const config = JSON.parse(read('src-tauri/tauri.conf.json'));
const lock = JSON.parse(read('package-lock.json'));
const cargoVersion = read('src-tauri/Cargo.toml').match(/\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m)?.[1];
const cargoLockVersion = read('src-tauri/Cargo.lock').match(/\[\[package\]\]\s+name = "lora-studio"\s+version = "([^"]+)"/)?.[1];
const version = pkg.version;
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
  throw new Error('正式版本必须使用 major.minor.patch 格式');
}
if ([config.version, lock.version, lock.packages[''].version, cargoVersion, cargoLockVersion].some((v) => v !== version)) {
  throw new Error('package.json、package-lock.json、tauri.conf.json、Cargo.toml 和 Cargo.lock 的版本必须一致');
}
if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME !== `v${version}`) {
  throw new Error(`Git 标签必须为 v${version}`);
}
console.log(`Release 配置检查通过：v${version}`);
if (process.argv.includes('--check')) process.exit(0);
if (process.platform !== 'win32' || process.arch !== 'x64') {
  throw new Error('本脚本需要 Windows x64 和 MSVC Rust 工具链');
}

// 固定产物目录，避免 Cargo 全局配置改变输出位置后误取旧文件。
const targetDir = join(root, 'src-tauri', 'target');
const build = spawnSync(process.execPath, [
  'node_modules/@tauri-apps/cli/tauri.js', 'build', '--ci', '--bundles', 'nsis', '--', '--locked',
], { stdio: 'inherit', env: { ...process.env, CARGO_TARGET_DIR: targetDir } });
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);
const installerName = `${config.productName}_${version}_x64-setup.exe`;
const installer = join(targetDir, 'release', 'bundle', 'nsis', installerName);
if (!existsSync(installer)) throw new Error(`未找到安装包：${installer}`);
const out = join(root, 'release', `v${version}`);
mkdirSync(out, { recursive: true });
const outputName = `LoRA-Studio_${version}_windows-x64-setup.exe`;
copyFileSync(installer, join(out, outputName));
copyFileSync('docs/INSTALL.md', join(out, 'INSTALL.md'));
copyFileSync('LICENSE', join(out, 'LICENSE'));
copyFileSync('THIRD_PARTY_NOTICES.md', join(out, 'THIRD_PARTY_NOTICES.md'));
const hash = createHash('sha256').update(readFileSync(join(out, outputName))).digest('hex');
writeFileSync(join(out, 'SHA256SUMS.txt'), `${hash}  ${outputName}\n`);
writeFileSync(join(out, 'RELEASE_NOTES.md'), `# LoRA Studio v${version}\n\nWindows x64 安装包，包含应用界面、本地服务、静态资源、许可证及 WebView2 离线安装程序。\n\n双击 ${outputName} 安装，详细步骤见 INSTALL.md。无需安装 Node.js、Rust 或 SQLite。ComfyUI 和模型需自行准备。\n\n安装包尚未配置 Windows 代码签名。SHA256SUMS.txt 用于核对文件完整性。\n`);
console.log(`发布文件已生成：${out}`);
