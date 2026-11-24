#!/usr/bin/env node
/**
 * S3C edit-contract gate.
 *   ⑤ changed-file allowlist 与 generated regeneration exception 是否显式声明
 *   ⑥ request-specific assertions 是否完整且通过
 *
 * 边界：本门禁不执行 JSON 中任意 generator 命令，也不能单独证明 generated
 * 文件从未被手改。生成流程的真实性仍需项目自己的可重复命令、Git diff、构建
 * 或浏览器证据支持。
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardArgs } from '../lib/arg-guard.mjs';

const args = process.argv.slice(2);
// 参数守卫。未知参数一律 exit 2 —— 静默吞掉会让脚本退回默认输入，
// 给出一份看起来完全正常、但判错对象或做错事情的报告。
guardArgs({
  valueFlags: ["--project-root","--changed-files"],
  usage: "Usage: node validate-edit-contract.mjs [--project-root <dir>] [--changed-files <list>]",
});
const valueAfter = (flag) => args.includes(flag) ? args[args.indexOf(flag) + 1] : null;
const root = path.resolve(valueAfter("--project-root") || process.cwd());
const changedFileInput = valueAfter("--changed-files");
const editRoot = path.join(root, "docs", "edit");
const required = ["edit-request.json", "editability-map.json", "edit-plan.json", "patch-log.json", "before-after.json"];
const sourceClasses = new Set(["canonical", "generated", "runtime-derived", "vendored", "unknown"]);
const errors = [];
const notes = [];  // 说得清但不判红的观察。
const readJson = (name) => {
  const file = path.join(editRoot, name);
  if (!fs.existsSync(file)) { errors.push(`missing contract: docs/edit/${name}`); return null; }
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) { errors.push(`invalid JSON: docs/edit/${name} (${error.message})`); return null; }
};
const nonEmptyArray = (value) => Array.isArray(value) && value.length > 0;
const isRepoFile = (file) => typeof file === "string" && file && !path.isAbsolute(file) && !file.split(/[\\/]/).includes("..") && fs.existsSync(path.join(root, file));

const [request, map, plan, patchLog, beforeAfter] = required.map(readJson);
if (request) {
  if (typeof request.request_id !== "string" || !request.request_id) errors.push("edit-request.request_id is required");
  if (request.authorization !== "authorized") errors.push("edit-request.authorization must be \"authorized\"");
  if (!nonEmptyArray(request.acceptance_criteria)) errors.push("edit-request.acceptance_criteria must be a non-empty array");
  else request.acceptance_criteria.forEach((item, i) => {
    if (!item || typeof item.id !== "string" || !item.id || typeof item.assertion !== "string" || !item.assertion) errors.push(`edit-request.acceptance_criteria[${i}] needs id and assertion`);
  });
}
let mapEntries = [];
if (map) {
  if (!nonEmptyArray(map.entries)) errors.push("editability-map.entries must be a non-empty array");
  else mapEntries = map.entries;
  mapEntries.forEach((entry, i) => {
    if (!entry || typeof entry.target !== "string" || !entry.target) errors.push(`editability-map.entries[${i}].target is required`);
    if (!sourceClasses.has(entry?.source_class)) errors.push(`editability-map.entries[${i}].source_class is invalid`);
    if (!isRepoFile(entry?.owner)) errors.push(`editability-map.entries[${i}].owner must be an existing root-relative file`);
    if (!nonEmptyArray(entry?.trace_evidence)) errors.push(`editability-map.entries[${i}] needs trace_evidence`);
    if (entry?.source_class === "canonical" && (!entry.symbol || !entry.confidence)) errors.push(`canonical map entry ${i} needs symbol and confidence`);
  });

  // Non-literal content: "grep found nothing" is not a trace.
  //
  // Every earlier fixture shares an assumption -- the visible string exists somewhere as a
  // literal, so grepping it eventually lands on an owner. i18n catalogues and CMS payloads break
  // that constantly: the rendered sentence is assembled at runtime from a template plus values,
  // and no file in the repository contains it. Measured on docs/quality/fixtures/s3c-i18n-fixture, three of
  // four visible strings return zero hits repository-wide.
  //
  // The failure this guards against is an agent writing `trace_evidence: ["grep '<sentence>'
  // returned no matches"]` and blocking. The evidence array is non-empty, so the existing check
  // passes, but nothing was actually traced. It is the same shape as the "a map exists but I
  // blocked anyway" mistake the SKILL already forbids: refusing what looks hard instead of
  // following the available evidence path.
  //
  // So when an entry's own evidence says the literal was not found, that entry must also show a
  // second, different evidence path. What counts is deliberately broad -- an i18n key, a
  // template fragment, a catalogue file, a runtime lookup, a DOM attribute -- because the aim is
  // to require that *some* real trace happened, not to prescribe how.
  //
  // The trigger has to be narrow, and the first version was not. Matching any negative phrasing
  // (`/no (match|hit|result)|0 .../`) misfired on two existing runs that were both correct:
  //
  //   h2b: "grep ... matches PricingCard.jsx:4" (found!) plus "No importer: ... returns 0 edges"
  //        and "Runtime DOM contains 0 .pricing-card nodes" -- those absences are about import
  //        edges and DOM nodes, and they are the *whole point* of that fixture (file exists, but
  //        nothing references it).
  //   m2:  "that generator file does NOT exist" -- about a missing build script, while the label
  //        string itself was found.
  //
  // Penalising those would punish the richest evidence in the corpus. So the trigger now requires
  // a search-for-text phrasing AND a not-found phrasing within the same evidence line, and it
  // explicitly excludes absences that are about importers, generators, DOM nodes or config.
  const SEARCHED_TEXT = /\b(grep|rg|ripgrep|search(?:ed|ing)?|look(?:ed|ing) for)\b[^.;]{0,80}?(literal|string|text|copy|sentence|phrase|label|"|'|“)/i;
  const NOT_FOUND = /\b(no match|no hits?|not found|zero (?:match|hit|result)|0 (?:match|hit|result)|returns? nothing|appears? nowhere|exists? in no (?:file|source))/i;
  // Absences that are legitimately about something other than the literal.
  const OTHER_ABSENCE = /\b(import(?:er|s)?|require|edge|generator|build (?:script|config)|package\.json|node_modules|DOM|element|node|selector|route|config)\b/i;
  const REAL_TRACE = /(i18n|locale|catalog|messages?\.json|translat|data-i18n|key[- ]?map|mangl|placeholder|interpolat|plural|template fragment|\{\w+\}|source ?map|\.map\b|sourcesContent|mappings|runtime lookup|getAttribute|dataset|CMS|API response|network)/i;

  // The check is per-MAP, not per-entry.
  //
  // Second correction. Requiring every "literal not here" entry to carry its own alternative
  // trace still misfired, because that phrasing has a second legitimate use: recording that a
  // *candidate* file is not the owner. Both h2b and m2 do exactly that --
  //
  //   h2b entry 2: served markup "Does not contain the string 'Studio plan' anywhere"
  //   m2 entry 1:  Pricing.jsx "renders the label but does not own its text"
  //
  // -- which is good evidence, not missing evidence. Ruling out a candidate is how a trace
  // narrows down, and m2's other entries do resolve the real owner.
  //
  // What actually matters is whether the map as a whole ever got past "grep missed". So: if any
  // entry reports the literal missing, at least one entry *somewhere in the map* must show a
  // real trace path, or the map must state that the value originates outside the repository.
  // A map that only contains "not found" lines never traced anything.
  const anyLiteralMissing = mapEntries.some((entry) => {
    const evidence = Array.isArray(entry?.trace_evidence) ? entry.trace_evidence.filter((e) => typeof e === "string") : [];
    return evidence.some((e) => SEARCHED_TEXT.test(e) && NOT_FOUND.test(e) && !OTHER_ABSENCE.test(e));
  });
  if (anyLiteralMissing) {
    const allEvidence = mapEntries.flatMap((entry) =>
      (Array.isArray(entry?.trace_evidence) ? entry.trace_evidence : []).filter((e) => typeof e === "string")
    );
    // An external origin is a complete answer -- the repo genuinely does not own the value.
    const EXTERNAL_ORIGIN = /(CMS|content management|API response|network request|fetch(?:ed)? at runtime|external system|not owned by (?:this|the) repo)/i;
    const traced = allEvidence.some((e) => REAL_TRACE.test(e) || EXTERNAL_ORIGIN.test(e));
    if (!traced) {
      errors.push(
        `editability-map reports the visible literal was not found, but no entry shows any other trace path. ` +
        `"grep missed" is not attribution: interpolated, pluralised, CMS-supplied and key-mangled text exists in no source file by design ` +
        `(measured: 3 of 4 targets in docs/quality/fixtures/s3c-i18n-fixture return zero hits repository-wide). ` +
        `Trace via the i18n key on the element, a distinctive template fragment, the message catalogue, or the runtime lookup -- ` +
        `or, if the value genuinely originates outside the repository, say so explicitly as the reason.`
      );
    }
  }
}
let allowlist = [];
let blocked = false;
let partial = false;
if (plan) {
  if (!request || plan.request_id !== request.request_id) errors.push("edit-plan.request_id must match edit-request.request_id");
  blocked = typeof plan.decision === "string" && /^blocked/.test(plan.decision);
  // Partially blocked: some targets have a safe canonical owner, others do not.
  //
  // This third outcome was missing, and the gate contradicted the SKILL because of it. The
  // SKILL says the correct result for a multi-target i18n/CMS request "is often partially
  // blocked", but the gate treated `decision` as binary: a blocked run must change nothing and
  // fail at least one assertion, while any other run must have every assertion `passed: true`.
  //
  // Found by a clean-tree agent run on s3c-i18n-fixture. Asked to change two strings -- one
  // owned by the message catalogue, one supplied by a CMS -- the agent traced both correctly,
  // then spent seven attempts trying to encode "one applied, one genuinely cannot be" and
  // concluded there was no honest way to express it. It explicitly refused the dishonest exits
  // (editing the CMS stand-in file, or rewording the criterion so it could pass).
  //
  // A gate that leaves no truthful encoding of a real outcome pressures agents to either
  // over-claim or refuse work they could partly do. So `partially_blocked` is now a first-class
  // decision, with obligations from BOTH paths rather than a relaxation of either:
  //   - source changes are allowed, and must match the patch log and allowlist exactly;
  //   - at least one assertion must fail, each failure carrying a blocked_reason;
  //   - at least one assertion must pass, so "partial" is not a euphemism for "blocked";
  //   - blocked_reason and unblock_options are still required, scoped to the blocked part.
  partial = typeof plan.decision === "string" && /^partial/.test(plan.decision);
  if (!nonEmptyArray(plan.allowed_files)) errors.push("edit-plan.allowed_files must be a non-empty array");
  else {
    allowlist = plan.allowed_files;
    allowlist.forEach((file, i) => { if (!isRepoFile(file)) errors.push(`edit-plan.allowed_files[${i}] must be an existing root-relative file`); });
  }
  if (plan.generated_files != null && !Array.isArray(plan.generated_files)) errors.push("edit-plan.generated_files must be an array when present");
  (plan.generated_files || []).forEach((item, i) => {
    if (!item || !isRepoFile(item.file) || !item.generator || !item.reason) errors.push(`edit-plan.generated_files[${i}] needs existing file, generator, and reason`);
  });
  ["boundary", "risk", "fallback", "validation"].forEach((key) => { if (typeof plan[key] !== "string" || !plan[key]) errors.push(`edit-plan.${key} is required`); });
  if (!nonEmptyArray(plan.preserve_invariants)) errors.push("edit-plan.preserve_invariants must be a non-empty array");
}

const changedFiles = (() => {
  if (changedFileInput) {
    try { const input = JSON.parse(fs.readFileSync(path.resolve(changedFileInput), "utf8")); return Array.isArray(input) ? input : input.files; }
    catch (error) { errors.push(`cannot read --changed-files: ${error.message}`); return []; }
  }
  try {
    // `git diff --name-only HEAD` reports tracked modifications and deletions but NOT new
    // untracked files. That was silently wrong for content-hashed build output.
    //
    // Found by running the real-bundler fixture. Vite names chunks `index-<hash>.js`, so a
    // rebuild DELETES index-DunFAchn.js and CREATES index-DUSBUmds.js. The old names showed
    // up as changed and were reported as "direct generated/build output change is
    // prohibited" -- flagging, as a prohibited hand-edit, the four files that had been
    // correctly regenerated. Meanwhile the four genuinely new outputs were untracked and so
    // were never checked at all: the gate audited files that no longer existed and ignored
    // the ones that did.
    //
    // The hand-written map fixture could not surface this because it emitted fixed
    // filenames. Real bundlers hash by content.
    // git 的 stderr 必须挡住。不挡的话 `warning: LF will be replaced by CRLF` 会逐文件印一行，
    // 全部混进本门禁自己的报告 —— 本仓库实测 77 行里 72 行是 git 噪声，5 行才是真实判定。
    // 报告的 94% 是别的程序的警告时，读的人找不到结论。
    const git = (extra) => execFileSync("git", ["-C", root, ...extra], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });

    // `git -C <dir>` 在 <dir> 不是仓库根时会**静默上溯到外层仓库**。
    // 把站点放在 monorepo 的子目录里就是这种情形，而那时 git 返回的路径带 `site/` 前缀
    // （相对外层根），契约里的路径相对 project-root —— 两套路径永不相交。
    //
    // 隔离实测的后果：一次**完全正确**的编辑被判红 6 条，每条措辞都在指错方向；
    // 外层仓库里一个无关文件的改动会改变被测工程的判定；
    // 而 `patch-log declares no-longer-changed file: src/components/Hero.mjs`
    // 是纯假信息 —— 那个文件明明刚改过。
    //
    // 不靠切前缀解决：被测工程恰好就是仓库根时切前缀会切错。
    // `--relative` 是 git 自己提供的正解，它按 -C 给的目录算相对路径。
    const toplevel = git(["rev-parse", "--show-toplevel"]).trim();
    const sameRoot = toplevel && path.resolve(toplevel) === path.resolve(root);

    // `git diff --name-only HEAD` 报改动与删除，但**不报未跟踪的新文件**。
    // 那对内容哈希命名的构建产物是静默错的（见下方 real-bundler 那段实测）。
    const tracked = git(["diff", "--name-only", "--relative", "HEAD"]).split(/\r?\n/).filter(Boolean);
    const untracked = git(["ls-files", "--others", "--exclude-standard"]).split(/\r?\n/).filter(Boolean);
    if (!sameRoot) {
      // ls-files --others 不吃 --relative，它始终相对仓库根。
      // 这里只在确知 project-root 是仓库的子目录时才裁剪，且裁完必须真的落在目录内。
      const prefix = path.relative(toplevel, root).split(path.sep).join("/") + "/";
      for (let i = 0; i < untracked.length; i += 1) {
        untracked[i] = untracked[i].startsWith(prefix) ? untracked[i].slice(prefix.length) : null;
      }
      // 落在 project-root 之外的未跟踪文件不是这次编辑的产物，也无法与契约对齐。
      // 不静默丢掉：报出来，让读的人知道工作树里还有别的东西。
      const outside = git(["ls-files", "--others", "--exclude-standard"]).split(/\r?\n/)
        .filter(Boolean).filter((f) => !f.startsWith(prefix));
      if (outside.length) {
        notes.push(`${outside.length} untracked file(s) live outside --project-root (repo root is ${toplevel}); `
          + `not judged against this contract: ${outside.slice(0, 5).join(", ")}${outside.length > 5 ? ", ..." : ""}`);
      }
    }
    return [...new Set([...tracked, ...untracked.filter(Boolean)])];
  } catch { errors.push("cannot determine Git changed files; provide --changed-files <json-file>"); return []; }
})();
if (!Array.isArray(changedFiles)) errors.push("--changed-files must contain an array or { files: array }");
const contractFiles = new Set(required.map((name) => `docs/edit/${name}`));
// Evidence artefacts under docs/edit/evidence/ are part of the contract, not source changes.
//
// Found by the real-bundler run: the agent wrote a browser probe and a map-tracing script
// there to produce the request-specific before/after evidence the skill demands, and the
// gate counted all four files as changes outside the allowlist. That is the same
// anti-incentive as failing a correct refusal -- it pressures the agent to either not gather
// evidence or to hide it, when the whole point of S3C is that gate results are not a
// substitute for request-specific proof.
//
// Scoped to this one directory deliberately. It is not a general "ignore untracked files"
// rule: the same run also left a `.diag-changed.json` scratch file in the repo root, and
// that still fails. Debris in the working tree is worth reporting.
const isEvidenceArtefact = (file) => /^docs\/edit\/evidence\//.test(file);
const sourceChanges = (Array.isArray(changedFiles) ? changedFiles : []).filter((file) => !contractFiles.has(file) && !isEvidenceArtefact(file));
const approvedGenerated = new Map((plan?.generated_files || []).map((item) => [item?.file, item]));

// Content-hashed output: a rebuild replaces `index-<oldhash>.js` with `index-<newhash>.js`,
// so the old path shows up as changed (deleted) while no longer existing on disk.
//
// It cannot simply be exempted -- deleting a build artefact can also be damage, and "it was
// a rebuild" is exactly the claim that needs evidence rather than assumption. So the plan
// must say so: `generated_files[].replaces` names the output this one supersedes. That keeps
// the disclosure symmetric with generator_edits -- the agent states the relationship, and
// the gate checks the stated relationship against what Git actually shows.
const supersededGenerated = new Map();
for (const item of plan?.generated_files || []) {
  const replaced = item?.replaces;
  if (!replaced) continue;
  for (const old of Array.isArray(replaced) ? replaced : [replaced]) {
    if (typeof old === "string" && old) supersededGenerated.set(old, item);
  }
}
// A superseded path must actually be gone. Declaring `replaces` for a file that is still
// present would let a real hand-edit hide behind a rename story.
for (const [old, item] of supersededGenerated) {
  if (fs.existsSync(path.join(root, old))) {
    errors.push(
      `edit-plan declares ${item.file} replaces ${old}, but ${old} still exists. ` +
      `A superseded output must be absent after the rebuild; if both exist, this is not a rename.`
    );
  }
}

if (plan) sourceChanges.forEach((file) => {
  if (allowlist.includes(file)) return;
  if ((plan.generated_files || []).some((item) => item?.file === file)) return;
  if (supersededGenerated.has(file)) return;
  errors.push(`changed file outside edit-plan allowlist: ${file}`);
});

// A build script is canonical, but it is not content: it defines how every output is
// produced, so changing it can alter files the request never mentioned. Found by running
// the map fixture, where an agent correctly had to edit the generator (the fixture hard
// coded a string) and the gate accepted it silently as just another allowlisted file.
//
// Any generator named in generated_files must therefore be declared explicitly if it is
// itself modified. This is not a prohibition — sometimes the generator is the right place
// to change — it is a requirement to say so, because "I edited one component" and "I
// changed how the whole bundle is built" should not look identical in a patch log.
const declaredGenerators = new Set();
for (const item of plan?.generated_files || []) {
  if (typeof item?.generator !== "string") continue;
  // `node script/gen-map.mjs` -> `script/gen-map.mjs`
  for (const token of item.generator.split(/\s+/)) {
    if (/\.(mjs|cjs|js|ts|py|sh)$/.test(token)) declaredGenerators.add(token.replace(/^\.\//, ""));
  }
}
const declaredGeneratorEdits = new Set(
  (plan?.generator_edits || []).map((item) => (typeof item === "string" ? item : item?.file)).filter(Boolean)
);
if (plan?.generator_edits != null && !Array.isArray(plan.generator_edits)) {
  errors.push("edit-plan.generator_edits must be an array when present");
}
sourceChanges.forEach((file) => {
  if (!declaredGenerators.has(file)) return;
  if (declaredGeneratorEdits.has(file)) return;
  errors.push(
    `changed a build generator without declaring it: ${file}. It produces ` +
    `${(plan?.generated_files || []).filter((g) => (g.generator || "").includes(file)).map((g) => g.file).join(", ")}. ` +
    `Add it to edit-plan.generator_edits with a reason — editing how outputs are built is not the same as editing content.`
  );
});
(plan?.generator_edits || []).forEach((item, i) => {
  const file = typeof item === "string" ? item : item?.file;
  if (typeof item !== "string" && (!file || !item?.reason)) {
    errors.push(`edit-plan.generator_edits[${i}] needs { file, reason } — a bare path does not say why the build had to change`);
  }
});
sourceChanges.forEach((file) => {
  const match = mapEntries.find((entry) => entry.owner === file);
  if (match && match.source_class !== "canonical" && !(match.source_class === "generated" && approvedGenerated.has(file))) errors.push(`direct change to ${match.source_class} owner is prohibited: ${file}`);
  if (/^(?:public\/)?(?:generated|dist|build|\.next)\//.test(file) && !approvedGenerated.has(file) && !supersededGenerated.has(file)) {
    errors.push(
      `direct generated/build output change is prohibited: ${file}` +
      (fs.existsSync(path.join(root, file))
        ? ""
        : ` (this path no longer exists -- if a rebuild renamed it, declare the new output with "replaces": "${file}")`)
    );
  }
});
if (plan?.decision !== undefined && typeof plan.decision !== "string") errors.push("edit-plan.decision must be a string when present");
if (blocked) {
  // A blocked run is a legitimate S3C outcome: the requested target had no safe canonical
  // owner, so refusing to patch is correct. Requiring a non-empty patch log and passing
  // assertions here would reward touching something just to satisfy the gate.
  if (sourceChanges.length) errors.push(`edit-plan.decision is "${plan.decision}" but ${sourceChanges.length} source file(s) changed: ${sourceChanges.join(", ")}`);
  if (patchLog) {
    if (!Array.isArray(patchLog.changed_files) || patchLog.changed_files.length) errors.push("blocked run requires patch-log.changed_files to be an empty array");
    if (typeof patchLog.diff_summary !== "string" || !patchLog.diff_summary) errors.push("patch-log.diff_summary is required");
  }
  if (typeof plan.blocked_reason !== "string" || !plan.blocked_reason) errors.push("blocked run requires edit-plan.blocked_reason explaining why no safe patch exists");
  if (!nonEmptyArray(plan.unblock_options)) errors.push("blocked run requires edit-plan.unblock_options listing what a human must decide");
  if (beforeAfter) {
    const expected = new Set((request?.acceptance_criteria || []).map((item) => item.id));
    const actual = new Map((beforeAfter.assertions || []).map((item) => [item?.id, item]));
    expected.forEach((id) => {
      const result = actual.get(id);
      if (!result) errors.push(`before-after missing request assertion: ${id}`);
      else if (!result.method) errors.push(`blocked run assertion ${id} still needs a method describing how it was checked`);
      else if (result.passed === false && !result.blocked_reason) errors.push(`blocked run assertion ${id} is failing and must record a blocked_reason`);
    });
    // A blocked run must not claim every criterion passed: if they all passed, nothing
    // was blocked and the run should have applied the edit instead.
    const anyBlocked = [...expected].some((id) => actual.get(id)?.passed === false);
    if (expected.size && !anyBlocked) errors.push("edit-plan.decision is blocked but every request assertion passed —— either apply the edit or record which criterion cannot be met");
  }
} else if (partial) {
  // Partially blocked carries the obligations of both paths.
  if (typeof plan.blocked_reason !== "string" || !plan.blocked_reason) errors.push("partially blocked run requires edit-plan.blocked_reason explaining which target has no safe owner and why");
  if (!nonEmptyArray(plan.unblock_options)) errors.push("partially blocked run requires edit-plan.unblock_options for the blocked portion");
  if (patchLog) {
    if (!request || patchLog.request_id !== request.request_id) errors.push("patch-log.request_id must match edit-request.request_id");
    // The applied portion is a real edit, so it is held to the full changed-file discipline.
    if (!nonEmptyArray(patchLog.changed_files)) errors.push("partially blocked run still applied an edit, so patch-log.changed_files must list it; if nothing changed, the decision is blocked, not partial");
    else {
      const declared = new Set(patchLog.changed_files);
      sourceChanges.forEach((file) => { if (!declared.has(file)) errors.push(`Git change missing from patch-log.changed_files: ${file}`); });
      patchLog.changed_files.forEach((file) => { if (!sourceChanges.includes(file)) errors.push(`patch-log declares no-longer-changed file: ${file}`); });
    }
    if (typeof patchLog.diff_summary !== "string" || !patchLog.diff_summary) errors.push("patch-log.diff_summary is required");
  }
  if (beforeAfter) {
    if (!request || beforeAfter.request_id !== request.request_id) errors.push("before-after.request_id must match edit-request.request_id");
    const expected = new Set((request?.acceptance_criteria || []).map((item) => item.id));
    const actual = new Map((beforeAfter.assertions || []).map((item) => [item?.id, item]));
    expected.forEach((id) => {
      const result = actual.get(id);
      if (!result) { errors.push(`before-after missing request assertion: ${id}`); return; }
      if (!result.method) errors.push(`partially blocked run assertion ${id} needs a method describing how it was checked`);
      if (result.passed === true && (!result.before || !result.after)) errors.push(`passing assertion ${id} needs before and after evidence`);
      if (result.passed === false && !result.blocked_reason) errors.push(`failing assertion ${id} must record a blocked_reason`);
    });
    const anyBlocked = [...expected].some((id) => actual.get(id)?.passed === false);
    const anyPassed = [...expected].some((id) => actual.get(id)?.passed === true);
    // Both directions are required, otherwise "partial" is being used to dodge one of the two
    // stricter paths: all-failing is a blocked run, all-passing is an ordinary applied run.
    if (expected.size && !anyBlocked) errors.push("edit-plan.decision is partial but every assertion passed —— that is an applied run, not a partial one");
    if (expected.size && !anyPassed) errors.push("edit-plan.decision is partial but no assertion passed —— that is a blocked run, not a partial one");
  }
} else {
if (patchLog) {
  if (!request || patchLog.request_id !== request.request_id) errors.push("patch-log.request_id must match edit-request.request_id");
  if (!nonEmptyArray(patchLog.changed_files)) errors.push("patch-log.changed_files must be a non-empty array");
  else {
    const declared = new Set(patchLog.changed_files);
    sourceChanges.forEach((file) => { if (!declared.has(file)) errors.push(`Git change missing from patch-log.changed_files: ${file}`); });
    patchLog.changed_files.forEach((file) => { if (!sourceChanges.includes(file)) errors.push(`patch-log declares no-longer-changed file: ${file}`); });
  }
  if (typeof patchLog.diff_summary !== "string" || !patchLog.diff_summary) errors.push("patch-log.diff_summary is required");
}
if (beforeAfter) {
  if (!request || beforeAfter.request_id !== request.request_id) errors.push("before-after.request_id must match edit-request.request_id");
  if (!nonEmptyArray(beforeAfter.assertions)) errors.push("before-after.assertions must be a non-empty array");
  const expected = new Set((request?.acceptance_criteria || []).map((item) => item.id));
  const actual = new Map((beforeAfter.assertions || []).map((item) => [item?.id, item]));
  expected.forEach((id) => {
    const result = actual.get(id);
    if (!result) errors.push(`before-after missing request assertion: ${id}`);
    else if (!result.before || !result.after || !result.method || result.passed !== true) errors.push(`before-after assertion ${id} needs before, after, method, and passed: true`);
  });
}
}

if (errors.length) {
  errors.forEach((error) => console.error(`FAIL: ${error}`));
  process.exit(1);
}
if (blocked) {
  // 观察项印在结论之前 —— 「没判到的东西」必须可见，否则它就是个盲区。
  for (const n of notes) console.log(`note: ${n}`);
  console.log(`S3C edit contract passed as BLOCKED: ${request.request_id}; no safe canonical owner, 0 source change(s), ${plan.unblock_options.length} unblock option(s). This is not an applied edit.`);
} else if (partial) {
  const results = new Map((beforeAfter?.assertions || []).map((item) => [item?.id, item]));
  const ids = (request.acceptance_criteria || []).map((c) => c.id);
  const passedCount = ids.filter((id) => results.get(id)?.passed === true).length;
  const blockedCount = ids.filter((id) => results.get(id)?.passed === false).length;
  console.log(
    `S3C edit contract passed as PARTIALLY BLOCKED: ${request.request_id}; ` +
    `${passedCount} criterion(s) applied and verified, ${blockedCount} blocked, ${sourceChanges.length} source change(s). ` +
    `The blocked portion was NOT delivered -- see edit-plan.blocked_reason and unblock_options.`
  );
} else {
  console.log(`S3C edit contract passed: ${request.request_id}; ${sourceChanges.length} source change(s), ${request.acceptance_criteria.length} request assertion(s)`);
}
