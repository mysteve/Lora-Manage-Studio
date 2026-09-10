# LoRA Studio 项目协作指南

## 适用范围与沟通

本文件适用于当前仓库及其子目录。仓库根目录是包含 `package.json`、`src/` 和 `src-tauri/` 的目录；所有下述命令均从这里执行。用户在当前任务中的明确要求优先于本文件。更深目录有专门约定时，同时遵守其适用范围。

- 使用自然、易懂的中文，保留必要的技术关键词；代码标识符沿用项目英文命名。
- 除非用户要求逐字引用，不使用 Unicode U+201C、U+201D 中文引号。
- 不生造词，不为简短而缩减专业术语，避免翻译腔和无必要的否定对比句式。
- 完成后说明具体改动、实际验证结果和未验证的范围，不把历史验收结果当成本次验证。

## 产品与技术栈

LoRA Studio 是面向 Windows 的本地 LoRA 管理工具，供 ComfyUI 用户管理模型、收藏、触发词、配方和预览图，并从 civitai.red 搜索和下载模型。

- 前端：React 19、TypeScript、Vite，使用 npm 和 `package-lock.json`。
- 桌面端：Tauri 2、Rust 2021、Tokio；SQLite 保存应用数据，reqwest 处理网站访问和下载。
- 界面：普通 CSS、Lucide 静态图标、Motion 动效、Morphicons 图标形变，以及按源码引入的 React Bits 组件。
- 主导航：我的模型、在线发现、下载中心、收藏模型、提示词配方。设置使用内嵌页面，内部按工作空间、网站访问、AI 接入分为三个标签页，各自保存，切换标签保留草稿；详情由页面状态切换；当前没有引入前端路由库。
- 绑定 ComfyUI 根目录后使用其 `models/loras` 目录，不要求 ComfyUI 正在运行，不重新加入运行检测或虚构连接状态。

依赖的准确版本以当前清单及锁定文件为准。新增功能优先复用现有能力；不要为局部修改迁移框架、样式体系或整批升级依赖。

## 目录与职责

| 位置 | 职责 |
| --- | --- |
| `src/main.tsx` | React 挂载、StrictMode、全局 MotionConfig |
| `src/app/App.tsx` | 布局、导航、页面组合、跨页面状态和桌面事件订阅 |
| `src/features/models/` | 模型导入、详情、资料编辑、触发词组合和预览图；`ImageGallery` 负责示例图切换及图片生成参数 |
| `src/features/discover/` | 网站内容分类、基础模型筛选及相关组件 |
| `src/features/about/` | 关于弹窗、统一版本号、发布版本比较及组件许可证示例；左上角品牌按钮打开 |
| `src/features/settings/` | ComfyUI 目录、代理、API 密钥及 AI 接入设置 |
| `src/features/outputs/` | 输出结果图片列表、分页与放大预览；默认读取 ComfyUI 的 output，可在工作空间设置中自定义查看目录。按记录中的 LoRA 文件路径关联模型库，同名候选全部展示；打开库详情后返回恢复图片和页码 |
| `src-tauri/src/services/outputs.rs` | 输出目录校验、递归图片扫描及打开目录；仅允许当前页图片通过本地资源协议访问，不跟随符号链接 |
| `src-tauri/src/services/output_metadata.rs` | 读取输出图片的 PNG 文本和 JPEG/WebP EXIF 生成记录，限制文本大小，保留 64 位种子精度；前端 `generationMetadata.ts` 整理采样节点、提示词和模型信息 |
| `src/components/ui.tsx` | Modal、CoverImage、SearchInput、Badge、Empty、Loading、ErrorBox |
| `src/components/Motion.tsx` | PageTransition、NavIndicator、StateIcon 和 easeOut |
| `src/components/react-bits/` | 按需引入的 React Bits 源码、来源说明和许可证 |
| `src/components/WindowControls.tsx` | 桌面窗口按钮 |
| `src/lib/` | 桌面能力适配、URL 校验、工具函数、动态效果偏好订阅 |
| `src/types/models.ts` | 前后端共享数据结构的 TypeScript 定义 |
| `src/dev/` | 仅供开发预览的接口适配和示例数据 |
| `src/styles/global.css` | 颜色变量、布局、公共样式、CSS 动效和响应式规则 |
| `src-tauri/src/commands.rs` | 提供给前端的 Tauri 命令 |
| `src-tauri/src/lib.rs` | 应用初始化、共享状态和命令注册 |
| `src-tauri/src/types.rs` | Rust 数据结构与序列化约定 |
| `src-tauri/src/services/updates.rs` | 通过 GitHub 正式发布 API 检查更新，沿用代理配置，不自动安装 |
| `src-tauri/src/services/ai.rs` | AI 配置、按服务地址隔离的凭据及模型列表查询；暂不执行翻译 |
| `src-tauri/src/services/cover_metadata.rs` | 后台补齐旧模型及下载记录的图片分级，仅合并预览资料，保留个人编辑和下载状态 |
| `src-tauri/src/services/` | 网站访问、授权、下载、本地模型、目录绑定和预览图处理 |
| `src-tauri/src/persistence/` | SQLite 持久化及任务恢复 |
| `src-tauri/capabilities/`、`src-tauri/tauri.conf.json` | 桌面权限、CSP、窗口及打包配置 |
| `docs/` | 项目说明、设计依据、验收记录与截图 |

