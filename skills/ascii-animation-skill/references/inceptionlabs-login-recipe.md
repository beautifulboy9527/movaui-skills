# Inception Labs 登录页 (`hero-h-opt.mp4`) 实时视频代码矩阵逆向配方

本文档完整记录对参考登录页 `https://platform.inceptionlabs.ai/auth/login?callbackUrl=%2F` 及其源视频 `https://platform.inceptionlabs.ai/optimized_assets/hero-h-opt.mp4`（前端 Chunk `28bi7f1vhlg3i.js` 模块 `222708`）的逆向工程结果与 1:1 复刻参数。

---

## 1. 界面结构与视觉分解

Inception Labs 登录页采用经典的 **左右双栏 (Split-Screen Auth) 架构**：

- **顶栏公告条 (`<aside>`)**：高度 `min-h-10`，边框 `border-[#1a2e2e]`，背景 `bg-[#041414]`，青色高亮色 `#17C4C4`。
- **左栏（认证表单区）**：`flex-1 flex flex-col min-h-[calc(100vh-2.5rem)] bg-[#041414]`，左上角放置品牌 Logo，中间居中 `max-w-md` 登录表单。
- **右栏（ASCII 视频动效舞台）**：
  ```html
  <div class="hidden lg:block relative w-0 flex-1 bg-black overflow-hidden">
    <div style="position:absolute;top:0;left:0;width:100%;height:100%">
      <canvas style="position:absolute;top:0;left:0;width:100%;height:100%;background:transparent"></canvas>
    </div>
  </div>
  ```

---

## 2. 渲染管线五步法则（模块 `222708` 精确还原）

为什么 Inception Labs 的视频转 ASCII 看起来不像普通粗糙的 `@#%*+=-:. ` 字符画，而是极具 AI 大模型极客感的**「流动代码底纹 + 视频体块点亮」**？原因在于它的五步复合管线：

### 步骤 1：字形网格标定 (`F` 函数)
- 字体固定为 `10px "Courier New", monospace`，`textBaseline = "top"`。
- 测量单字符基准宽度：`baseCharWidth = ctx.measureText("M").width`，实际列步进取 `stepX = 1.3 * baseCharWidth`，行步进固定为 `stepY = 10` px。
- 网格行列数：
  $$\text{cols} = \lfloor \text{canvasCssWidth} / (1.3 \times \text{baseCharWidth}) \rfloor, \quad \text{rows} = \lfloor \text{canvasCssHeight} / 10 \rfloor$$
- 视频保持原始宽高比缩放至容器的 **95%**（`0.95 * width` / `0.95 * height` 居中，留出 2.5% 呼吸边距），对应的离屏采样画布尺寸为：
  $$\text{charsWidth} = \lceil \text{pixelWidth} / \text{baseCharWidth} \rceil, \quad \text{charsHeight} = \lceil \text{pixelHeight} / 10 \rceil$$

### 步骤 2：伪代码语法底纹生成器 (`D` 函数)
每一行并非填充随机乱码，而是按概率生成**真实感代码行**：
- `12%` 概率行首缩进 `2–5` 个空格；
- 循环填充直至行满：
  - `30%` 概率：编程语言/系统/SQL 关键词（`function`, `const`, `async`, `await`, `Promise`, `Observable`, `Stream`, `Buffer`, `kernel`, `socket`, `malloc`, `SELECT`, `FROM`, `WHERE` 等）；
  - `15%` 概率：`2–11` 位字母数字标识符；
  - `10%` 概率：十六进制字面量 `0x` + `2–7` 位 Hex 字符 (`0-9A-Fa-f`)；
  - `10%` 概率：复合运算符（`=>`, `->`, `::`, `&&`, `||`, `==`, `!=`, `<=`, `>=`, `++`, `--`, `|>`, `<|`）；
  - `10%` 概率：成对括号包裹表达式 `(...)` / `[...]` / `{...}`；
  - `10%` 概率：`snake_case` 变量名加随机数字后缀（如 `buffer_stream412`）；
  - `15%` 概率：符号簇与分隔符（` | `, ` - `, `; `, `, `）。
