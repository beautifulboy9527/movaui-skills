# ASCII 动画开源生态深度拆解与架构选型（基于 `gh` CLI 源码全量审计）

本文档记录通过 GitHub CLI (`gh api`) 对 6 个核心 ASCII 动画开源项目的源码级深度拆解（涵盖全部核心子模块：`ascii.rest/kit` 九大模块、`ascii-magic-art` 图像活化与字形覆盖率引擎、`rune` 泛洪抠像与帧间迟滞、`ASCIIGround` WebGL2 着色器与雨滴系统、`asciivideo` 确定性转场与磷光渲染、`awesome-ascii-animation` 复古终端色板体系），作为 `ascii-animation-skill` 的完整技术底座。

---

## 1. 六大参考项目横向对比矩阵

| 项目 | 仓库 | 核心定位 | 渲染载体 | 关键技术亮点 | 许可证 | 适用场景 |
|---|---|---|---|---|---|---|
| **ascii.rest** | `bas3line/ascii` | 240+ 零依赖 TS/React/Web Component/Astro 动画库 + `ascii.rest/kit` 创作框架 | `<pre>` / `<canvas>` (Glyph Atlas) / **纯 CSS 动画 `<svg>`** | `Piece` 契约；`Surface` (`Uint16Array` + `Uint8Array`)；**Braille 2×4 点阵 (8倍超分)** 与 **半块像素 (`▀▄█`)**；**3D Z-buffer 参数化几何 (`shapes3d`)**；**闭式解析解粒子系统 (`particles`)**；**9 种后处理 FX 链 (`glint`/`glitch`/`dissolve`/`scan`/`wave`/`outline`)**；**零 JS 动画 SVG 导出 (`src/svg.ts`)** | MIT（部分公司 Logo 归属原商标） | 极简终端风官网、3D 字符几何、Braille 示波器/曲线、README 动画 SVG Banner |
| **ASCII Magic** | `kailashsr38/ascii-magic-art` | 634+ 预置场景/图表/3D/UI 动画 + 终端交互式 Prompt 导出器 | `<ascii-art>` Web Component / Canvas / CLI | 实测 Menlo 字形墨水覆盖率 (`COVER` 0–100) + **10 种 Look 实时重映射**（`dots`, `ascii`, `dense`, `numbers`, `binary`, `blocks`, `dither` 4×4 Bayer 矩阵）+ **静态图像活化引擎**（水波倒影折射、斜向微光、星光闪烁、二阶贝塞尔摇曳棕榈与飞鸟群） | MIT（2 张照片衍生场景遵循 Unsplash） | 多画风实时切换（半调网点/Bayer 抖动/二进制）、静态插画转动态 ASCII 场景 |
| **Rune** | `zeke-john/rune` | React 视频转 ASCII 组件库 (`rune-ascii`) + 离线转换 CLI (`@rune-ascii/cli`) | DOM (`<span>` 行级增量复用) / `<canvas>` 自动切换 | **四边连通泛洪 (Border-Connected Flood Fill)** 区分背景与封闭高光（如人物眼白）+ **帧间掩码迟滞 (Temporal Mask Hysteresis + 1px 膨胀)** 防边缘闪烁；`cellCount >= 12000` 或 `columns >= 140` 时自动从 DOM 切到 Canvas | MIT | 将 3D 渲染短片、吉祥物动画、产品旋转视频离线烘培为 `.rune.json` 嵌入 React |
| **ASCIIGround** | `Eoic/ASCIIGround` | 程序化动态 ASCII 背景 TS 库 | Canvas 2D / **WebGL2 (GLSL 字形图集管线)** 自动降级 | 内置 `PerlinNoisePattern`、`RainPattern`（独立雨滴流速度、白色高亮头 `headColor`、字符突变率 `mutationRate` 与尾迹衰减 `fadeOpacity`）、`StaticNoisePattern`；WebGL2 `gl_FragCoord` 亚像素裁剪 (`u_clip`) 与鼠标交互排斥/吸引场 | MIT | 全屏/分栏生成式背景（Perlin 云雾、Matrix 数字雨、故障噪点、鼠标互动场） |
| **asciivideo** | `GordenSun/asciivideo` | Python 确定性终端风格字符动画引擎 (`charvid`)，双端输出 MP4 与自包含 HTML | Python Pillow + FFmpeg (`out.mp4`) / Canvas 2D（上游仓 `web/charvid` 运行时） | Studio Dumbar (OpenAI DevDay) "code-feel" 视觉法则：纯黑底 + **磷光多层模糊发光 (`glow_radius`/`glow_gain`)** + 78 内置精灵（支持周期眨眼 `blink` 与浮动 `bob`）+ **6 种确定性转场 (`scatter` 散落聚合、`scramble` 矩阵解码、`type`、`wipe`、`slide`、`dissolve`)** + CJK 双格宽自动对齐 | MIT | 发布会片头、终端风宣传片 MP4、独立全屏交互式字符叙事页 |
| **awesome-ascii-animation** | `mu-ct/awesome-ascii-animation` | ASCII 动画工具、生成器、转换器与 Demoscene 索引 | 生态导航 | 汇总 `ascii.life` **12 种复古硬件显示器主题**（Matrix, CRT, C64, DOS, Apple II, Amber, Phosphor, Plasma, VFD, LCD）、CLI（`libcaca`, `jp2a`, `figlet`, `aalib`）与 `16colo.rs` 档案 | CC0 | 复古硬件滤镜色板与磷光 CRT 视觉标定 |

