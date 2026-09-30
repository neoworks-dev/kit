// SPDX-License-Identifier: MPL-2.0

import { render } from "./lib/renderer.ts";
import "./globals.css";
import App from "./App.tsx";
import { followTheme } from "./lib/theme.ts";
import { registerBuiltinWidgets } from "./widgets/builtin/index.ts";

registerBuiltinWidgets();
followTheme();

render(() => <App /> as Node, document.getElementById("root")!);
