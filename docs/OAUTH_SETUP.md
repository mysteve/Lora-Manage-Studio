# Civitai 登录与 API 密钥

## 直接使用

在设置的 API 密钥区域输入或粘贴密钥，点击保存密钥即可生效，无需再次保存其他设置。输入新密钥会替换原有凭据，留空不会清除；清除本机凭据按钮只清除本机保存的信息，不撤销网站上的密钥或授权。

获取个人 API 密钥的步骤：

1. 自行在浏览器打开 `civitai.red/user/account` 并登录 Civitai 账号。也可以打开 [Civitai 账户设置](https://civitai.com/user/account)。
2. 找到 API Keys（API 密钥），创建一个新密钥，名称可填 LoRA Studio。
3. 复制生成的完整密钥。
4. 回到应用，将密钥粘贴到输入框，点击保存密钥即可。

手动输入使用个人 API Key，无需注册 OAuth 应用。

浏览器布局预览禁止保存真实密钥，请使用桌面应用。

## 启用自动授权

当前设置中的网页登录和自动授权入口暂时隐藏。相关实现保留，恢复时需将 `src/features/settings/ApiAccess.tsx` 的 `SHOW_WEBSITE_LOGIN` 设为 `true`，再按下文配置 Client ID。

自动授权需要先在 [Civitai 账户设置](https://civitai.com/user/account) 的 OAuth Applications 中为 LoRA Studio 注册应用。选择 Public 客户端，不要在桌面程序中嵌入 Client Secret。允许读取用户、模型和媒体，对应范围为 UserRead、ModelsRead、MediaRead，组合值为 `37`。

应用采用官方 Device Authorization 流程：获取设备验证码，打开系统浏览器登录和授权，按服务器要求等待并查询授权结果，成功后由 Rust 后端直接保存凭据。此流程无需应用回调地址，也不会读取浏览器 Cookie 或现有 API 密钥。

拿到自己的 Client ID 后，在仓库根目录的 PowerShell 中执行：

```powershell
$env:LORA_STUDIO_OAUTH_CLIENT_ID = '注册应用后获得的 Client ID'
npm run tauri -- dev
```

正式发布时，在同样设置了该环境变量的终端执行：

```powershell
npm run tauri -- build
```

Client ID 会嵌入 Rust 构建，它是公开的应用标识。运行时的同名环境变量可以覆盖构建值。普通使用者不需要自行配置；发布者配置好后，设置中的登录并自动获取按钮会自动启用。未配置时，界面说明原因并继续提供手动输入。

修改代理设置后，请先保存设置，再开始授权。授权请求使用当前已保存的代理配置。

## 凭据与有效期

- 手动 API 密钥及 OAuth 凭据存入 Windows 凭据管理器的同一条应用凭据，保留对旧版手动密钥的兼容。
- 自动授权返回访问令牌和刷新令牌，不会提取个人 API 密钥。前端只获得授权状态、设备验证码和登录链接。
- 调用网站和开始下载前，后端会在访问令牌即将过期时刷新，并同时替换刷新令牌。刷新请求串行执行，避免重复使用已轮换的刷新令牌。
- 授权被拒绝、验证码过期、网络失败和限流均有对应处理。关闭设置或取消登录会停止等待；已完成授权和已保存凭据不会因关闭设置撤销。
- API 和 OAuth 凭据都不写入数据库或日志。授权服务错误只映射为固定提示，不向界面回传原始响应。

协议依据：[Civitai 官方 OAuth 开发文档](https://github.com/civitai/civitai/blob/main/docs/auth/oauth-developer-docs.md)。当前项目未提供已注册的 Client ID，因此尚未完成真实账号登录、令牌续期及 `civitai.red` 对授权令牌的兼容性联调。
