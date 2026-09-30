// SPDX-License-Identifier: MPL-2.0

import { render } from "./lib/renderer.ts";
import "./globals.css";
import App from "./App.tsx";
import { registerBuiltinWidgets } from "./widgets/builtin/index.ts";

registerBuiltinWidgets();

render(() => <App /> as Node, document.getElementById("root")!);
