// SPDX-License-Identifier: MPL-2.0

// Icons a workspace can pick, straight from Phosphor (bold, like the rest of
// Kit's icons).

import { phosphorMask } from "../neoworks-ui/phosphor.ts";
import airplane from "@phosphor-icons/core/bold/airplane-bold.svg?raw";
import barbell from "@phosphor-icons/core/bold/barbell-bold.svg?raw";
import bookOpen from "@phosphor-icons/core/bold/book-open-bold.svg?raw";
import briefcase from "@phosphor-icons/core/bold/briefcase-bold.svg?raw";
import camera from "@phosphor-icons/core/bold/camera-bold.svg?raw";
import chatCircle from "@phosphor-icons/core/bold/chat-circle-bold.svg?raw";
import code from "@phosphor-icons/core/bold/code-bold.svg?raw";
import coffee from "@phosphor-icons/core/bold/coffee-bold.svg?raw";
import currencyDollar from "@phosphor-icons/core/bold/currency-dollar-bold.svg?raw";
import filmSlate from "@phosphor-icons/core/bold/film-slate-bold.svg?raw";
import flask from "@phosphor-icons/core/bold/flask-bold.svg?raw";
import gameController from "@phosphor-icons/core/bold/game-controller-bold.svg?raw";
import gitBranch from "@phosphor-icons/core/bold/git-branch-bold.svg?raw";
import globe from "@phosphor-icons/core/bold/globe-bold.svg?raw";
import graduationCap from "@phosphor-icons/core/bold/graduation-cap-bold.svg?raw";
import heart from "@phosphor-icons/core/bold/heart-bold.svg?raw";
import house from "@phosphor-icons/core/bold/house-bold.svg?raw";
import leaf from "@phosphor-icons/core/bold/leaf-bold.svg?raw";
import lightning from "@phosphor-icons/core/bold/lightning-bold.svg?raw";
import musicNotes from "@phosphor-icons/core/bold/music-notes-bold.svg?raw";
import paintBrush from "@phosphor-icons/core/bold/paint-brush-bold.svg?raw";
import rocket from "@phosphor-icons/core/bold/rocket-bold.svg?raw";
import shoppingCart from "@phosphor-icons/core/bold/shopping-cart-bold.svg?raw";
import star from "@phosphor-icons/core/bold/star-bold.svg?raw";

// Keyed by Phosphor name, the value stored in a workspace's `icon`. Order is
// the picker's order.
const ICONS: Record<string, string> = {
  briefcase,
  house,
  code,
  "book-open": bookOpen,
  "graduation-cap": graduationCap,
  flask,
  "paint-brush": paintBrush,
  camera,
  "film-slate": filmSlate,
  "music-notes": musicNotes,
  "game-controller": gameController,
  "chat-circle": chatCircle,
  "shopping-cart": shoppingCart,
  "currency-dollar": currencyDollar,
  airplane,
  coffee,
  barbell,
  leaf,
  heart,
  rocket,
  globe,
  lightning,
  star,
  // Grove's worktree workspaces (neoworks-grove).
  "git-branch": gitBranch,
};

export const WORKSPACE_ICONS = Object.keys(ICONS);

// CSS mask for a workspace icon; unknown names (e.g. from a newer Kit) fall
// back to the briefcase.
export function workspaceIconMask(icon: string): string {
  return phosphorMask(ICONS[icon] ?? ICONS.briefcase);
}