---

## 2. 九大核心技术精华（全量源码提炼）

### 2.1 `ascii.rest/kit` 高性能网格与超分画布（源自 `bas3line/ascii/src/kit/`）

1. **双类型化数组网格 (`Surface`)**：
   - `chars: Uint16Array(cols * rows)` 存放单字符 BMP 码点（`EMPTY = 0` 代表透明格，图层叠加时不遮挡下层）；
   - `colors: Uint8Array(cols * rows)` 存放调色板索引（`NONE = 255` 代表使用默认前景色 ink）。
2. **Braille 盲文 2×4 点阵 8 倍超分画布 (`draw.ts` → `braille()`)**：
   - 利用 Unicode 盲文区 `U+2800..U+28FF`，每个字符格包含 **2 列 × 4 行 = 8 个独立方点**（位掩码 `0x01` 至 `0x80`）。
   - 在 `1:2` 宽高比的等宽字体格中，每个盲文点恰好是正方形，可在纯文本中画出超平滑正弦曲线、示波器波形 (`plot(f)`)、精细圆环与矢量折线。
3. **半块像素 1×2 画布 (`draw.ts` → `pixels()`)**：
   - 利用上半块 `▀` (`U+2580`)、下半块 `▄` (`U+2584`) 与全块 `█` (`U+2588`)，使单字符格承载上下 2 个正方形像素，适合绘制微型复古像素精灵 (`sprite()`)。

### 2.2 3D 参数化曲面与 Z-Buffer 光照渲染（源自 `bas3line/ascii/src/kit/shapes3d.ts`）

无需引入 Three.js，纯 CPU 即可在 `< 2ms` 内渲染 3D 旋转几何体（`torus` 圆环、`sphere` 球体、`cube` 立方体、`cylinder` 圆柱、`cone` 圆锥、`orbit` 行星轨道）：
- **参数化采样与法线变换**：对圆环面 $(u, v) \in [0, 2\pi)^2$ 计算顶点与外法线 $\mathbf{n}$，经欧拉角旋转 `rotate3(v, angles)` 后做透视投影：
  $$x_{\text{cell}} = \frac{c_{\text{cols}}}{2} + \frac{x \cdot \text{scale}}{d - z}, \quad y_{\text{cell}} = \frac{c_{\text{rows}}}{2} - \frac{y \cdot \text{scale}}{\text{aspect} \cdot (d - z)}$$
- **逐格 Z-Buffer 与 Lambert 漫反射着色**：每个单元格维护 `zBuf[i]`，仅当 $z > \text{zBuf}[i]$ 时覆写，并由光照点积 $I = \max(0, \mathbf{n} \cdot \mathbf{l}) \cdot (1 - \text{ambient}) + \text{ambient}$ 映射到字符阶梯 `.,-~:;=!*#$@`。

