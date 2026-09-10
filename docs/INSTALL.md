# LoRA Studio 安装说明

适用环境：Windows 10/11 x64。

1. 双击发布目录中的 `LoRA-Studio_*_windows-x64-setup.exe`。
2. 选择安装语言和安装位置，按向导完成安装。
3. 启动 LoRA Studio，在设置的工作空间中绑定 ComfyUI 根目录。

安装包包含生产版前端、Rust 程序、静态图片、SQLite 支持、项目许可证及已收录的组件许可证，并内置 Microsoft WebView2 离线安装程序。目标电脑不需要 Node.js、npm 或 Rust；缺少 WebView2 时由安装程序安装，系统组件安装可能需要管理员授权。安装后在线发现、下载和 API 功能仍需网络。

ComfyUI、Python、模型文件及个人 API 密钥需自行准备，不包含在安装包中。应用默认安装到当前用户目录。

升级前关闭正在运行的 LoRA Studio，运行新版安装包并沿用原安装位置。应用数据位于 `%APPDATA%\studio.lora.desktop\`，模型保存在绑定目录。重要数据建议先备份；卸载时如出现删除应用数据选项，仅在确认不再需要时选择。

当前安装包未配置 Windows 代码签名。请核对下载来源；可使用 PowerShell 的 `Get-FileHash -Algorithm SHA256 <安装包路径>`，与 `SHA256SUMS.txt` 比较。
