import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// Test the real tarball outside the source repository, with no source aliases.
const root = fileURLToPath(new URL("../", import.meta.url));
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("Run this check with npm run check:install.");
const npmEnvironment = { ...process.env };
for (const key of Object.keys(npmEnvironment)) {
  if (/^npm_config_(?:workspace|workspaces|include_workspace_root|local_prefix)$/i.test(key))
    delete npmEnvironment[key];
}
const consumer = await mkdtemp(join(tmpdir(), "stream-morph-consumer-"));
// Resolve and validate the exact cleanup target before any child process uses it.
if (
  dirname(resolve(consumer)) !== resolve(tmpdir()) ||
  !basename(consumer).startsWith("stream-morph-consumer-")
)
  throw new Error("Unexpected temporary consumer directory; cleanup refused.");
const runNpm = (args, cwd) =>
  execFileSync(process.execPath, [npmCli, "--workspaces=false", ...args], {
    cwd,
    env: npmEnvironment,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });

try {
  const [packed] = JSON.parse(
    runNpm(["pack", "--json", "--ignore-scripts", "--pack-destination", consumer], root),
  );
  for (const { path } of packed.files) {
    if (!/^(?:dist\/.*\.(?:js|d\.ts)|package\.json|README\.md|VIEW\.md|LICENSE)$/.test(path))
      throw new Error(`Unexpected published file: ${path}`);
  }
  await writeFile(
    join(consumer, "package.json"),
    JSON.stringify({ private: true, type: "module" }),
  );
  runNpm(
    [
      "install",
      join(consumer, packed.filename),
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--package-lock=false",
    ],
    consumer,
  );
  await writeFile(
    join(consumer, "imports.mjs"),
    `
import { createStreamMorph } from "stream-morph";
import { createStreamMorph as text } from "stream-morph/text";
import { createStreamLayoutMorph } from "stream-morph/layout";
import { createStreamView } from "stream-morph/view";
import { textRenderer } from "stream-morph/renderers/text";
import { codeRenderer } from "stream-morph/renderers/code";
import { imageRenderer } from "stream-morph/renderers/image";
if (createStreamMorph !== text) throw new Error("Root and text exports disagree.");
for (const value of [text, createStreamLayoutMorph, createStreamView, textRenderer, codeRenderer, imageRenderer]) {
  if (typeof value !== "function") throw new Error("Missing public function export.");
}
`,
  );
  execFileSync(process.execPath, [join(consumer, "imports.mjs")], {
    cwd: consumer,
    stdio: "inherit",
  });
  await writeFile(
    join(consumer, "types.ts"),
    `
import { createStreamMorph, type StreamMorphOptions } from "stream-morph";
import { createStreamLayoutMorph } from "stream-morph/layout";
import { createStreamView, type StreamRenderer } from "stream-morph/view";
import { textRenderer, type TextEvent } from "stream-morph/renderers/text";
import { codeRenderer, type CodeEvent } from "stream-morph/renderers/code";
import { imageRenderer, type ImageEvent } from "stream-morph/renderers/image";
declare const host: HTMLElement;
const options: StreamMorphOptions = { duration: 180, locale: "en" };
const stream = createStreamMorph(host, options);
stream.write("Hello");
// @ts-expect-error Text deltas must be strings.
stream.write(123);
createStreamLayoutMorph(host).update(() => host.append("Hello"));
const renderer: StreamRenderer = textRenderer(options);
const view = createStreamView(host, { renderers: { text: renderer, code: codeRenderer(), image: imageRenderer() } });
const text: TextEvent = { id: "answer", kind: "text", delta: "Hello" };
const code: CodeEvent = { id: "code", kind: "code", delta: "const x = 1;", language: "ts" };
const image: ImageEvent = { id: "image", kind: "image", status: "ready", src: "/image.png", alt: "Coast" };
// @ts-expect-error A ready image needs a URL.
const invalid: ImageEvent = { id: "image", kind: "image", status: "ready" };
view.push(text); view.push(code); view.push(image);
`,
  );
  await writeFile(
    join(consumer, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        lib: ["ES2022", "DOM"],
        types: [],
        strict: true,
        noEmit: true,
      },
      files: ["types.ts"],
    }),
  );
  const require = createRequire(new URL("../package.json", import.meta.url));
  execFileSync(
    process.execPath,
    [require.resolve("typescript/lib/tsc.js"), "-p", join(consumer, "tsconfig.json")],
    { cwd: consumer, stdio: "inherit" },
  );
  console.log(
    "Installed package: all public imports, server import safety and consumer types checked.",
  );
} finally {
  // The immutable cleanup target was checked against tmpdir above.
  await rm(consumer, { recursive: true, force: true });
}
