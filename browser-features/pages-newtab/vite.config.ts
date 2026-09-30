import path from "node:path";
import process from "node:process";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import solid from "vite-plugin-solid";
import { genJarmnPlugin } from "../../libs/vite-plugin-gen-jarmn/plugin.ts";
import { disableCspInDevPlugin } from "../../libs/vite-plugin-disable-csp/plugin.ts";

export default defineConfig(({ command }) => {
  if (command === "serve") process.env.NODE_ENV = "development";
  return {
    cacheDir: "../../node_modules/.vite/pages-newtab",
    base: "./",
    build: {
      outDir: "_dist",
    },
    plugins: [
      tailwindcss(),
      // See src/lib/renderer.ts for why this isn't Solid's DOM output.
      solid({
        solid: { generate: "universal", moduleName: "@newtab/renderer" },
      }),
      genJarmnPlugin("content-newtab", "noraneko-newtab", "content"),
      disableCspInDevPlugin(command === "serve"),
    ],
    resolve: {
      alias: {
        "@newtab/renderer": path.resolve(
          import.meta.dirname!,
          "src/lib/renderer.ts",
        ),
      },
    },
    server: {
      hmr: {
        overlay: true,
      },
    },
  };
});
