# Stream Morph

Small, framework-independent motion for browser responses that arrive in chunks.
Existing text and blocks keep their DOM identity as content grows. New content
appears without replacing the whole answer on every delta.

- No runtime dependencies. ESM with TypeScript declarations.
- Frame-batched text and response events; synchronous integration for your own renderer.
- Native Web Animations, bounded measurements and reduced-motion support.
- Separate imports for text, layout, views and optional renderers.

## Install

```sh
npm install stream-morph
```

Create instances in a browser after your host element mounts. Importing the
package on the server is safe. The browser needs `requestAnimationFrame`,
`matchMedia`, the Web Animations API with CSS `translate`, and `Intl.Segmenter`
for text. Polyfills are not included.

## Stream plain text

```ts
import { createStreamMorph } from "stream-morph/text";

const host = document.querySelector<HTMLElement>("#answer");
if (!host) throw new Error("Missing answer element");
const stream = createStreamMorph(host, { locale: "en" });

// textChunks is your provider adapter's async iterable of strings.
for await (const delta of textChunks) {
  stream.write(delta);
}
stream.finish();

// In your component's cleanup: stream.destroy();
```

Chunks can split inside a word or emoji. `write()` appends text and batches DOM
work into the next frame. `text` includes queued deltas. `flush()` commits now;
`finish()` flushes and rejects later writes. `destroy()` cancels work, releases
listeners and restores the full answer as a plain text node, including queued
text. It is safe to call more than once.

The host starts with plain text only. The stream owns its child nodes until
destroyed. A provider's transport, SSE parsing, cancellation and errors belong to
your app; stopping the animation does not cancel a network request.

## Build a response from events

```ts
import { createStreamView } from "stream-morph/view";
import { textRenderer, type TextEvent } from "stream-morph/renderers/text";
import { codeRenderer } from "stream-morph/renderers/code";
import { imageRenderer, type ImageEvent } from "stream-morph/renderers/image";

const host = document.querySelector<HTMLElement>("#response");
if (!host) throw new Error("Missing response element");
const view = createStreamView(host, {
  renderers: {
    text: textRenderer(),
    code: codeRenderer(),
    image: imageRenderer(),
  },
});

const delta = {
  id: "answer",
  kind: "text",
  delta: "Try this example.",
} satisfies TextEvent;
view.push(delta);
view.push({ id: "example", kind: "code", language: "ts", delta: "const n = 1;\n" });
view.push({ id: "art", kind: "image", status: "loading", ratio: 16 / 9 });
const image = {
  id: "art",
  kind: "image",
  status: "ready",
  src: "/images/coast.png",
  alt: "A coastal horizon",
} satisfies ImageEvent;
view.push(image);

// In your component's cleanup: view.destroy();
```

The host starts empty. Reuse an ID to update the same block; its `kind` cannot
change. Blocks append in the order their IDs first appear. `push()` queues events;
`flush()` commits them immediately. `destroy()` discards pending events and
releases renderers while keeping committed DOM.

The text renderer is plain text. Code preserves newlines without a syntax
highlighter. Images reserve an aspect ratio and fade after loading. Markdown,
reasoning, charts, permission requests and tool cards can use your own renderer.
See [the view guide](./VIEW.md) for custom blocks and error handling.

## Animate an existing renderer

```ts
import { createStreamLayoutMorph } from "stream-morph/layout";

const morph = createStreamLayoutMorph(host);
const block = host.ownerDocument.createElement("p");
block.dataset.streamMorphKey = "answer";

morph.update(() => host.append(block));
morph.update(() => block.append("A new chunk."));

// In your component's cleanup: morph.destroy();
```

Keep persistent elements and unique `data-stream-morph-key` values stable. Apply
your DOM update synchronously inside `update()`. The renderer owns parsing,
escaping and element identity. The controller measures keyed positions and
animates movement and entrances; it does not replace your renderer's DOM.

## Imports

| Import                         | Exports                                                                                               |
| ------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `stream-morph`                 | `createStreamMorph`, `createStreamLayoutMorph`, their types                                           |
| `stream-morph/text`            | `createStreamMorph`, `StreamMorph`, `StreamMorphOptions`                                              |
| `stream-morph/layout`          | `createStreamLayoutMorph`, `StreamLayoutMorph`, `StreamMorphOptions`                                  |
| `stream-morph/view`            | `createStreamView`, `StreamView`, `StreamViewOptions`, `StreamEvent`, `StreamBlock`, `StreamRenderer` |
| `stream-morph/renderers/text`  | `textRenderer`, `TextEvent`                                                                           |
| `stream-morph/renderers/code`  | `codeRenderer`, `CodeEvent`                                                                           |
| `stream-morph/renderers/image` | `imageRenderer`, `ImageEvent`                                                                         |

`/view` imports no renderers. The package declares `sideEffects: false`, so ESM
bundlers can remove unused exports. Event types help check built-in payloads with
`satisfies`; the extensible `StreamEvent` envelope leaves custom fields as
`unknown`. Validate external data at your app's boundary.

## Motion options

| Option                | Default         | Meaning                                                     |
| --------------------- | --------------- | ----------------------------------------------------------- |
| `duration`            | 180 ms          | Movement duration for text, layout or top-level view blocks |
| `enterDuration`       | 120 ms          | Entrance duration for text, layout or top-level view blocks |
| `maxAnimatedElements` | 160             | Recent keyed elements measured by text/layout               |
| `maxAnimatedBlocks`   | 48              | Recent top-level blocks measured or entered by a view       |
| `locale`              | Browser default | Word segmentation for text                                  |

Durations must be finite and non-negative; measurement limits must be positive
safe integers. Zero durations disable that motion. View options do not override
motion inside renderers: pass text options to `textRenderer()` separately.
`prefers-reduced-motion: reduce` automatically disables motion.

## Scope and performance

The common last-block view update avoids top-level layout reads and a scan of all
blocks. Measurement limits bound animation work, not document size. Long text
still accumulates word nodes; layout queries still traverse keyed descendants.
Old content is not virtualized.

Container height transitions, custom CSS entrances, Markdown parsing, syntax
highlighting and conversation controls belong to your integration. The separate
showcase includes examples of these; they are not bundled into this package.
There is no built-in HTTP client or framework dependency.

## Development

This directory can be used as its own repository. Use Node 22.12+ for development.

```sh
npm install
npm run verify
```

Verification runs lint, formatting checks, types, tests, the build, bundle budgets,
package-output checks, and a tarball consumer check of exports and declarations.
`npm run build` creates `dist/`. `prepack` rejects missing, stale or unexpected
outputs; `prepublishOnly` runs verification before a manual publish.

Only built JavaScript, declarations, this README, the view guide and the MIT
license enter the npm tarball. The Astro website, editor, source tests and GitHub
workflows are separate from the published package.

## License

MIT. See [LICENSE](./LICENSE).
