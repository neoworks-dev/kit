// SPDX-License-Identifier: MPL-2.0

import { render } from "@nora/solid-xul";
import { PageActionsMenu } from "./page-actions-menu.tsx";
import { Toast } from "./toast.tsx";

export function mountPageActionsMenu(container: Element): void {
  render(() => <PageActionsMenu />, container, { hotCtx: import.meta.hot });
}

export function mountToast(container: Element): void {
  render(() => <Toast />, container, { hotCtx: import.meta.hot });
}
