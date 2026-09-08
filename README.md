# LoRA Studio

面向 Windows 的本地 LoRA 管理器。Rust 后端 + Tauri 2 桌面窗口 + React/TypeScript 界面，默认使用 civitai.red。

## 开始使用

按下文“本地开发”准备环境并执行 `npm run tauri -- build`，安装 `src-tauri/target/release/bundle/nsis/` 中生成的 Windows 安装包，然后打开 **LoRA Studio**。

仓库包含源码、设计图和验收记录；安装包、模型文件、用户数据库与本机缓存不纳入 Git。

窗口采用与深色界面融合的无边框设计。拖动左上角 Logo 或顶部面包屑区域可以移动窗口，双击可最大化/还原；右上角提供最小化、最大化/还原与关闭按钮，关闭时仍会提醒尚未保存的配方。

1. 首次启动会打开 **设置**，绑定 ComfyUI 根目录（包含 `main.py`），也支持选择包含 `ComfyUI` 子目录的便携版文件夹。可以先关闭设置浏览模型，下载前再绑定。
2. 保存后自动使用根目录下的 `models/loras`，缺失时自动创建。以后点击侧栏 ComfyUI 卡片或设置即可更换根目录。无需配置地址或启动 ComfyUI。
3. 在 **在线发现** 搜索模型，或者粘贴 civitai.red 模型/版本/下载入口链接。
4. 查看模型详情，选择版本和 SafeTensor 文件，点击 **下载并安装**。
5. 下载经过大小和 SHA-256 校验后进入模型目录；在 ComfyUI 中刷新模型选项，并在 LoRA 加载节点选择文件。
6. **扫描本地模型** 可识别已有文件并联网补齐资料。未匹配文件仍能编辑名称、标签、备注、封面和个人配方。

应用仅与 ComfyUI 的本地目录关联，不检测运行状态或请求它的接口，也不会修改工作流或开始生成。旧版标准 `models/loras` 路径可自动推导根目录；旧版外部路径会保留，重新绑定后使用新根目录下的 `models/loras`，原有模型不会被移动。

## 封面和提示词

- 每个模型版本可保存多份命名配方，包括正负提示词、模型权重、CLIP 权重和备注。
- 官方触发词和个人配方分别保存，更新网站资料不覆盖个人名称、标签、备注、收藏或自定义封面。
- “复制组合提示词”复制触发词与正向提示词；负向提示词单独复制。权重请填入 ComfyUI 节点。
- 模型详情可以选择网站图片、导入本地 PNG/JPEG/WebP、恢复网站封面。
- 同一版本的多个本地文件共享版本配方；未匹配文件具有独立配方。成功绑定网站版本时迁移配方关联。
- “移出管理库”保留文件与配方；“删除模型文件”经确认后移入 Windows 回收站。

## 下载与网络

- 默认同时下载 2 个文件，支持暂停、继续、取消、重试；重启后未完成任务显示为暂停，可手动继续。
- 下载临时文件保存在模型目录，使用 `.part` 后缀，校验后通过 Windows 原子移动安装，绝不覆盖已有同名文件。
- 服务器忽略 Range 时重新下载。没有网站 SHA-256 的文件恢复时重新下载，并验证大小与 SafeTensor 头部；不将其显示为 SHA-256 已验证。
- 每次继续或重试都会重新获取下载入口，跟随网站重定向。遇到登录权限或限流时给出相应提示。
- 设置支持系统代理、直接连接及 HTTP/SOCKS5 手动代理。
- 可选 API Token 保存在 **Windows 凭据管理器**，不会写入数据库、普通设置、错误日志或安装包。
- 安全内容默认开启，向网站请求安全内容，并过滤网站标记为非安全的封面图片。内容标记取决于网站资料。
- 首版仅下载 `.safetensors`；扫描也会登记 `.ckpt`、`.pt`、`.bin`，不会执行或反序列化模型内容。

## 数据位置与备份

- 管理数据库与封面：`%APPDATA%\studio.lora.desktop\`，也可在设置中查看确切路径。
- `library.sqlite` 保存设置、模型及版本资料、下载任务、个人配方；`covers` 保存封面缓存。
- 模型文件保存在已绑定 ComfyUI 根目录下的 `models/loras`。
- 备份时先关闭应用，复制整个应用数据目录及模型文件夹。API Token 不在这些备份中。
- 联调数据独立存放在源码项目 `.test-data` 中，不打入安装包，也不会作为用户默认模型目录。

## 本地开发

环境要求：Windows 10/11 x64、Node.js 20+、Rust stable MSVC、Visual Studio Build Tools 的 C++ 工作负载与 Windows SDK、WebView2 Runtime。

```powershell
npm ci
npm run tauri -- dev
```

独立前端布局预览（明确标注为示例数据，不会下载或写入模型）：

```powershell
npm run dev
# 浏览器访问 http://127.0.0.1:1420/?preview=1
# 空状态：http://127.0.0.1:1420/?preview=1&empty=1
```

浏览器预览只在 Vite 开发模式启用。正式构建不包含预览数据；真实桌面版通过 Tauri 命令调用 Rust。

```powershell
npm run build
npm test
cargo test --manifest-path src-tauri/Cargo.toml --lib
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
npm run tauri -- build
```

安装包输出：`src-tauri/target/release/bundle/nsis/`。双击安装包即可安装；构建出的独立程序仍依赖 WebView2 Runtime，安装包会在需要时引导安装。

## 项目结构

- `src`：界面、Tauri 命令适配、开发预览和前端测试。
- `src-tauri/src`：网站 API、下载与校验、本地扫描、SQLite、凭据和桌面生命周期。
- `design`：4 张内置 ImageGen 效果图、全部提示词及视觉规范。
- `design/verification`：实现截图、真实下载验证记录及验收说明。

模型信息与图片属于对应作者，示例资料来自 civitai.red；下载和使用模型时遵循作者在网站上提供的使用条件。
