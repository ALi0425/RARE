import type { ParseResult } from "../types";

const API_KEY = process.env.LLM_API_KEY || "";
const API_URL = process.env.LLM_API_URL || "https://api.anthropic.com/v1/messages";
const MODEL = process.env.LLM_MODEL || "claude-sonnet-4-20250514";

export async function parseDocument(text: string): Promise<ParseResult> {
  // Use local parser when no API key configured
  if (!API_KEY || API_KEY === "your-api-key-here") {
    return localParse(text);
  }

  try {
    const isOpenAI = API_URL.includes("openai");
    if (isOpenAI) {
      return await callOpenAI(text);
    }
    return await callClaude(text);
  } catch (err) {
    console.warn("LLM parse failed, falling back to local parser:", err);
    return localParse(text);
  }
}

async function callClaude(text: string): Promise<ParseResult> {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: text }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error: ${response.status} ${err}`);
  }

  const data = (await response.json()) as { content?: Array<{ text?: string }> };
  return extractJSON(data.content?.[0]?.text || "");
}

async function callOpenAI(text: string): Promise<ParseResult> {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8192,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${err}`);
  }

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return extractJSON(data.choices?.[0]?.message?.content || "");
}

function extractJSON(text: string): ParseResult {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON found in LLM response");
  const parsed = JSON.parse(jsonMatch[0]);
  return {
    entities: parsed.entities || [],
    edges: parsed.edges || [],
  };
}

// ============================================================
// Local intelligent parser - markdown-aware with line-by-line analysis
// ============================================================

interface ParseContext {
  entities: ParseResult["entities"];
  edges: ParseResult["edges"];
  currentModule: string | null;
  currentPage: string | null;
}

const MODULE_KEYWORDS = /模块|系统|功能|管理|中心|服务/;
const PAGE_SUFFIX = /[页面]$/;
const FIELD_PATTERNS = [
  /(?:搜索|输入|选择|下拉|日期|时间|文本|备注|描述)(?:框|栏|区域|器)/,  // 搜索框, 输入框, 选择框
  /表格/,           // 表格
  /列表/,           // 列表
  /筛选(?:\w{0,4})?[栏器]?/, // 筛选栏, 筛选器
  /(?:单选|复选|勾选|开关)/, // 单选, 复选, 勾选, 开关
  /滑块/,           // 滑块
  /上传/,           // 上传
  /(?:密码|邮箱|电话|手机|金额|数量|价格|积分|日期)[\w]{0,4}(?:框|栏|器)?/, // 密码框, 邮箱输入框, etc
  /字段/,           // 字段(通用field后缀)
];
const ACTION_PATTERNS = [
  /按钮$/,
  /链接$/,
  /提交/,
  /确认/,
  /保存/,
  /删除/,
  /取消/,
  /编辑/,
  /新增/,
  /创建/,
  /导入/,
  /导出/,
  /查询/,
  /搜索/,
  /重置/,
  /返回/,
  /操作$/,
];

let entityIdCounter = 0;
function nextId(): string {
  return `e${++entityIdCounter}`;
}