业务组件放在对应 feature，共用后再抽到 components。新增 Rust 模块在对应 `mod.rs` 声明；避免继续把独立业务逻辑堆入 `App.tsx` 或 `commands.rs`。

## 开发与验证命令

| 目的 | 命令 |
| --- | --- |
| 按锁定版本安装前端依赖 | `npm ci` |
| 启动前端开发服务器 | `npm run dev` |
| 启动真实桌面开发程序 | `npm run tauri -- dev` |
| TypeScript 检查及生产构建 | `npm run build` |
| 前端测试 | `npm test` |
| Rust 测试 | `cargo test --manifest-path src-tauri/Cargo.toml` |
| Rust 格式检查 | `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` |
| Rust 静态检查 | `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` |
| Windows 安装包构建 | `npm run tauri -- build` |
| 提交前差异检查 | `git diff --check` |

桌面开发需要 Rust、Windows C++ 构建工具和 WebView2。先利用现有环境；缺失时明确说明，不擅自重装工具链。

- 默认开发端口为 1420，设置了 `strictPort`。先检查已有服务，不随意终止占用端口的进程。临时浏览器预览可以指定其他端口，真实 Tauri 开发应保持 Vite 与 `tauri.conf.json` 的 devUrl 一致。
- 浏览器界面验收使用开发服务器的 `http://127.0.0.1:1420/?preview`；其中包含明确标识的示例数据。`preview` 同时要求 `import.meta.env.DEV`，因此 `npm run preview` 提供的生产产物不会启用这些数据。
- 浏览器预览不能证明真实文件选择、下载、凭据保存、窗口控制或安装包行为正常；这类功能需要桌面验证。
- 前端逻辑改动运行相关测试和构建；Rust 改动运行相关测试及检查。只修改文档时检查路径、命令和内容一致性即可。
- 对重要行为增加有意义的测试。前端测试与实现相邻，命名为 `*.test.ts` 或 `*.test.tsx`；Rust 测试放在模块的 `#[cfg(test)]` 中。不要给简单样式或文字调整添加重复实现细节的测试。

## 前后端边界与用户数据

- 基础模型分类由 `services/classification_cache.rs` 缓存到 SQLite，有效期 3 天；`get_base_models` 的 `forceRefresh` 用于手动刷新，只有成功请求才更新时间。

