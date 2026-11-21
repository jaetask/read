import { execFileSync } from "node:child_process";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const at = (path) => fileURLToPath(new URL(path, import.meta.url));

await build({
  entryPoints: { app: at("../page/main.tsx"), fonts: at("../page/fonts.css") },
  outdir: at("../public"),
  assetNames: "[name]",
  bundle: true,
  splitting: true,
  chunkNames: "chunk-[hash]",
  minify: true,
  format: "esm",
  target: "es2022",
  jsx: "automatic",
  loader: { ".woff2": "file" },
  define: { "import.meta.env": '{"SSR":false,"MODE":"production","DEV":false}' },
  logLevel: "warning",
});
execFileSync(
  at("../node_modules/.bin/tailwindcss"),
  ["-i", at("../page/app.css"), "-o", at("../public/app.css"), "--minify"],
  { stdio: ["ignore", "ignore", "inherit"] },
);
copyFileSync(at("../page/capture-worklet.js"), at("../public/capture-worklet.js"));
const stamp = Date.now().toString(36);
writeFileSync(
  at("../public/index.html"),
  readFileSync(at("../page/index.html"), "utf8").replace(
    /(app\.js|fonts\.css|app\.css)"/g,
    `$1?v=${stamp}"`,
  ),
);
console.log("built public/app.js, public/fonts.css and public/app.css");
