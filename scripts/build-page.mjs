import { execFileSync } from "node:child_process";
import { build } from "esbuild";

const at = (path) => new URL(path, import.meta.url).pathname;

await build({
  entryPoints: [at("../page/main.tsx")],
  outdir: at("../public"),
  entryNames: "app",
  assetNames: "[name]",
  bundle: true,
  minify: true,
  format: "esm",
  target: "es2022",
  jsx: "automatic",
  loader: { ".woff2": "file" },
  define: { "import.meta.env": '{"SSR":false,"MODE":"production","DEV":false}' },
  logLevel: "warning",
});
execFileSync(
  "npx",
  ["@tailwindcss/cli", "-i", at("../page/app.css"), "-o", at("../public/styles.css"), "--minify"],
  { stdio: ["ignore", "ignore", "inherit"] },
);
console.log("built public/app.js, public/app.css and public/styles.css");
