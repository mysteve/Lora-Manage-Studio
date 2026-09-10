# 0.1.0 安装包构建验证

日期：2026-09-10。环境：本机 Windows x64，Node.js 22.20.0，Cargo 1.95.0，MSVC stable 工具链。

- `npm test`：13 个测试文件、44 项测试通过。
- `cargo test --locked --manifest-path src-tauri/Cargo.toml`：56 项通过，1 项需要 civitai.red 联网的测试按原配置跳过。
- `npm run release:check`：通过；通过子进程模拟 `v9.9.9` 标签，确认版本不一致时返回失败。
- `node --check scripts/release.mjs`：通过。
- `npm run release:windows`：完成 TypeScript 检查、Vite 生产构建、Rust 优化编译和 NSIS 打包。
- 检查本次生成的 NSIS 脚本，确认 `offlineInstaller`、WebView2 离线安装程序、INSTALL.md、LICENSE 及 React、Motion、Lucide、React Bits 许可证进入安装清单。
- 安装包：`release/v0.1.0/LoRA-Studio_0.1.0_windows-x64-setup.exe`，270278558 字节，约 257.8 MiB。发布目录同时生成安装说明、发布说明、许可证和 SHA-256 文件。

未执行真实安装、启动、覆盖升级、卸载或干净系统离线安装验收；未触发 GitHub Actions，未推送标签或公开发布。安装包尚未配置代码签名。上述测试和构建结果不能替代 `docs/RELEASE.md` 中的安装验收。
