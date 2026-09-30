// SPDX-License-Identifier: MPL-2.0

// The split layout as a tree, independent of tabs and the DOM: inserting,
// removing and resizing panes, and turning the tree into rectangles.

import type {
  DividerRect,
  DropSide,
  PaneRect,
  Rect,
  SplitDirection,
  SplitLayout,
  SplitNode,
} from "./types.ts";

export function pane<T>(item: T): SplitNode<T> {
  return { kind: "pane", item };
}

export function directionOf(side: DropSide): SplitDirection {
  if (side === "left" || side === "right") {
    return "row";
  }
  return "column";
}

function goesBefore(side: DropSide): boolean {
  return side === "left" || side === "top";
}

export function panesOf<T>(node: SplitNode<T>): T[] {
  if (node.kind === "pane") {
    return [node.item];
  }
  return node.children.flatMap(panesOf);
}

// Puts `item` beside `target` on `side`. Joins the target's split when that
// runs the same way, otherwise the target becomes a split of its own. The
// target's share is halved between the two.
export function insertPane<T>(
  root: SplitNode<T>,
  target: T,
  item: T,
  side: DropSide,
): SplitNode<T> {
  const direction = directionOf(side);
  const before = goesBefore(side);

  function visit(node: SplitNode<T>): SplitNode<T> {
    if (node.kind === "pane") {
      if (node.item !== target) {
        return node;
      }
      const children = before ? [pane(item), node] : [node, pane(item)];
      return { kind: "split", direction, children, sizes: [0.5, 0.5] };
    }
    const index = node.children.findIndex(
      (child) => child.kind === "pane" && child.item === target,
    );
    if (index !== -1 && node.direction === direction) {
      const children = [...node.children];
      const sizes = [...node.sizes];
      const half = sizes[index] / 2;
      const at = before ? index : index + 1;
      sizes[index] = half;
      children.splice(at, 0, pane(item));
      sizes.splice(at, 0, half);
      return { ...node, children, sizes };
    }
    return { ...node, children: node.children.map(visit) };
  }

  return visit(root);
}

function nodeAt<T>(root: SplitNode<T>, path: number[]): SplitNode<T> | null {
  let node: SplitNode<T> = root;
  for (const index of path) {
    if (node.kind !== "split" || !node.children[index]) {
      return null;
    }
    node = node.children[index];
  }
  return node;
}

function replaceAt<T>(
  root: SplitNode<T>,
  path: number[],
  replacement: SplitNode<T>,
): SplitNode<T> {
  if (path.length === 0 || root.kind !== "split") {
    return replacement;
  }
  const [index, ...rest] = path;
  const children = [...root.children];
  children[index] = replaceAt(children[index], rest, replacement);
  return { ...root, children };
}

// Adds `item` between children `index` and `index + 1` of the split at
// `path`, taking a third of the two neighbors' space.
export function insertAtDivider<T>(
  root: SplitNode<T>,
  path: number[],
  index: number,
  item: T,
): SplitNode<T> {
  const split = nodeAt(root, path);
  if (!split || split.kind !== "split" || index >= split.children.length - 1) {
    return root;
  }
  const sizes = [...split.sizes];
  const share = (sizes[index] + sizes[index + 1]) / 3;
  sizes[index] *= 2 / 3;
  sizes[index + 1] *= 2 / 3;
  sizes.splice(index + 1, 0, share);
  const children = [...split.children];
  children.splice(index + 1, 0, pane(item));
  return replaceAt(root, path, { ...split, children, sizes });
}

// Drops the pane; its space goes to the remaining siblings in proportion. A
// split left with one child is replaced by that child. Null once nothing is
// left.
export function removePane<T>(root: SplitNode<T>, item: T): SplitNode<T> | null {
  if (root.kind === "pane") {
    return root.item === item ? null : root;
  }
  const children: SplitNode<T>[] = [];
  const sizes: number[] = [];
  root.children.forEach((child, index) => {
    const kept = removePane(child, item);
    if (kept) {
      children.push(kept);
      sizes.push(root.sizes[index]);
    }
  });
  if (children.length === 0) {
    return null;
  }
  if (children.length === 1) {
    return children[0];
  }
  const total = sizes.reduce((sum, size) => sum + size, 0);
  return { ...root, children, sizes: sizes.map((size) => size / total) };
}

