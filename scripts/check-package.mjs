import { readFile, readdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? files(path) : [path];
    }),
  );
  return nested.flat();
}

const sources = (await files(resolve(root, "src"))).filter(
  (path) => path.endsWith(".ts") && !path.endsWith(".test.ts"),
);
const newestSource = Math.max(
  ...(await Promise.all(sources.map(async (path) => (await stat(path)).mtimeMs))),
);
const outputs = sources.flatMap((path) => {
  const stem = path.slice(resolve(root, "src").length + 1, -3);
  return [resolve(root, "dist", `${stem}.js`), resolve(root, "dist", `${stem}.d.ts`)];
});
for (const path of outputs) {
  let output;
  try {
    output = await stat(path);
  } catch {
    throw new Error(`Missing package output: ${path}. Run npm run build in core first.`);
  }
  if (output.mtimeMs < newestSource)
    throw new Error(`Stale package output: ${path}. Run npm run build in core first.`);
}
for (const entry of Object.values(manifest.exports)) {
  for (const target of Object.values(entry)) {
    if (!outputs.includes(resolve(root, target)))
      throw new Error(`Export does not match a built module: ${target}`);
  }
}
const unexpected = (await files(resolve(root, "dist"))).filter(
  (path) => (path.endsWith(".js") || path.endsWith(".d.ts")) && !outputs.includes(path),
);
if (unexpected.length)
  throw new Error(`Unexpected package files: ${unexpected.join(", ")}. Clean dist and rebuild.`);
console.log(
  `Package outputs checked: ${outputs.length} files, ${Object.keys(manifest.exports).length} entries.`,
);