- 每个字符节点记录：`{ original, current, isSpace, phaseOffset: (col / lineLen) * Math.PI + 0.5 * Math.random() }`。

### 步骤 3：正弦相位微光突变 (`L` 函数，每 40ms 触发一次)
每隔 `40ms`（约 25Hz），遍历所有非空格字符，按正弦波相位概率随机替换为新字符：
$$P(\text{mutate}) = \frac{\sin(0.002 \times t_{\text{ms}} + \phi_{\text{line}} + \phi_{\text{char}}) + 1}{2} \times 0.20$$
这使整张代码矩阵呈现出类似「扩散模型 Token 解码（Mercury Diffusion LLM）」的呼吸律动感。

### 步骤 4：离屏 `<video>` 帧降采样
- 创建内存态 `<video src="/videos/hero-h-opt.mp4" loop muted playsInline preload="auto">` 与离屏 `<canvas width={charsWidth} height={charsHeight}>`。
- 每帧渲染时，若视频正在播放，执行一次 `offscreenCtx.drawImage(video, 0, 0, charsWidth, charsHeight)` 并读取 `getImageData(0, 0, charsWidth, charsHeight)`。

### 步骤 5：前景视频点亮与背景暗纹合成 (`B` 函数)
对网格中每个字符 `(col, row)`：
1. 计算其在视频采样区的映射坐标，读取 RGBA 像素 `(R, G, B, A)` 与感知亮度：
   $$Y = \frac{0.299 R + 0.587 G + 0.114 B}{255}$$
2. **命中前景判定**：当 $Y > 0.05$ 且 $A > 20$ 时视为命中视频前景：
   - **`colorMode === "dark"`（单色高亮模式）**：
     $$\alpha = \frac{A}{255} \times (0.15 + 0.85 Y)$$
     以 `rgba(255, 255, 255, alpha)` 绘制当前代码字符 `f`。
   - **`colorMode === "color"`（HSL 增艳彩色模式）**：
     将 `(R, G, B)` 转入 HSL，**饱和度放大 1.5 倍** ($S' = \min(1, 1.5S)$)，**亮度做 Gamma 提亮** ($L' = 1.25 \times L^{1/0.55}$)，转回 RGB 后再做 **1.5 倍对比度拉伸**：
     $$C_{\text{out}} = \text{clamp}_{0..255}(\text{round}(128 + (C - 128) \times 1.5))$$
     并通过 15-bit 颜色键 `(R>>3)<<10 | (G>>3)<<5 | (B>>3)` 缓存在 `Map`（上限 1000 条，满时淘汰前 500 条）中，避免帧循环字符串拼接 GC 抖动。
3. **未命中前景（背景区）**：
   若开启 `showPattern = true`，则以暗淡透明白 `rgba(255, 255, 255, 0.15)` 画出底层代码字符，使视频主体仿佛从一层半透明终端代码海洋中浮现出来。

---

## 3. 在 Next.js 页面中一键复刻用法

直接复制或引入本 skill 提供的 `components/AsciiMediaCanvas.tsx`：

```tsx
import { AsciiMediaCanvas } from "@/components/ascii-media-canvas";

export function LoginHeroSplit() {
  return (
    <div className="min-h-screen w-full flex bg-[#041414] text-white">
      {/* 左栏：登录表单 */}
      <div className="flex-1 flex flex-col justify-center items-center px-8 py-12 lg:px-20">
        <div className="w-full max-w-md space-y-6">
          <h1 className="text-3xl font-bold tracking-tight">Sign in to Platform</h1>
          {/* 表单控件 */}
        </div>
      </div>

      {/* 右栏：Inception Labs 同款 ASCII 视频代码矩阵 */}
      <div className="hidden lg:block relative w-0 flex-1 bg-black overflow-hidden">
        <AsciiMediaCanvas
          mediaSource="/videos/hero-h-opt.mp4"
          colorMode="color"
          showPattern={true}
          patternMode="code-matrix"
        />
      </div>
    </div>
  );
}
```
