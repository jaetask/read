import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRead } from "./app.js";

const env = process.env;
const dataDir = env.DATA_DIR ?? "data";
const filesDir = env.READ_FILES_DIR ?? join(dataDir, "files");
mkdirSync(filesDir, { recursive: true });

const app = await createRead({
  dataDir,
  filesDir,
  connect: (env.KIT_CONNECT ?? "").split(",").filter(Boolean),
  page: fileURLToPath(new URL("../public", import.meta.url)),
});

const url = await app.listen(Number(env.PORT ?? 3940), env.HOST ?? "127.0.0.1");
console.log(`Read runs at ${url}, reading files in ${filesDir}. Agents connect to ${url}/mcp.`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}
