# React Bits components

CountUp 来自 [React Bits](https://github.com/DavidHDev/react-bits)，以源码方式按需接入，使用现有 Motion 依赖。

- 原文件：`src/ts-default/TextAnimations/CountUp/CountUp.tsx`
- 获取日期：2026-09-09
- 本地修改：响应系统减少动态效果设置；提供最终数值的无障碍标签；数值更新时从当前值继续动画。
- 当前未使用；模型库的全部模型与基础模型数量直接显示当前值，保留组件源码及许可。
- 原始许可保存在同目录 `LICENSE.md`。

## ProfileCard

- 来源：[React Bits ProfileCard](https://github.com/DavidHDev/react-bits/tree/main/src/ts-default/Components/ProfileCard)。
- 原文件：`ProfileCard.tsx` 和 `ProfileCard.css`；获取日期：2026-09-10。
- 按上游指针坐标映射、指数平滑倾斜、叠层反光与背光实现裁剪适配，并非未修改的原始组件。
- 本地修改：仅保留图片展示；保持关于窗口的正方形尺寸和图片透明轮廓；反光改为项目浅绿色；移除个人资料、联系按钮、设备方向传感器及持续播放的入场和背景动画；位置稳定后停止动画帧，离开时回正，卸载时清理监听和动画帧。
- 使用项目 `useReducedMotion` 响应运行期间的系统偏好变化；触摸操作保持原生滚动。
- 使用位置：关于窗口的项目角色图片。无新增依赖，沿用同目录 `LICENSE.md` 的 MIT + Commons Clause 条款。
