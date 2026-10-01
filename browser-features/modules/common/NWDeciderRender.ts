// SPDX-License-Identifier: MPL-2.0

// Request -> NeoMME tokens, with a <mask> marker before every option of every
// question (#54). A port of neomme-browser-finetune model/render.py and the
// token layout of model/image.py; golden.jsonl from scripts/export_onnx.py
// checks it token for token.
//
//   <doc> [<img> (<img>*W <row>)*H] goal: ...
//   <query> operation | instructions   <mask> CLICK: ...   <mask> DONE: ...
//   <query> click_target | ...         <mask> [3] Search (button) ...
//   \nstate:\n url / title / recent actions / page text   (cut from the tail)

import type { DeciderRequest, HistoryEntry } from "./NWDeciderRequest.ts";

export interface RenderConfig {
  maxLen: number;
  maxOptionTokens: number;
  minOptionTokens: number;
  minStateTokens: number;
}

export const DEFAULT_RENDER: RenderConfig = {
  maxLen: 8192,
  maxOptionTokens: 48,
  minOptionTokens: 6,
  minStateTokens: 256,
};

export interface SpecialTokens {
  doc: number;
  query: number;
  mask: number;
  image: number;
  row: number;
  // Every special token's text, e.g. "<mask>", escaped in page text.
  texts: string[];
}

export interface Rendered {
  inputIds: number[];
  // In question order: option ids and their marker positions.
  questions: { id: string; ids: string[]; positions: number[] }[];
  truncated: number;
}

// Tokenizes each text separately, without special tokens.
export type EncodeTexts = (texts: string[]) => number[][];

// Python's repr() of a string, as render.py writes current values.
export function pyRepr(value: string): string {
  const quote = value.includes("'") && !value.includes('"') ? '"' : "'";
  let out = quote;
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (character === "\\") {
      out += "\\\\";
    } else if (character === quote) {
      out += "\\" + quote;
    } else if (character === "\n") {
      out += "\\n";
    } else if (character === "\r") {
      out += "\\r";
    } else if (character === "\t") {
      out += "\\t";
    } else if (code < 0x20 || code === 0x7f) {
      out += "\\x" + code.toString(16).padStart(2, "0");
    } else if (code >= 0x80 && code < 0xa0) {
      out += "\\x" + code.toString(16).padStart(2, "0");
    } else {
      out += character;
    }
  }
  return out + quote;
}

// Python str() of a scalar inside an f-string.
function pyStr(value: unknown): string {
  if (value === null || value === undefined) {
    return "None";
  }
  if (value === true) {
    return "True";
  }
  if (value === false) {
    return "False";
  }
  return String(value);
}

// json.dumps of a scalar.
function jsonScalar(value: number | boolean): string {
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return Number.isInteger(value) ? String(value) : JSON.stringify(value);
}

// render.py _text: compact rendering of JSON-ish values.
export function text(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return jsonScalar(value);
  }
  if (Array.isArray(value)) {
    return value.map(text).join("\n");
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) =>
        typeof item === "object" && item !== null ? `${key}:\n${text(item)}` : `${key}: ${text(item)}`
      )
      .join("\n");
  }
  return String(value);
}

// json.dumps(value, ensure_ascii=False, separators=(", ", ": ")).
function pyJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(pyJson).join(", ")}]`;
  }
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value).map(([key, item]) => `${JSON.stringify(key)}: ${pyJson(item)}`).join(", ")}}`;
  }
  return JSON.stringify(value ?? null);
}

export function renderOption(key: string, description: unknown): string {
  if (typeof description === "object" && description !== null && !Array.isArray(description) && "element" in description) {
    const desc = description as Record<string, unknown>;
    let out = String(desc.element);
    if (desc.role) {
      out += ` (${pyStr(desc.role)})`;
    }
    const current = desc.current_value;
    if (current !== null && current !== undefined && current !== "") {
      out += ` = ${typeof current === "string" ? pyRepr(current) : pyStr(current)}`;
    }
    for (const name of ["checked", "selected", "expanded"]) {
      if (name in desc && desc[name] !== null && desc[name] !== undefined && desc[name] !== "") {
        out += ` ${name}=${pyStr(desc[name])}`;
      }
    }
    return out;
  }
  if (description === null || description === undefined || description === "") {
    return key;
  }
  if (typeof description === "object" && !Array.isArray(description)) {
    return `${key}: ${pyJson(description)}`;
  }
  return `${key}: ${text(description)}`;
}

function renderBrowserState(state: DeciderRequest["state"]): string {
  const page = state.page ?? { url: "", title: "", text: "" };
  const parts = [`url: ${page.url ?? ""}`, `title: ${page.title ?? ""}`];
  const history: HistoryEntry[] = state.recent_actions ?? [];
  if (history.length > 0) {
    const lines = history.map((entry) => {
      let line = `- ${pyStr(entry.kind)}: ${pyStr(entry.action)}`;
      if (entry.text) {
        line += ` text=${pyRepr(entry.text)}`;
      }
      if (entry.page_changed !== null && entry.page_changed !== undefined) {
        line += entry.page_changed ? " (page changed)" : " (no page change)";
      }
      return line;
    });
    parts.push("recent actions:\n" + lines.join("\n"));
  } else {
    parts.push("recent actions: none");
  }
  parts.push("page text:\n" + (page.text || ""));
  return parts.join("\n");
}