- 业务命令通过 `src/lib/api.ts` 的 `call<T>()` 调用；文件选择、剪贴板、外链、文件定位与封面地址转换也优先使用该适配层。窗口 API 和事件订阅按现有专门组件与生命周期处理。
- 新增或修改命令时同步检查 Rust 实现、`lib.rs` 注册、两端类型，以及需要支持的开发预览分支；保持字段名、可空字段和序列化约定一致。
- 保留 `library-changed`、`download-progress`、`scan-progress` 等事件的订阅清理。异步查询应处理卸载和响应乱序，不能让旧筛选请求覆盖新结果。
- 网站资料刷新必须保留用户设置的名称、标签、收藏、备注、自定义封面及配方。持久化结构变更应兼容已有数据，不能通过清空数据库解决兼容问题。
- 下载流程保留暂停、继续、重试、取消、校验与恢复逻辑；不能为了界面反馈提前标记成功。保持安全文件名、路径限制及安装时不覆盖已有文件的保护。
- API 密钥使用现有 keyring 实现，不写入源码、日志、预览数据、localStorage 或普通设置文件。外链沿用 URL 校验，远程 HTML 沿用清理流程，不扩大 CSP 或文件访问范围来规避报错。
- 安全审查开关只放在设置的「网站访问」标签页，随该页设置保存。保留 C 站图片 `nsfwLevel` 和原始地址，通过 `ContentSafetyContext` 控制展示；开启时分级大于 1 的封面使用 `src/assets/safety-cover.png` 静态占位，未知分级显示待更新。不可删除受限图片资料、把缺图当作受限内容，或将缓存后的图片分级丢失。旧资料通过 `refresh_library_cover_metadata` 补齐，`download-covers-changed` 只刷新下载封面，不触发下载完成提示。安全审查预览用 `?preview&safety-preview`，以普通风景图模拟受限状态。
- 正常用户数据位于 `%APPDATA%\studio.lora.desktop\`，实际模型位于绑定目录。不要将用户数据、模型或凭据作为测试素材。
- 调试构建可通过 `LORA_STUDIO_TEST_DATA` 指向独立测试数据目录；发布构建不读取该覆盖值。它只改变应用数据目录，不代表 Windows 凭据或模型目标目录自动隔离，联调仍需使用专门的测试路径。临时环境变量用后恢复。

## 界面与动效约定

沿用 `global.css` 中的深灰背景、浅绿色强调色、系统字体、卡片和双栏详情布局。设计说明参考 `docs/design/DESIGN.md`；如历史截图或说明与当前实现有差异，先核对当前代码和用户要求，不照旧图恢复已移除功能。

### 已接入的组件

| 组件或能力 | 使用位置与规则 |
| --- | --- |
| `PageTransition` | 主页面、模型详情的进退；传入 `detail: boolean`，由外层 AnimatePresence 管理退出 |
| `NavIndicator` | 主导航选中背景；共享 `layoutId="main-navigation"`，只在当前选中的主导航项内渲染 |
| `StateIcon` | 需要在状态变化时形变的图标，支持 `eye`、`eyeOff`、`pause`、`play`、`retry`、`check`、`close`；默认尺寸 18 |
| `Modal` | 导入、编辑、帮助等弹窗；默认通过 portal 挂载到 body，内置进入退出动效、Escape、Tab 焦点管理和关闭后焦点恢复 |
| React Bits `CountUp` | 模型总数与基础模型数量；常用 `to`、`duration`，当前数量展示使用 0.45 秒；已适配系统偏好及最终数值的无障碍标签 |
| `easeOut` | 共用缓动 `[0.22, 1, 0.36, 1]`，优先复用 |
| `useReducedMotion` | 从 `src/lib/useReducedMotion.ts` 引入，使用 useSyncExternalStore 订阅系统偏好，支持运行期间变化 |
| `global.css` 中的动效 | 卡片错峰入场、收藏反馈、设置与返回图标悬停、加载和下载状态反馈 |

以下示例的导入路径以 `src/app/` 内的文件为基准。

```tsx
import { AnimatePresence } from 'motion/react';
import { PageTransition, StateIcon } from '../components/Motion';
import { Modal } from '../components/ui';
import CountUp from '../components/react-bits/CountUp';

// key 对应页面或详情身份，不包含下载进度、搜索输入等频繁变化的值。
<AnimatePresence mode="wait" initial={false}>
  <PageTransition key={pageKey} detail={isDetail}>
    {pageContent}
  </PageTransition>
</AnimatePresence>

// AnimatePresence 留在控制显示状态的父组件里；关闭时仍有机会播放退出动画。
<AnimatePresence>
  {open && (
    <Modal key="editor" title="编辑资料" onClose={close}>
      {editorContent}
    </Modal>
  )}
</AnimatePresence>

// 保持按钮和 StateIcon 实例，只改变 name；不要为不同状态分配不同 key。
<button aria-label={paused ? '继续下载' : '暂停下载'} onClick={toggleDownload}>
  <StateIcon name={paused ? 'play' : 'pause'} size={19} />
</button>