### 2.3 无状态闭式解析解粒子系统（源自 `bas3line/ascii/src/kit/particles.ts`）

传统粒子系统依赖帧间状态累加（`x += vx * dt`），一旦跳帧或任意时刻 `seek(t)` 就会失真。`ascii.rest/kit` 的解法是**完全关于时间 $t$ 的闭式解析函数**：
- 第 $i$ 颗粒子的出生时刻固定为 $t_0 = i / \text{rate} + \text{jitter}(\text{seed}, i)$；
- 在当前时刻 $t$，粒子年龄 $a = t - t_0$，在恒定重力 $g$、风力 $w$ 与线性空气阻力 $k$ 下的精确位置直接由积分闭式解算出：
  $$x(a) = x_0 + \frac{(v_{x0} - w/k)(1 - e^{-ka})}{k} + \frac{w \cdot a}{k}, \quad y(a) = y_0 + \frac{(v_{y0} - g/k)(1 - e^{-ka})}{k} + \frac{g \cdot a}{k}$$
- 内置 8 套开箱即用预设：`snow`、`rain`、`stars`、`sparks`、`fireworks`、`fireflies`、`bubbles`、`matrix`。

### 2.4 九种可串联字符后处理特效链（源自 `bas3line/ascii/src/kit/fx.ts`）

任意静态或动态字符画均可经 `chain(piece, fx1, fx2)` 叠加后处理：
1. **`glint`（斜向流光）**：每隔 `every` 秒一道斜率为 `slant`、宽 `width` 格的高亮光带扫过非空字符，将字符颜色向纯白混合 `0.6`；
2. **`typeIn`（打字机光标）**：按阅读序/列序/随机序以每秒 40 字逐格打出，尾部跟随闪烁方块光标 `▌`；
3. **`dissolve`（噪声消融）**：基于 2D `valueNoise(x * 0.15, y * 0.15)` 阈值做入场/退场消融，消融边缘自动替换为 `.:` 碎屑字符；
4. **`scan`（CRT 扫描线）**：周期性横向或纵向扫过 `━` / `┃` 亮线；
5. **`glitch`（赛博故障）**：每隔 2.5s 触发持续 0.35s 的行错位平移 + 局部字符随机突变为 `#%&@$/\|<>`；
6. **`wave`（正弦波浪扭曲）**：行或列按正弦波横向摆动；
7. **`outline` & `shadow`（16 邻接制表符描边与投影）**：自动检测非空字符外轮廓并用 `╭─╮│╰─╯` 盒式制表符包边，或在 `(dx, dy)` 偏移处投下 `░` 阴影。

### 2.5 零 JS 纯 CSS 动画 SVG 导出器（源自 `bas3line/ascii/src/svg.ts`）

对于不允许执行 JavaScript 的环境（如 GitHub README、邮件、`<img>` 标签）：
- 以 `15 fps` 采样一个完整周期 `loop` 秒的所有帧；
- 对完全相同的帧做去重合并，每帧生成一组 `<g class="fN"><text>...</text></g>`，同行连续相同颜色的字符合并为 `<tspan fill="#...">`；
- 利用 CSS `@keyframes` 控制 `visibility: hidden/visible` 轮播各帧，并内置 `@media (prefers-reduced-motion: reduce)` 自动停在首帧。

### 2.6 字形墨水覆盖率、10 种 Look 与静态图活化（源自 `kailashsr38/ascii-magic-art`）

1. **Menlo 实测墨水覆盖率 (`COVER`) 与 10 种 `look` 换肤**：
   - `original`、`dots` (`" ·•●"`)、`ascii` (`" .,-~:;=!*#$@"`)、`dense`（70 级细密字符）、`numbers` (`" 1723456980"`)、`binary` (`" 01"`)、`letters`、`blocks` (`" ░▒▓█"`)、`squares` (`" ·▪◼█"`)、`lines` (`" ╶─═━"`)、`dither`（4×4 Bayer 矩阵）。
