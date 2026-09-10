# Windows Release

## 本地打包

需要 Windows x64、Node.js 22、Rust stable MSVC、Visual Studio C++ 构建工具及 Windows SDK。首次构建需联网下载 npm/Cargo 依赖、NSIS 工具和 WebView2 离线安装程序；不要把构建电脑需要联网与目标电脑安装需要联网混淆。

在仓库根目录执行：

```powershell
npm ci
npm run release:check
npm test
cargo test --locked --manifest-path src-tauri/Cargo.toml
npm run release:windows
```

脚本会检查版本、构建生产前端和 Rust release 程序、生成 NSIS 安装包，再将安装包、安装说明、许可证、发布说明和 SHA-256 校验文件整理到 `release/v<版本>/`。原始安装包在 `src-tauri/target/release/bundle/nsis/`。产物目录已被 Git 忽略。

`src-tauri/tauri.conf.json` 控制产品名、标识符、图标、许可证资源、安装语言和 WebView2 打包方式。默认使用 `offlineInstaller`，包体积会较大，但安装时无需在线下载 WebView2。保持 `identifier` 为 `studio.lora.desktop`，避免影响用户数据路径与升级识别。

前端静态资源嵌入程序，SQLite 使用 bundled 特性编译；不需要把源码、node_modules 或开发服务器封装进去。独立文档及组件许可证通过明确的 resources 清单包含，不复制本机数据库、模型或凭据。

## 版本与 GitHub 发布

1. 同步修改 `package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` 的三段版本号；执行 `npm install --package-lock-only --ignore-scripts` 和 `cargo check --manifest-path src-tauri/Cargo.toml` 更新两个锁定文件。
2. 运行 `npm run release:check`，完成测试并提交所需改动。
3. 在准备发布的提交上创建 `v<版本>` 标签并推送，例如 `git tag v0.1.0`、`git push origin v0.1.0`。推送标签会触发 `.github/workflows/release.yml`。
4. 工作流测试、构建并上传 Actions 产物，同时创建 GitHub Release 草稿。下载测试通过后，在 GitHub 补充版本说明并手动发布草稿。

Actions 的手动运行仅生成工作流产物，不创建 Release。工作流使用仓库内置 `GITHUB_TOKEN`，需要允许工作流写入 Releases。已有同名 Release 时创建步骤会失败，避免自动覆盖现有发布附件；请先检查已有草稿再决定如何处理。

应用已从 `mysteve/Lora-Manage-Studio` 的正式 Release 检查新版本，草稿和预发布不会作为正式更新显示；当前只提示用户前往发布页，不自动下载安装。仓库迁移时需同步修改前端项目地址和 Rust 更新地址。

## 发布前验收

- 在干净 Windows x64 环境安装，确认缺少 WebView2 时可离线安装并启动。
- 确认中文与英文安装向导、快捷方式、卸载和覆盖升级正常。
- 使用测试数据验证目录绑定、模型导入、图片显示、设置保存及网络功能。
- 核对升级保留原数据，卸载不误删绑定目录中的模型。
- 核对安装包 SHA-256 和版本号。

当前未配置 Windows Authenticode 签名，公开分发前可按团队证书方案加入签名。签名私钥和密码放在 CI Secrets，不进入仓库；校验和不能替代发布者签名。

参考：[Tauri Windows 安装包文档](https://v2.tauri.app/distribute/windows-installer/)。