interface Block {
  id: string;
  header: string;
  options: [string, string][];
}

function segments(request: DeciderRequest): { goal: string | null; blocks: Block[]; state: string } {
  const questions = request.questions;
  let goal: string | null = null;
  for (const question of Object.values(questions)) {
    const instructions = question.instructions;
    if (instructions && typeof instructions === "object" && typeof instructions.goal === "string") {
      goal = instructions.goal;
      break;
    }
  }
  const seen = new Set<string>();
  const blocks: Block[] = [];
  for (const [id, question] of Object.entries(questions)) {
    const instructions: unknown = question.instructions;
    const items: [string | null, unknown][] = instructions && typeof instructions === "object" && !Array.isArray(instructions)
      ? Object.entries(instructions as Record<string, unknown>)
      : [[null, instructions]];
    const lines: string[] = [];
    for (const [key, value] of items) {
      if (key === "goal" && value === goal) {
        continue;
      }
      for (const piece of Array.isArray(value) ? value : [value]) {
        const line = text(piece);
        if (!line || seen.has(line)) {
          continue;
        }
        seen.add(line);
        lines.push(key && key !== "rules" ? `${key}: ${line}` : line);
      }
    }
    const header = id + (lines.length > 0 ? "\n" + lines.join("\n") : "");
    const options = Object.entries(question.criteria).map(([key, desc]): [string, string] => [key, renderOption(key, desc)]);
    blocks.push({ id, header, options });
  }
  return { goal, blocks, state: renderBrowserState(request.state) };
}

// Literal special-token strings in text must never become real markers.
function clean(value: string, specials: string[]): string {
  let out = value;
  for (const token of specials) {
    if (out.includes(token)) {
      out = out.replaceAll(token, token[0] + " " + token.slice(1));
    }
  }
  return out;
}

export function imageLayout(grid: [number, number], special: SpecialTokens): number[] {
  const [height, width] = grid;
  const row = [...new Array<number>(width).fill(special.image), special.row];
  const out = [special.image];
  for (let i = 0; i < height; i++) {
    out.push(...row);
  }
  return out;
}

// (2, n) positions: <doc>, <img> = 0, 1; grid token (r, c) = (2 + r, 2 + c);
// text continues on both axes from 2 + max(H, W + 1).
export function positionIds(tokens: number, grid: [number, number]): [number[], number[]] {
  const [height, width] = grid;
  const rows = [0, 1];
  const columns = [0, 1];
  for (let r = 0; r < height; r++) {
    for (let c = 0; c <= width; c++) {
      rows.push(2 + r);
      columns.push(2 + c);
    }
  }
  // <doc> + <img> + grid; rows.length counts <doc> and the start <img>.
  const start = 2 + Math.max(height, width + 1);
  for (let i = 0; rows.length < tokens; i++) {
    rows.push(start + i);
    columns.push(start + i);
  }
  return [rows, columns];
}

export function render(
  request: DeciderRequest,
  grid: [number, number],
  encode: EncodeTexts,
  special: SpecialTokens,
  config: RenderConfig = DEFAULT_RENDER,
): Rendered {
  const { goal, blocks, state } = segments(request);
  const texts = [goal ? "goal: " + goal : ""];
  texts.push(...blocks.map((block) => block.header));
  texts.push(...blocks.flatMap((block) => block.options.map(([, option]) => option)));
  texts.push("\nstate:\n" + state);
  const encoded = encode(texts.map((value) => clean(value, special.texts)));
  const goalIds = goal ? encoded[0] : [];
  const headerIds = encoded.slice(1, 1 + blocks.length);
  const optionCount = blocks.reduce((sum, block) => sum + block.options.length, 0);
  const optionIds = encoded.slice(1 + blocks.length, 1 + blocks.length + optionCount);
  const stateIds = encoded[1 + blocks.length + optionCount];
  const imageIds = imageLayout(grid, special);

  const assemble = (cap: number): { ids: number[]; questions: Rendered["questions"] } => {
    const ids = [special.doc, ...imageIds, ...goalIds];
    const questions: Rendered["questions"] = [];
    let j = 0;
    blocks.forEach((block, b) => {
      ids.push(special.query, ...headerIds[b]);
      const question = { id: block.id, ids: [] as string[], positions: [] as number[] };
      for (const [key] of block.options) {
        question.ids.push(key);
        question.positions.push(ids.length);
        ids.push(special.mask, ...optionIds[j].slice(0, cap));
        j++;
      }
      questions.push(question);
    });
    return { ids, questions };
  };

  let cap = config.maxOptionTokens;
  let assembled = assemble(cap);
  while (assembled.ids.length > config.maxLen - config.minStateTokens && cap > config.minOptionTokens) {
    cap = Math.max(config.minOptionTokens, Math.floor(cap * 3 / 4));
    assembled = assemble(cap);
  }
  if (assembled.ids.length > config.maxLen) {
    throw new Error(`${optionCount} options don't fit in ${config.maxLen} tokens`);
  }
  const room = config.maxLen - assembled.ids.length;
  return {
    inputIds: [...assembled.ids, ...stateIds.slice(0, room)],
    questions: assembled.questions,
    truncated: Math.max(0, stateIds.length - room),
  };
}