2. **静态图像动态化 (`lib/image.js`)**：
   - 将单张静态图切分为天空层（水平缓慢漂移 `drift` + 星光随机闪烁 `twinkle`）与水面层（`y >= water` 行施加正弦横向折射位移 $\Delta x = \text{round}(\sin(y \cdot 0.9 + t \cdot 2.2) \cdot 1.2)$ 与波光亮度调制），叠加呼吸起伏 `breathe` 与斜向微光 `glint`。

### 2.7 视频转 ASCII 的四边泛洪抠像与帧间迟滞（源自 `zeke-john/rune`）

1. **四边连通 BFS 泛洪 (`computeBorderConnectedMask`)**：仅从画面上下左右四条边界出发标记背景，保护人物眼白、高光等内部封闭浅色区不被误抠成透明空格。
2. **帧间迟滞 + 1px 膨胀 (`buildBackgroundMask`)**：结合上一帧背景掩码放宽当前帧阈值（`maskHysteresis = 6`）并做 1 像素膨胀，消除运动边缘闪烁。
3. **12,000 格渲染切换阈值 (`renderer.ts`)**：`columns * rows >= 12000` 或 `columns >= 140` 时自动从 DOM 切换至高分屏 `<canvas>`。

### 2.8 WebGL2 字形图集与数字雨/Perlin 噪声（源自 `Eoic/ASCIIGround`）

1. **雨滴流状态机 (`RainPattern`)**：每列维护独立下落速度 `speed`、长度 `length`、头部亮白 `headColor: '#FFFFFF'`、每帧字符突变率 `mutationRate: 0.04` 及尾迹残影 `fadeOpacity: 0.2`。
2. **鼠标交互场 (`enableMouseInteraction`)**：计算单元格到光标 `(mouseX, mouseY)` 的欧氏距离，在半径内对字符密度、亮度或位移施加径向波纹激励。

### 2.9 Studio Dumbar 磷光 CRT 美学与六大确定性转场（源自 `GordenSun/asciivideo` & `ascii.life`）

1. **六大确定性转场 (`charvid/elements.py`)**：
   - `scatter`：每个非空字符从极坐标随机偏移 $(\theta, r \in [0.25, 1.0] \times 0.3 \max(W, H))$ 沿缓动曲线飞入目标格聚合成形（退场可反向飞散）；
   - `scramble`：每个字符格在 `[0, 0.7]` 随机时刻前高速跳变乱码符号 `!@#$%^&*()_+-={}[]|;:<>?/01XY01<>~`，随后逐格锁定为真实字符；
   - `type`（阅读序逐字打印）、`wipe`（行级幕布擦除）、`slide`（四向滑入）、`dissolve`（随机像素消融）。
2. **双层磷光发光合成 (`CharCanvas`)**：先在离屏 Canvas 绘制模糊发光层（`filter: blur(glowRadius)`，`globalCompositeOperation: "lighter"`），再叠印锐利前景字符，并原生支持 CJK 中文双格宽 (`charCells = 2`) 对齐。
3. **12 种复古终端硬件主题色板（源自 `awesome-ascii-animation` / `ascii.life`）**：
   - `inception-teal`: 背景 `#041414`，主色 `#17C4C4`，高亮 `#F97316`
   - `matrix`: 背景 `#000500`，主色 `#00FF66`，高亮 `#E6FFEE`
   - `crt-green`: 背景 `#050A05`，主色 `#33FF33`，高亮 `#CCFFCC`
   - `amber`: 背景 `#0D0800`，主色 `#FFB000`，高亮 `#FFE082`
   - `vfd-cyan`: 背景 `#020B10`，主色 `#00F5D4`，高亮 `#E0FBF8`
   - `plasma`: 背景 `#090214`，主色 `#F72585`，高亮 `#4CC9F0`

### 2.10 `https://ascii.rest/` 线上官网核心精华：`cell: 1` 正方形粒子态与覆盖率色彩补偿

通过对 `https://ascii.rest/` 线上生产包（上游仓编译产物 `library`、`jungle-falls`、`night-highway` 与 `/make/`）的深度逆向，提炼出解决**「传统字母数字字符画比例拉伸失真、分辨率粗糙、暗部色彩发灰」**的四大核心公式：

