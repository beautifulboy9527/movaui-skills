# ASCII 与点阵粒子舞台高性能渲染与无障碍规范

> **用途**：补齐 `ascii-animation-skill`（S3B.25）在复杂大视口、高刷新屏与低端移动设备上的渲染性能边界、内存释放与无障碍兜底契约，保持 100% 行业与框架普适。

## 1. 渲染管线分层与帧率预算（防止大视口拖垮主线程与 INP）

ASCII 矩阵与点彩粒子舞台看似轻量，但在 4K / Retina 高分屏上逐帧循环 `fillText()` 或操作上千 DOM 节点极易吃满主线程、拖垮页面 INP（> 200ms）：

| 规模与形态 | 推荐渲染策略 | 硬性禁止事项 |
|---|---|---|
| DOM 文本网格（`<pre>` / 字符块） | 仅适用于小面积静态或低频刷新（≤ 15fps），严格遵守网格预算（远低于 12,000 格红线） | 禁止为每个字符创建独立 `<span>` 做逐帧 `style` 变更 |
| 中大视口 Canvas 2D 字符/点彩舞台 | **离屏字形图集缓存（Glyph Atlas）**：初始化时把有限字符集预渲染到一张离屏 Canvas，每帧用 `drawImage` 整块裁剪贴图，避免每帧重复字形栅格化 | 禁止在 `requestAnimationFrame` 内高频调用 `measureText()` 或重新分配临时数组/字符串（零每帧 GC 抖动） |
| 视口宽大 / 视频实时采样矩阵 | 优先将像素采样与亮度-字符映射卸载至 **Web Worker + `OffscreenCanvas`**（不支持时平滑回退主线程降帧率采样） | 禁止每帧读取全分辨率 1080p `getImageData`——先降采样至与网格同尺寸的微小离屏 Canvas（如 `120×68`）再取像素 |
| 高分屏 DPR 控制 | 画布渲染 DPR 上限锁死在 **`Math.min(window.devicePixelRatio || 1, 1.5)`**（仅代表性真机实测通过后才考虑放宽） | 禁止无上限乘以 `devicePixelRatio`（3× 手机屏会让像素量暴涨 9 倍） |

## 2. 生命周期、可见性暂停与上下文释放（对接 S3B.20 重视效降级门禁）

1. **离屏即停（Viewport & Tab Visibility）**：
   - 使用 `IntersectionObserver` 监听画布可见性：滚出视口立即取消 `requestAnimationFrame` 并暂停底层 `<video>` 解码；
   - 监听 `document.visibilitychange`：标签页切到后台立即停帧，切回再恢复。
2. **彻底清理释放**：组件卸载（React `useEffect` cleanup）必须依次取消 `rAF`、断开 `IntersectionObserver` / `ResizeObserver`、中止 Worker（若有）、释放离屏 Canvas 尺寸（设为 `0×0`）并显式回收 WebGL `loseContext()`（如使用 WebGL 渲染路径）。
3. **设备分层降级**：在低并发核数（`navigator.hardwareConcurrency <= 4`）、省流量模式（`navigator.connection.saveData`）或窄屏移动端自动降低网格密度/刷新率，或直接切换为静态关键帧。

## 3. 无障碍与语义纯净底线

1. **纯装饰画布隐藏读屏**：字符矩阵/粒子画布本身为纯视觉呈现，必须标注 `aria-hidden="true"` 与 `role="presentation"`，**严禁让屏幕阅读器逐字朗读几百行随机 ASCII 符号**！
2. **信息等价替代**：若画布承载了实质语义（如品牌标志轮廓、产品形态展示），必须在同区块提供真实的语义标题、描述文本或 `sr-only` 简洁说明。
3. **`prefers-reduced-motion: reduce` 确定性冻结**：检测到减少动效偏好时，**不得直接留空白黑盒**，应稳定渲染一帧设计好的代表性静态字符/点彩关键帧（静止画面），保证视觉完整性与前庭安全兼得。
4. **生产页面零调试浮层**：帧率 HUD、颗粒度滑块、预设切换按钮、快捷键提示只允许存在于独立本地调试页，**绝不允许泄漏到交付页面的 DOM 中**（由 `validate-ascii-spec.mjs --source` 静态门禁强制拦截）。