/** Clean markdown formatting from a string */
function cleanMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")  // bold
    .replace(/\*(.+?)\*/g, "$1")      // italic
    .replace(/`(.+?)`/g, "$1")        // code
    .replace(/~~(.+?)~~/g, "$1")      // strikethrough
    .replace(/\\([\\`*_{}[\]()#+\-.!])/g, "$1") // escape chars
    .replace(/^[\d.]+/, "")           // leading numbers
    .trim();
}

/** Check if a line looks like a markdown heading */
function isHeading(line: string): { level: number; title: string } | null {
  const m = line.match(/^(#{1,6})\s+(.+)/);
  if (m) return { level: m[1].length, title: cleanMarkdown(m[2].trim()) };
  return null;
}

/** Check if a line is a bullet point item */
function isBullet(line: string): string | null {
  const m = line.match(/^\s*[-*+]\s+(.+)/);
  if (m) return m[1].trim();
  const m2 = line.match(/^\s*\d+[.、]\s+(.+)/);
  if (m2) return m2[1].trim();
  return null;
}

/** Split text that uses "/" as a separator between entity names (common in PRDs).
 *  E.g. "支付模块 / 支付页面" → ["支付模块", "支付页面"] */
function splitSlashSeparated(text: string): string[] {
  const parts = text.split(/\s*\/\s*/).filter(Boolean);
  if (parts.length >= 2 && parts.every(p => p.length >= 2 && p.length <= 15)) {
    return parts;
  }
  return [text];
}

/** Check if a line contains bold text which indicates entity names */
function isBold(line: string): string | null {
  const m = line.match(/\*\*(.+?)\*\*/);
  if (m) return m[1].trim();
  return null;
}

function looksLikeModuleName(name: string): boolean {
  return MODULE_KEYWORDS.test(name) || name.endsWith("规范") || name.endsWith("机制") || name.endsWith("设计");
}

function looksLikePageName(name: string): boolean {
  return PAGE_SUFFIX.test(name) || name.endsWith("页") || name.endsWith("大厅") || name.endsWith("主页");
}

function classifyEntity(name: string): string | null {
  // Remove leading type hints like "L1", "L2", etc.
  const clean = name.replace(/^L[1-3]\s+/, "");
  if (looksLikeModuleName(clean)) return "module";
  if (looksLikePageName(clean)) return "page";
  for (const p of FIELD_PATTERNS) {
    if (p.test(name)) return "field";
  }
  for (const p of ACTION_PATTERNS) {
    if (p.test(name)) return "action";
  }
  return null;
}

/** Extract the actual entity name, removing noise */
function cleanEntityName(name: string): string {
  return name
    .replace(/^[-*+•]\s*/, "")
    .replace(/\s*[（(].+[)）]\s*/, "") // remove parentheses content for matching
    .trim();
}

/** Check if an entity name is likely noise (not a real entity) */
function isNoise(name: string): boolean {
  if (name.length < 2 || name.length > 30) return true;
  // Skip if it looks like a sentence fragment
  if (/^[的了是在于与及或而所被把让给对向跟比从到关于按照根据通过为了除了]$/.test(name[0])) return true;
  if (/^(因此|所以|但是|然而|此外|另外|总之|如果|因为|为了|通过|根据|关于|对于|除了)$/.test(name)) return true;
  if (/^[a-zA-Z0-9]{10,}$/.test(name)) return true; // random alphanumeric
  if (/[<>]/.test(name)) return true;
  return false;
}

function addEntity(ctx: ParseContext, name: string, type: string): void {
  if (isNoise(name)) return;
  // Dedup by name+type
  if (ctx.entities.some(e => e.name === name && e.type === type)) return;

  const parentName = type === "page" ? ctx.currentModule :
    type === "field" || type === "action" ? ctx.currentPage : undefined;

  ctx.entities.push({
    name,
    type: type as any,
    ...(parentName ? { parentName } : {}),
  });
}

/** Extract flow edges from text */
function tryExtractEdges(ctx: ParseContext, content: string): void {
  // Pattern 1: "点击X后进入Y" / "提交X后跳转到Y" (standard)
  const flowRe = /(?:点击|提交)([^。！？\n]{1,15})后.*?(?:进入|跳转|转到|显示)([^，。！？\n]{1,20})/g;
  let m;
  while ((m = flowRe.exec(content)) !== null) {
    const actName = normalizeActionName(m[1].replace(/[，,系统页面会]/g, "").trim());
    const targetName = normalizePageName(m[2].trim());
    tryAddEdge(ctx, actName, targetName, m[0]);
  }

  // Pattern 2: Simpler "点击X进入Y" / "提交X显示Y"
  const flowSimpleRe = /(?:点击|提交)([^，,。！？\n]{1,10})(?:后|)(?:，|)(?:自动|)(?:进入|跳转|转到|显示)([^，,。！？\n]{1,20})/g;
  while ((m = flowSimpleRe.exec(content)) !== null) {
    const actName = normalizeActionName(m[1]);
    const targetName = normalizePageName(m[2]);
    tryAddEdge(ctx, actName, targetName, m[0]);
  }

  // Pattern 3: "在X页点击Y后进入Z" — page as context
  const inPageRe = /在([^，。！？\n]{1,10}(?:页|面))[，,]\s*(?:点击|提交)([^，。！？\n]{1,15})后.*?(?:进入|跳转|转到|显示)([^，。！？\n]{1,20})/g;
  while ((m = inPageRe.exec(content)) !== null) {
    const srcPage = normalizePageName(m[1].trim());
    const actName = normalizeActionName(m[2].replace(/[，,系统页面会]/g, "").trim());
    const targetName = normalizePageName(m[3].trim());
    // Lookup source page entity
    const srcEntity = ctx.entities.find(e => e.name === srcPage);
    if (srcEntity) {
      const exists = ctx.edges.some(e => e.sourceName === srcPage && e.targetName === targetName);
      if (!exists) {
        ctx.edges.push({ sourceName: srcPage, targetName, sourceType: "page", targetType: "page", flowType: "BUSINESS_FLOW", status: "extracted", label: actName, sourceQuote: m[0] });
      }
    } else {
      tryAddEdge(ctx, actName, targetName, m[0]);
    }
  }

  // Pattern 4: "从X跳转到Y" / "X→Y" simple flow
  const fromToRe = /从([^，。！？\n]{1,15}(?:页|面|主页|大厅))后?(?:进入|跳转|转到|导向|访问)([^，。！？\n]{1,20}(?:页|面|主页|大厅))/g;
  while ((m = fromToRe.exec(content)) !== null) {
    const srcName = normalizePageName(m[1].trim());
    const targetName = normalizePageName(m[2].trim());
    const exists = ctx.edges.some(e => e.sourceName === srcName && e.targetName === targetName);
    if (!exists) {
      ctx.edges.push({ sourceName: srcName, targetName, sourceType: "page", targetType: "page", flowType: "BUSINESS_FLOW", status: "extracted", label: "", sourceQuote: m[0] });
    }
  }

  // Pattern 5: "点击X跳转到Y" without explicit action suffix
  const clickJumpRe = /点击([^，。！？\n]{1,12})(?:后|)(?:，|)(?:自动|)(?:进入|跳转|转到|显示|导向)([^，。！？\n]{1,20}(?:页|面|主页|大厅))/g;
  while ((m = clickJumpRe.exec(content)) !== null) {
    const actName = normalizeActionName(m[1].replace(/页面|系统/g, "").trim());
    const targetName = normalizePageName(m[2].trim());
    tryAddEdge(ctx, actName, targetName, m[0]);
  }
}

function normalizeActionName(raw: string): string {
  const clean = raw.trim();
  if (/(?:按钮|链接|钮)$/.test(clean)) return clean;
  return clean + "按钮";
}

function normalizePageName(raw: string): string {
  // Strip trailing punctuation/parentheses that break suffix detection
  let name = raw.replace(/[）\)\s]+$/, "").replace(/页面$/, "页");
  if (name.endsWith("主页")) name = "个人主页";
  else if (!name.endsWith("页") && !name.endsWith("面") && !name.endsWith("大厅")) {
    name += "页";
  }
  return name;
}

function tryAddEdge(
  ctx: ParseContext,
  actName: string,
  targetName: string,
  quote: string
): void {
  const actEntity = ctx.entities.find(e => e.name === actName);
  const targetEntity = ctx.entities.find(e => e.name === targetName);

  let finalTarget = targetEntity;
  if (!targetEntity) {
    ctx.entities.push({ name: targetName, type: "page" });
    finalTarget = ctx.entities[ctx.entities.length - 1];
  }

  if (actEntity && finalTarget) {
    const sourceName = actEntity.parentName;
    if (sourceName) {
      const exists = ctx.edges.some(e => e.sourceName === sourceName && e.targetName === targetName);
      if (!exists) {
        ctx.edges.push({
          sourceName,
          targetName,
          sourceType: "page",
          targetType: "page",
          flowType: "BUSINESS_FLOW",
          status: "extracted",
          label: actName,
          sourceQuote: quote,
        });
      }
    }
  }
}

function localParse(text: string): ParseResult {
  const ctx: ParseContext = {
    entities: [],
    edges: [],
    currentModule: null,
    currentPage: null,
  };

  // Phase 1: Parse markdown structure
  const sections: Array<{ level: number; title: string; content: string }> = [];
  let currentSection: { level: number; title: string; content: string } | null = null;

  for (const line of text.split("\n")) {
    const heading = isHeading(line);
    if (heading) {
      if (currentSection) sections.push(currentSection);
      currentSection = { level: heading.level, title: heading.title, content: "" };
    } else if (currentSection) {
      currentSection.content += line + "\n";
    }
  }
  if (currentSection) sections.push(currentSection);

  // Phase 2: Extract entities from section structure
  for (const section of sections) {
    if (section.level === 1) continue; // project title

    if (section.level === 2) {
      const moduleName = cleanEntityName(section.title);
      if (!isNoise(moduleName)) {
        ctx.currentModule = moduleName;
        addEntity(ctx, moduleName, "module");
      }
    }

    if (section.level === 3) {
      let pageName = cleanEntityName(section.title);
      pageName = pageName.replace(/^[\d.]+/, "").trim();
      if (pageName && !isNoise(pageName)) {
        ctx.currentPage = pageName;
        addEntity(ctx, pageName, "page");
      }
    }

    if (section.level >= 4) {
      const headingClean = cleanEntityName(section.title);
      const entityType = classifyEntity(headingClean);
      if (entityType === "field") addEntity(ctx, headingClean, "field");
      else if (entityType === "action") addEntity(ctx, headingClean, "action");
    }

    // Extract entities from section content
    const contentLines = section.content.split("\n");
    for (const cl of contentLines) {
      const trimmed = cl.trim();
      if (!trimmed || isHeading(trimmed)) continue;

      const bullet = isBullet(trimmed);
      const textToAnalyze = bullet ? bullet : trimmed;

      // Check for bold text (often entity names in PRDs)
      const boldMatch = textToAnalyze.match(/\*\*(.+?)\*\*/g);
      if (boldMatch) {
        for (const b of boldMatch) {
          const clean = cleanMarkdown(b);
          if (isNoise(clean)) continue;
          // Also check for "L1"/"L2"/"L3" prefix
          const typeHint = clean.match(/^(L[1-3])\s(.+)/);
          if (typeHint) {
            const hintMap: Record<string, string> = { "L1": "module", "L2": "page", "L3": "field" };
            addEntity(ctx, typeHint[2], hintMap[typeHint[1]] || "field");
          } else {
            const entityType = classifyEntity(clean);
            if (entityType) addEntity(ctx, clean, entityType);
          }
        }
        continue;
      }

      // Extract entity names from bullet/text patterns
      if (bullet) {
        // Pre-process: strip parenthetical hints like "用户名（文本字段）"
        // and use the hint content for better entity type classification.
        const parenHint = bullet.match(/^(.+?)[（(]([^)）]+)[)）]\s*$/);
        const bulletClean = parenHint ? parenHint[1].trim() : bullet;
        const bulletHint = parenHint ? parenHint[2].trim() : null;

        // If we had a hint, try classifying the base name first
        let parenHintHandled = false;
        if (parenHint && bulletHint) {
          // 1) Classify the hint directly ("文本字段" / "密码字段" → field)
          const hintType = classifyEntity(bulletHint);
          if (hintType) {
            addEntity(ctx, bulletClean, hintType);
            parenHintHandled = true;
          }
          // 2) Keyword-based classification for common Chinese PRD patterns
          else if (/字段|值|信息|内容|数据/.test(bulletHint)) {
            addEntity(ctx, bulletClean, "field");
            parenHintHandled = true;
          }
          else if (/操作|验证|点击|提交|确认|动作|跳转/.test(bulletHint)) {
            addEntity(ctx, bulletClean, "action");
            parenHintHandled = true;
          }
          // 3) Check clean name for direct suffixes
          else if (/按钮$|链接$|提交|确认|保存|删除|编辑|新增|创建|导入|导出/.test(bulletClean)) {
            addEntity(ctx, bulletClean, "action");
            parenHintHandled = true;
          }
          else if (/框|栏|表格|列表|选择器|输入|搜索|筛选/.test(bulletClean)) {
            addEntity(ctx, bulletClean, "field");
            parenHintHandled = true;
          }

          if (parenHintHandled) continue;
          // Ambiguous: fall through to normal patterns but use clean name
          // to avoid capturing parentheses in the entity name
        }

        // Use cleaned name when parenHint matched to avoid "密码（密码字段）" as entity name
        const effectiveName = (parenHint && !parenHintHandled) ? bulletClean : bullet;

        // Handle "/" separated entity pairs like "支付模块 / 支付页面"
        const slashParts = splitSlashSeparated(effectiveName);
        if (slashParts.length > 1) {
          for (const part of slashParts) {
            const partType = classifyEntity(part);
            if (partType) addEntity(ctx, part, partType);
          }
          continue;
        }

        // Bullet patterns for entity extraction
        const entityType = classifyEntity(effectiveName);
        if (entityType) {
          addEntity(ctx, effectiveName, entityType);
          continue;
        }

        // Check for patterns like "X模块", "X页", "X按钮" in the source text
        // Module pattern
        const modMatch = effectiveName.match(/([一-鿿\w]{2,10}(?:模块|系统|管理|中心|服务))/);
        if (modMatch) { addEntity(ctx, modMatch[1], "module"); }

        // Page pattern — 支付页面, 支付页, 个人主页, etc.
        const pageMatch = effectiveName.match(/([一-鿿\w]{2,8}(?:页|页面|面|主页|大厅))/);
        if (pageMatch) { addEntity(ctx, pageMatch[1], "page"); }

        // Field patterns
        for (const fp of FIELD_PATTERNS) {
          const re = new RegExp(`([\\u4e00-\\u9fff\\w]{2,12}(?:${fp.source}))`, "g");
          let m;
          while ((m = re.exec(cleanMarkdown(effectiveName))) !== null) {
            if (!isNoise(m[1])) addEntity(ctx, m[1], "field");
          }
        }

        // Action patterns
        for (const ap of ACTION_PATTERNS) {
          const re = new RegExp(`([\\u4e00-\\u9fff\\w]{2,8}(?:${ap.source}))`, "g");
          let m;
          while ((m = re.exec(cleanMarkdown(effectiveName))) !== null) {
            if (!isNoise(m[1])) addEntity(ctx, m[1], "action");
          }
        }

        // Click patterns in source text
        const clickMatch = effectiveName.match(/(?:点击|提交)([一-鿿\w]{2,6}(?:按钮|链接|钮)?)/);
        if (clickMatch) {
          const actionName = clickMatch[1].endsWith("按钮") || clickMatch[1].endsWith("链接") || clickMatch[1].endsWith("钮")
            ? clickMatch[1] : clickMatch[1] + "按钮";
          if (!isNoise(actionName)) addEntity(ctx, actionName, "action");
        }
      }
    }

    tryExtractEdges(ctx, section.content);
  }

  // Phase 3: Fallback for non-markdown text
  if (sections.length === 0) {
    fallbackParse(ctx, text);
  }

  // Phase 4: Auto-create default module if we have pages but no modules
  const hasModules = ctx.entities.some(e => e.type === "module");
  const hasPages = ctx.entities.some(e => e.type === "page");
  if (!hasModules && hasPages) {
    ctx.entities.unshift({ name: "系统功能", type: "module" });
    ctx.currentModule = "系统功能";
    for (const e of ctx.entities) {
      if (e.type === "page" && !e.parentName) e.parentName = "系统功能";
    }
  }

  // Phase 5: Assign orphan fields/actions to current page
  const orphans = ctx.entities.filter(e => (e.type === "field" || e.type === "action") && !e.parentName);
  if (orphans.length > 0 && ctx.currentPage) {
    for (const o of orphans) o.parentName = ctx.currentPage;
  }

  return { entities: ctx.entities, edges: ctx.edges };
}

/** Fallback: phrase-level parser for plain text (no markdown structure) */
function fallbackParse(ctx: ParseContext, text: string): void {
  // Split aggressively into short clean phrases (like the original splitForNames)
  // "/" is used as entity separator in Chinese PRDs: "支付模块 / 支付页面"
  const phrases = text.split(/[，,、。！？\n;；：:]|[和与及以及或]|包含|提供|有|的|\//).filter(s => s.trim());

  let lastModule = ctx.currentModule;
  let lastPage = ctx.currentPage;

  for (const phrase of phrases) {
    const t = phrase.trim();
    if (t.length < 2) continue;

    // Module: standalone X模块/X系统 pattern
    const modMatch = t.match(/^([一-鿿\w]{2,10}(?:模块|系统|管理|中心|服务))/);
    if (modMatch && !isNoise(modMatch[1])) {
      ctx.currentModule = modMatch[1];
      addEntity(ctx, modMatch[1], "module");
      lastModule = modMatch[1];
    }

    // Page: standalone X页/X页面/X主页/X大厅
    const pageMatch = t.match(/^([一-鿿\w]{2,8}(?:页|页面|面|主页|大厅|列表页|详情页))/);
    if (pageMatch && !isNoise(pageMatch[1]) && !/\w{2,6}(?:框|栏|表|按钮)$/.test(pageMatch[1])) {
      ctx.currentPage = pageMatch[1];
      addEntity(ctx, pageMatch[1], "page");
      lastPage = pageMatch[1];
    }

    // Field names: short phrases ending with specific suffixes
    // Use full words not character classes to avoid false matches
    const fieldSuffixes = ["框", "栏", "表格", "列表", "选择器", "输入框", "搜索框", "筛选栏", "选择框", "下拉框"];
    for (const suf of fieldSuffixes) {
      if (t.endsWith(suf) && t.length < 15 && !isNoise(t)) {
        // Skip if this is part of a page name like "列表页"
        if (suf === "列表" && t.length + "页".length <= 8) {
          // Check if "列表页" variant exists - if not, this is probably a field
        }
        addEntity(ctx, t, "field");
        break;
      }
    }

    // Also field: regex-based but with whole-word matching
    const fieldRe = /^([一-鿿\w]{2,12}(?:框|栏|表格|列表|选择器|输入框|搜索框|筛选栏|选择框|下拉框|上传区|区域))$/;
    const fMatch = t.match(fieldRe);
    if (fMatch && !isNoise(fMatch[1])) {
      addEntity(ctx, fMatch[1], "field");
    }

    // Action: standalone X按钮/X链接
    const actionRe = /^([一-鿿\w]{2,8}(?:按钮|链接|钮))$/;
    const aMatch = t.match(actionRe);
    if (aMatch && !isNoise(aMatch[1])) {
      addEntity(ctx, aMatch[1], "action");
    }

    // Detect "点击X" pattern for actions
    const clickMatch = t.match(/(?:点击|提交)([一-鿿\w]{2,6})$/);
    if (clickMatch) {
      let actionName = clickMatch[1];
      if (!actionName.endsWith("按钮") && !actionName.endsWith("链接")) actionName += "按钮";
      if (!isNoise(actionName)) addEntity(ctx, actionName, "action");
    }
  }

  // Extract edges from original text (not phrase-split)
  tryExtractEdges(ctx, text);

  ctx.currentModule = lastModule;
  ctx.currentPage = lastPage;
}

// ============================================================
// END local parser
// ============================================================

const SYSTEM_PROMPT = `You are a system reverse engineering expert. Analyze the following system documentation and extract:
1. All system modules, pages, fields, and actions as entities
2. All business flows and data flows between them as edges

RULES:
- Only extract entities and relationships that are EXPLICITLY described in the text
- Mark extracted relationships with status: "extracted" and include the source_quote
- Only use status: "inferred" for obvious common-sense connections (like "click login" -> "homepage")
- Return valid JSON only

OUTPUT FORMAT (strict JSON):
{
  "entities": [
    { "name": "module name", "type": "module", "parentName": null },
    { "name": "page name", "type": "page", "parentName": "module name" },
    { "name": "field name", "type": "field", "parentName": "page name", "fieldType": "string|number|boolean" },
    { "name": "action name", "type": "action", "parentName": "page name", "actionType": "operation|navigation|validation", "validations": ["condition1", "condition2"] }
  ],
  "edges": [
    { "sourceName": "entity1", "targetName": "entity2", "sourceType": "page", "targetType": "page", "flowType": "BUSINESS_FLOW", "status": "extracted", "label": "submit", "sourceQuote": "exact text from document" }
  ]
}`;
