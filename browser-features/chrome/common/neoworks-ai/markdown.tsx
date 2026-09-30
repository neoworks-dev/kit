// SPDX-License-Identifier: MPL-2.0

// Just enough Markdown for chat answers: paragraphs, headings, lists, fenced
// code, inline code, bold and links. Built as nodes, never as HTML, so model
// output can't inject markup into the browser chrome.

import { For, Match, Switch, type JSX } from "solid-js";
import type { MarkdownBlock, MarkdownInline } from "./types.ts";

const FENCE = /^```/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/;
const ORDERED_ITEM = /^\s*\d+[.)]\s+/;
const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/;

export function parseBlocks(text: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = text.split("\n");
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (FENCE.test(line)) {
      const code: string[] = [];
      index++;
      while (index < lines.length && !FENCE.test(lines[index])) {
        code.push(lines[index]);
        index++;
      }
      index++;
      blocks.push({ kind: "code", text: code.join("\n") });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ kind: "heading", text: heading[2] });
      index++;
      continue;
    }
    if (LIST_ITEM.test(line)) {
      const ordered = ORDERED_ITEM.test(line);
      const items: string[] = [];
      while (index < lines.length && LIST_ITEM.test(lines[index])) {
        items.push(LIST_ITEM.exec(lines[index])?.[1] ?? "");
        index++;
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }
    if (line.trim() === "") {
      index++;
      continue;
    }
    const paragraph: string[] = [];
    while (
      index < lines.length && lines[index].trim() !== "" && !FENCE.test(lines[index]) &&
      !HEADING.test(lines[index]) && !LIST_ITEM.test(lines[index])
    ) {
      paragraph.push(lines[index]);
      index++;
    }
    blocks.push({ kind: "paragraph", text: paragraph.join("\n") });
  }
  return blocks;
}

export function parseInline(text: string): MarkdownInline[] {
  return text.split(INLINE).filter((part) => part !== "").map((part): MarkdownInline => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return { kind: "code", text: part.slice(1, -1) };
    }
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return { kind: "bold", text: part.slice(2, -2) };
    }
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (link && /^https?:\/\//.test(link[2])) {
      return { kind: "link", text: link[1], url: link[2] };
    }
    return { kind: "text", text: part };
  });
}

const browserWindow = window as unknown as {
  openTrustedLinkIn(url: string, where: string): void;
};

function openLink(event: MouseEvent, url: string): void {
  event.preventDefault();
  browserWindow.openTrustedLinkIn(url, "tab");
}

function Inline(props: { text: string }): JSX.Element {
  return (
    <For each={parseInline(props.text)}>
      {(part) => (
        <Switch fallback={<>{part.text}</>}>
          <Match when={part.kind === "code"}>
            <code>{part.text}</code>
          </Match>
          <Match when={part.kind === "bold"}>
            <strong>{part.text}</strong>
          </Match>
          <Match when={part.kind === "link" && part}>
            {(link) => (
              <a
                href={link().url}
                title={link().url}
                onClick={(event: MouseEvent) => openLink(event, link().url)}
              >
                {link().text}
              </a>
            )}
          </Match>
        </Switch>
      )}
    </For>
  );
}

function Block(props: { block: MarkdownBlock }): JSX.Element {
  const block = props.block;
  switch (block.kind) {
    case "code":
      return <pre><code>{block.text}</code></pre>;
    case "heading":
      return <p class="nw-ai-heading"><Inline text={block.text} /></p>;
    case "list": {
      const items = <For each={block.items}>{(item) => <li><Inline text={item} /></li>}</For>;
      return block.ordered ? <ol>{items}</ol> : <ul>{items}</ul>;
    }
    case "paragraph":
      return <p><Inline text={block.text} /></p>;
  }
}

export function Markdown(props: { text: string }): JSX.Element {
  return <For each={parseBlocks(props.text)}>{(block) => <Block block={block} />}</For>;
}