1. **`meta.cell = 1` 正方形点阵画布契约（彻底杜绝宽高比拉伸）**：
   - 传统等宽字体格宽高比为 `1:2`（`cell = 2`），直接映射视频或图像极易因字体度量差异导致画面被纵向或横向拉伸；
   - `ascii.rest` 的风景/视频场景统一声明 `cell: 1`（正方形单元格，`aspectRatio = "${cols} / ${rows * cell}"`），每个单元格在 Canvas 上严格为 `cellPx × cellPx` 正方形，子网格 `(vidCols, vidRows)` 严格锁定源媒体原生宽高比 `videoWidth / videoHeight`（如 `1280:720` 或 `720:1072`），实现 **100% 零拉伸 1:1 几何还原**。
2. **纯粒子态圆点梯度 (`" ·•●"`) + 居中 4×4 Bayer 有序抖动**：
   - 摒弃喧宾夺主的字母数字 (`a-z, 0-9`)，改用四级圆点粒子 `" ·•●"`（或在 Canvas 上直接绘制 4 档亚像素直径的圆/方粒子 `1.1px / 1.75px / 2.4px / 3.0px`）；
   - 引入居中归零的 4×4 Bayer 抖动矩阵：
     $$d_{4\times 4} = \left[\frac{b_{y\bmod 4, x\bmod 4}}{16} - 0.47\right], \quad \text{tier} = \text{clamp}_{0..3}\left(\text{round}(Q \cdot 3 + d_{4\times 4})\right)$$
     使烟雾、星云、夜空渐变更替丝滑，无色带断层。
3. **覆盖率反向色彩增益公式 (`Coverage-Compensated Color Gain`)**：
   - 为什么小粒子 `·` 在暗部看起来发灰看不清？因为小粒子仅覆盖单元格约 `25%–30%` 的面积（`u = [0, 0.3, 0.6, 1]`），其余 `70%` 被纯黑背景吞噬；
   - `ascii.rest` 根据当前粒子档位的墨水覆盖率 $u[\text{tier}]$ 对 RGB 颜色施加反向增益补偿：
     $$e = \min\left(1, \frac{Q + 0.06}{u[\text{tier}]}\right), \quad \text{gain} = \min\left(2.2, \frac{0.3 + 0.7 e}{\max(R, G, B, 10^{-4})}\right)$$
     $$\begin{pmatrix} R' \\ G' \\ B' \end{pmatrix} = \text{clamp}_{0..1}\left(\text{gain} \cdot \begin{pmatrix} R \\ G \\ B \end{pmatrix}\right)$$
     这使得暗部微小粒子依然色彩饱满、高光与尾灯鲜艳夺目。
4. **5 抽头非锐化掩模 (`Unsharp Mask`) + 边界余弦羽化 (`smoothstep` Vignette)**：
   - 采样视频帧后先做轻量级 5 抽头拉普拉斯锐化 $C_{\text{sharp}} = C + 0.62(C - \bar{C}_{4\text{-neighbor}})$，大幅提升粒子态下的轮廓锐度；
   - 对视频画幅四周 `5.5%` 边缘施加 `smoothstep(0, 0.055, u) * smoothstep(0, 0.055, 1 - u)` 羽化衰减，使视频边缘自然消融进深空粒子背景，消除生硬的矩形画框割裂感。

### 2.11 `stackedlol/ascii-sharks` 零干扰生产级美学与计数排序批渲染

1. **克制专注的「零实验室杂物 (Zero-Chrome)」生产准则**：
   - 真实网站中的 ASCII/粒子动画绝不出现 FPS 计数器、GRID 调试参数条、模式切换 Tab 或悬浮测试按钮；舞台区域 `100%` 留给纯粹的动画本身。
2. **按样式分桶计数排序 (`Counting-Sort Style Bucketing`)**：
   - 将数万个背景粒子按 `(colorClass, alphaLevel)` 归入固定数量的桶（如 24 个桶），每帧通过一次 `Int32Array` 计数排序后，每个桶仅设置 **1 次** `ctx.fillStyle` 并连续调用 `ctx.fillRect`，在 4K/高分屏上稳定保持 `120–160+ FPS`。
