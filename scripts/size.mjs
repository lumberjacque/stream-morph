import { build } from "esbuild";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const entries = [
  { name: "text", source: 'export * from "stream-morph/text";', budget: 2_500, exclude: ["view/"] },
  {
    name: "named text import from root",
    source: 'export { createStreamMorph } from "stream-morph";',
    budget: 2_500,
    exclude: ["layout-morph.js", "view/"],
  },
  {
    name: "layout",
    source: 'export * from "stream-morph/layout";',
    budget: 1_800,
    exclude: ["view/"],
  },
  {
    name: "view",
    source: 'export * from "stream-morph/view";',
    budget: 2_500,
    exclude: ["view/text.js", "view/code.js", "view/image.js"],
  },
  {
    name: "view with all renderers",
    source: [
      "stream-morph/view",
      "stream-morph/renderers/text",
      "stream-morph/renderers/code",
      "stream-morph/renderers/image",
    ]
      .map((path) => `export * from "${path}";`)
      .join("\n"),
    budget: 5_000,
    exclude: [],
  },
];

for (const entry of entries) {
  const result = await build({
    stdin: {
      contents: entry.source,
      sourcefile: "size-entry.ts",
      resolveDir: fileURLToPath(new URL(".", import.meta.url)),
    },
    bundle: true,
    minify: true,
    platform: "browser",
    format: "esm",
    write: false,
    metafile: true,
  });
  const bytes = gzipSync(result.outputFiles[0].contents).byteLength;
  console.log(`${entry.name}: ${bytes} B gzip (budget ${entry.budget} B)`);
  if (bytes > entry.budget) process.exitCode = 1;
  for (const output of Object.values(result.metafile.outputs)) {
    for (const [path, input] of Object.entries(output.inputs)) {
      if (input.bytesInOutput > 0 && entry.exclude.some((excluded) => path.includes(excluded))) {
        console.error(`Unexpected module in ${entry.name}: ${path}`);
        process.exitCode = 1;
      }
    }
  }
}