<CountUp to={modelCount} duration={0.45} />
```

### 动效实现规则

- Motion 统一从 `motion/react` 导入，复用入口处的 MotionConfig；不额外安装另一份动画引擎处理已有能力。
- 页面过渡约 200ms、弹窗约 160–200ms，保持短距离移动和克制的弹性。不要让动画阻塞搜索、下载操作或连续导航。
- 页面退出期间沿用 `inert`，避免操作即将卸载的内容。不要用每帧 React state 更新实现动画。
- 多层弹窗各自保留控制其挂载的 AnimatePresence；确保 Escape 只关闭最上层。不要把固定定位的弹窗移入带 transform 的页面容器。
- 静态图标使用 `lucide-react`。Morphicons 接收来自 `lucide` 的图标数据或 SVG 路径，不能直接传入 `lucide-react` 组件。新增形变图标优先扩展 StateIcon 的集中映射，并保持 `reducedMotion="user"`。
- React Bits 当前按组件源码接入，已使用 CountUp，未安装整套组件包。新增组件先检查真实依赖和适用场景，保留来源、许可证及本地修改说明；不能把自写组件冒充 React Bits 原始组件。
- JavaScript 动效使用项目自有 `useReducedMotion`；CSS 动效配合 `prefers-reduced-motion`。启用减少动态效果时显示最终状态，不能留下透明页面或未完成数字。
- 卡片入场只对有限首批内容做短暂错峰；进度更新、筛选和数据刷新不能反复重挂整个页面或让所有卡片重新播放。避免给大列表统一加昂贵的布局动画或大面积模糊。
- Motion 控制的 transform 不与 CSS 中负责定位的 transform 相互覆盖；提示条水平居中当前使用独立 `translate`。CountUp 内有嵌套 span，徽标背景与 padding 应只施加到外层。
- 图标按钮提供明确的 `aria-label`；动效不能成为表达加载、失败、完成或选中状态的唯一方式。

### 界面验收

涉及动效或结构的变更，检查快速连续导航、详情进入与返回、弹窗开关、多层 Escape、Tab 与焦点恢复、列表筛选、空结果和加载错误状态。检查正常与减少动态效果两种模式，并在应用打开期间切换偏好。

按桌面产品至少检查窄窗口约 1000px 和常用 1440–1600px 宽度，注意横向溢出、长标题和滚动区域。检查浏览器控制台；开发热更新更换 Hook 后应完整刷新复查，区分热更新遗留状态和实际运行错误。

必要时将实际截图和验收记录放在 `docs/verification/`，写明环境、使用真实数据还是预览数据、执行过的命令及未验证的部分。历史测试数量或产物大小不能作为固定通过标准。

## 工作区与交付

- 开始先看 `git status` 和相关差异，保留用户及其他任务的未提交修改。不执行会丢失这些修改的 reset、checkout 或清理操作。
- 只格式化本次涉及的文件；不要顺带格式化整个仓库或修改无关功能。
- 不提交 `node_modules/`、`dist/`、`src-tauri/target/`、生成 schemas、`.test-data/`、数据库、模型、日志及本地安装目录。新增依赖时同步更新对应锁定文件。
- 用户要求提交时，核对暂存范围，仅提交本次相关内容，使用清楚描述结果的提交说明。推送或发布按用户明确要求执行。
- 目录、脚本、组件接口或动效规则变化时同步维护本文件。补充背景可查阅 `docs/PROJECT_STRUCTURE.md`、`docs/OAUTH_SETUP.md`、`docs/design/DESIGN.md` 和 `docs/verification/`。


## 项目许可

项目自有代码采用根目录 LICENSE 中的 MIT 许可证。修改 README、关于弹窗或包元数据时保持许可证信息一致。第三方组件保留原有授权及版权声明，尤其不得把 React Bits 的 MIT + Commons Clause 表述为纯 MIT；相关记录见 THIRD_PARTY_NOTICES.md。


## 开发资源监测

资源监测面板通过 portal 挂到 body，使用应用内最高浮层 `z-index: 400`，保持在页面、弹窗和提示条之上；不要放回侧栏的层叠上下文。

`src/features/debug/` 为开发构建按需加载的资源面板，入口位于左上角品牌下方。`services/resources.rs` 使用 Windows 进程 API 采样主进程及子进程，仅在 Windows debug_assertions 构建中编译采样实现。发布版必须拒绝调用采样命令。保持 2 秒非重叠采样、关闭及页面隐藏时清理定时器，不向浏览器预览填入虚假资源数据。CPU 按进程 ID 与创建时间匹配两次采样，内存单位为 MiB，统计口径说明保留在 README 和验收文档中，不在监测面板底部显示。
