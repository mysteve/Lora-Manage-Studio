# 项目目录与维护约定

仓库根目录是包含 `package.json`、`src` 和 `src-tauri` 的目录。开发、测试和构建命令均在这里执行。

```text
.
├── src/                         React 前端
│   ├── main.tsx                 页面挂载入口
│   ├── env.d.ts                 Vite 环境类型
│   ├── app/
│   │   └── App.tsx              应用布局、导航与页面组合
│   ├── features/                按业务功能组织的组件
│   │   ├── models/Detail.tsx    模型详情与配方编辑
│   │   └── settings/           设置面板与 API 密钥、登录授权组件
│   ├── components/              多个业务模块共用的组件
│   │   ├── ui.tsx               弹窗、封面、搜索和状态展示
│   │   └── WindowControls.tsx   桌面窗口按钮
│   ├── lib/
│   │   ├── api.ts               Tauri 调用与桌面能力适配
│   │   ├── utils.ts             格式化、搜索和配方工具
│   │   └── utils.test.ts        与实现相邻的单元测试
│   ├── types/models.ts          前后端交互数据与页面类型
│   ├── dev/                     开发预览适配及示例数据
│   └── styles/global.css        全局样式
├── src-tauri/                   Tauri 桌面端
│   ├── src/
│   │   ├── main.rs              可执行程序入口
│   │   ├── lib.rs               应用初始化、共享状态与命令注册
│   │   ├── commands.rs          前端可调用的 Tauri 命令
│   │   ├── types.rs             Rust 数据类型
│   │   ├── services/            授权、下载、网站访问、本地模型与目录绑定
│   │   └── persistence/db.rs    SQLite 数据库与任务恢复
│   ├── capabilities/           桌面能力权限
│   ├── icons/                  应用与安装包图标
│   ├── tauri.conf.json          桌面窗口与打包配置
│   ├── Cargo.toml              Rust 依赖与构建设置
│   ├── Cargo.lock              Rust 依赖锁定文件
│   └── build.rs                Tauri 构建入口
├── docs/
│   ├── PROJECT_STRUCTURE.md    目录说明与维护约定
│   ├── OAUTH_SETUP.md          API 密钥与自动登录配置
│   ├── design/                 设计规范、效果图与生成提示词
│   └── verification/           历史验收记录、截图与结果数据
├── public/                     前端静态素材，包括应用图标
├── index.html                  Vite HTML 入口
├── package.json                前端依赖与项目命令
├── package-lock.json           前端依赖锁定文件
├── tsconfig.json               TypeScript 配置
├── vite.config.ts              前端开发与构建配置
└── README.md                   使用、开发与打包说明
```

## 新文件放置原则

- 业务组件放入 `src/features/<功能>/`，被多个功能复用后再移入 `src/components/`。
- 应用布局与跨页面协调放入 `src/app/`。当前页面主体仍由 `App.tsx` 组合，后续可按功能逐步拆分。
- 桌面 API 适配和公共工具放入 `src/lib/`，共享数据类型放入 `src/types/`。
- 前端单元测试使用 `*.test.ts` 或 `*.test.tsx`，与被测试文件放在一起。Rust 单元测试保留在对应模块的 `#[cfg(test)]` 中。
- 预览实现和示例数据仅放入 `src/dev/`，通过 `lib/api.ts` 的开发模式判断动态加载。
- Rust 命令放入 `commands.rs`，业务处理放入 `services/`，数据库实现放入 `persistence/`。新增 Rust 模块需要在对应 `mod.rs` 中声明。
- 说明文档及设计、验收素材放入 `docs/`。历史验收记录描述当时的验证结果，不代表每次变更都重新完成了这些验证。

## 生成文件与本地数据

`node_modules/`、`dist/`、`src-tauri/target/` 和 `src-tauri/gen/schemas/` 为依赖或生成文件，不纳入 Git。`.test-data/` 为本地联调数据，`app/`、`release/` 为本地安装或发布目录，同样不纳入 Git。

应用默认用户数据仍在 `%APPDATA%\studio.lora.desktop\`，实际模型仍保存在绑定的 ComfyUI 目录下。源码目录调整不迁移这些数据。