// Makes the tree hold exactly `items`: panes that are gone are removed, new
// ones are appended side by side.
export function syncPanes<T>(root: SplitNode<T> | null, items: T[]): SplitNode<T> | null {
  let next = root;
  if (next) {
    for (const item of panesOf(next)) {
      if (!items.includes(item) && next) {
        next = removePane(next, item);
      }
    }
  }
  for (const item of items) {
    if (!next) {
      next = pane(item);
      continue;
    }
    if (panesOf(next).includes(item)) {
      continue;
    }
    const last = panesOf(next).at(-1) as T;
    next = next.kind === "split" && next.direction === "row"
      ? appendToRow(next, item)
      : insertPane(next, last, item, "right");
  }
  return next;
}

function appendToRow<T>(root: SplitNode<T> & { kind: "split" }, item: T): SplitNode<T> {
  const count = root.children.length + 1;
  const sizes = [...root.sizes.map((size) => (size * (count - 1)) / count), 1 / count];
  return { ...root, children: [...root.children, pane(item)], sizes };
}

// Moves the divider by `delta` (a fraction of the split's length), keeping
// both neighbors at least `minimum` long.
export function resizeDivider<T>(
  root: SplitNode<T>,
  path: number[],
  index: number,
  delta: number,
  minimum: number,
): SplitNode<T> {
  const split = nodeAt(root, path);
  if (!split || split.kind !== "split" || index >= split.children.length - 1) {
    return root;
  }
  const sizes = [...split.sizes];
  const pair = sizes[index] + sizes[index + 1];
  const floor = Math.min(minimum, pair / 2);
  const first = Math.min(Math.max(sizes[index] + delta, floor), pair - floor);
  sizes[index] = first;
  sizes[index + 1] = pair - first;
  return replaceAt(root, path, { ...split, sizes });
}

// Rectangles for every pane and divider, with `gap` between siblings.
export function layoutSplit<T>(root: SplitNode<T>, bounds: Rect, gap: number): SplitLayout<T> {
  const panes: PaneRect<T>[] = [];
  const dividers: DividerRect[] = [];

  function visit(node: SplitNode<T>, rect: Rect, path: number[]): void {
    if (node.kind === "pane") {
      panes.push({ item: node.item, rect });
      return;
    }
    const row = node.direction === "row";
    const length = (row ? rect.width : rect.height) - gap * (node.children.length - 1);
    let offset = row ? rect.x : rect.y;
    node.children.forEach((child, index) => {
      const size = length * node.sizes[index];
      const childRect: Rect = row
        ? { x: offset, y: rect.y, width: size, height: rect.height }
        : { x: rect.x, y: offset, width: rect.width, height: size };
      visit(child, childRect, [...path, index]);
      offset += size;
      if (index < node.children.length - 1) {
        dividers.push({
          path,
          index,
          direction: node.direction,
          splitLength: length,
          rect: row
            ? { x: offset, y: rect.y, width: gap, height: rect.height }
            : { x: rect.x, y: offset, width: rect.width, height: gap },
        });
        offset += gap;
      }
    });
  }

  visit(root, bounds, []);
  return { panes, dividers };
}

// Which edge of `rect` the point is nearest to, relative to its size.
export function nearestSide(rect: Rect, x: number, y: number): DropSide {
  const left = (x - rect.x) / rect.width;
  const top = (y - rect.y) / rect.height;
  const distances: [DropSide, number][] = [
    ["left", left],
    ["right", 1 - left],
    ["top", top],
    ["bottom", 1 - top],
  ];
  distances.sort((a, b) => a[1] - b[1]);
  return distances[0][0];
}

// The half of `rect` a drop on `side` would take.
export function sideRect(rect: Rect, side: DropSide): Rect {
  switch (side) {
    case "left":
      return { ...rect, width: rect.width / 2 };
    case "right":
      return { ...rect, x: rect.x + rect.width / 2, width: rect.width / 2 };
    case "top":
      return { ...rect, height: rect.height / 2 };
    case "bottom":
      return { ...rect, y: rect.y + rect.height / 2, height: rect.height / 2 };
  }
}
