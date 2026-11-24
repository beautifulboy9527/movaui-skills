/**
 * @file arg-guard.mjs
 * @description 参数守卫的共享实现 —— 未知参数一律 exit 2，不静默吞掉
 *
 * 【为什么需要它】
 *
 * 已给 97 支脚本补过守卫，结论写成了「读参数的脚本全部带守卫，吞参 0 支」。
 * 那句话是**在当时的判据口径下**成立的：S7.18 认的是三种助手函数调用
 * （`getArg('x')` / `flag('--x')` / `value('--x')`）。
 *
 * 把 S7.18 的取证口径扩到直读 argv 的形态（`args.includes('--json')`、
 * `process.argv.indexOf('--out')`）后，当场多出 31 支 `.mjs` —— 它们从来没被算进
 * 那个「97 支」里。再把扫描面从 `.mjs` 扩到 `.js`/`.ts`，又多出 8 支。
 *
 * > **一个数字说「全部覆盖」时，先问它的分母是怎么筛出来的。**
 * > 记的是「门禁覆盖的数字不说明覆盖率，只说明被它承认的那一类里有多少」——
 * > 那次的轴是「有没有白名单」，这次同一句话落在**取参写法**和**文件扩展名**两个轴上。
 *
 * 实测后果（两级，与 同一分级）：
 *
 * 一级 —— 印「全部合规」：
 *   `audit-unused-assets.mjs <ledger> . --jsonn` → 吞掉，退回人类可读输出、exit 码不变。
 *   CI 里 `| jq` 会拿到一段散文，而没有任何迹象说明请求的格式没生效。
 *
 * 二级 —— 做的不是被要求的事，报告却完全正常：
 *   `release-gate.mjs --skip-buildd` → 吞掉后**跑了完整构建**（多花数分钟），
 *   判决行与 `--skip-build` 逐行相同。看报告永远发现不了。
 *
 * 【为什么抽成共享 lib 而不是逐支复制】
 *
 * 量到过：共享 lib 引入一个参数会一次性打穿 N 份手抄白名单。反过来同样成立 ——
 * 39 份手抄的守卫意味着退出码语义有 39 处可以各自漂移。逐支复制那段模板，
 * 就是把「下一次改口径要改 39 处」写进设计。
 *
 * 还踩过一次：批量插入守卫的脚本用 `trim()` 找函数结尾，把守卫插进了
 * `flag()` 函数体中间 —— `node --check` 照样通过，守卫永不执行。
 * **语法通过不代表结构对。** 一次 import 调用没有那个失败模式。
 *
 * 【用法】
 *
 * P188-D 补了第二个洞：**value flag 缺值**（`--out` 结尾、或 `--a --b` 相邻）
 * 此前静默放行——调用方 `value()` 拿 undefined 回退默认值，产出一份
 * 「看起来正常、用的不是你给的参数」的报告。实测 gen-vector-operators
 * `--steepness` 尾随无值时静默产出默认参数算子，还盖着母本指纹。
 * 现与未知参数同罪：exit 2，点名缺值 flag。
 *
 * 【用法】
 *
 *   import { guardArgs } from '<...>/quality-gate-skill/lib/arg-guard.mjs';
 *
 *   // 只有 flag、不接位置参数（最常见）
 *   guardArgs({ flags: ['--json'] });
 *
 *   // 带取值 flag 与位置参数
 *   guardArgs({
 *     flags: ['--force'],                    // 布尔
 *     valueFlags: ['--out', '--project-root'],// 需要一个值
 *     maxPositional: 2,                       // 位置参数上限；0 = 一律拒绝
 *     usage: 'Usage: node x.mjs <ledger> [project-root] [--json]',
 *   });
 *
 * 退出码 2 = 拿不到正确输入 / 用法错误 —— 与「判定不通过」（1）必须可分。
 * 这条口径 已在 typography-skill 上统一过：同一个包里同一件事必须给同一个码。
 */

/**
 * 校验 argv，不合法就打印原因并 exit 2。
 *
 * 刻意**不返回解析结果** —— 各脚本已有自己的取参写法，让它们继续用。
 * 守卫的职责只有一条：**不认识的东西不许被静默忽略。**
 * 如果它同时接管解析，39 支的改动面会从 1 行变成整段，风险与收益不成比例。
 *
 * @param {object} spec
 * @param {string[]} [spec.flags]        布尔 flag（如 `--json`）
 * @param {string[]} [spec.valueFlags]   取值 flag（如 `--out <path>`）
 * @param {number}   [spec.maxPositional] 允许的位置参数个数上限，默认 0
 * @param {string}   [spec.usage]        用法行，报错时一起印出
 * @param {string[]} [spec.argv]         默认 `process.argv.slice(2)`；仅供自测注入
 * @param {(code:number)=>never} [spec.exit] 默认 `process.exit`；仅供自测注入
 */
export function guardArgs(spec = {}) {
  const {
    flags = [],
    valueFlags = [],
    maxPositional = 0,
    usage = null,
    argv = process.argv.slice(2),
    exit = process.exit,
  } = spec;

  const boolSet = new Set(flags);
  const valueSet = new Set(valueFlags);
  const bad = [];
  const missing = [];
  const positional = [];

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('-')) {
      positional.push(a);
      continue;
    }
    // `--flag=value` 与 `--flag value` 两种写法都要认，否则守卫会拒掉合法用法。
    // 踩过：第一版守卫一律拒位置参数，把 validate-brief-evidence 的
    // 合法调用从 exit 0 变成 exit 2 —— **守卫拒掉真实用法比不设守卫更糟。**
    const eq = a.indexOf('=');
    const name = eq > 0 ? a.slice(0, eq) : a;
    if (boolSet.has(name)) continue;
    if (valueSet.has(name)) {
      // `--out=x` 自带值；`--out x` 要吃掉下一项，否则那个值会被当成位置参数。
      if (eq > 0) continue;
      if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('-')) { i += 1; continue; }
      // 尾随无值 / 后随另一个 flag：不放行。缺值会让调用方静默回退默认值，
      // 报告正常而参数不是用户给的——与未知参数同族（P188-D 实测咬中）。
      missing.push(name);
      continue;
    }
    bad.push(a);
  }

  if (bad.length) {
    console.error(`不认识的参数: ${bad.join(' ')}`);
    console.error('  未知参数不被静默忽略 —— 否则脚本会退回默认输入，');
    console.error('  给出一份看起来完全正常、但判错对象的报告。');
    if (usage) console.error(`  ${usage}`);
    return exit(2);
  }

  if (missing.length) {
    console.error(`这些参数声明要跟值却没有值: ${missing.join(' ')}`);
    console.error('  缺值时调用方会静默回退默认值，产出一份看起来正常、');
    console.error('  实际用的不是你给的参数的报告（与吞参同罪，P188-D 实测咬中）。');
    if (usage) console.error(`  ${usage}`);
    return exit(2);
  }

  if (positional.length > maxPositional) {
    console.error(
      maxPositional === 0
        ? `本脚本不接位置参数，收到: ${positional.join(' ')}`
        : `位置参数最多 ${maxPositional} 个，收到 ${positional.length} 个: ${positional.join(' ')}`,
    );
    console.error('  多余的位置参数一旦被当成判定目标，报告会很正常而对象是错的。');
    if (usage) console.error(`  ${usage}`);
    return exit(2);
  }

  return undefined;
}

export default guardArgs;
