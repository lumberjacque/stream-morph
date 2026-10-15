# Stream Morph

[![npm version](https://img.shields.io/npm/v/stream-morph.svg)](https://www.npmjs.com/package/stream-morph)
[![Core CI](https://github.com/lumberjacque/stream-morph/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/lumberjacque/stream-morph/actions/workflows/ci.yml)
[![MIT license](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/lumberjacque/stream-morph/blob/main/LICENSE)

Framework-independent animation for streaming text and growing responses. Append
content without replacing the whole answer: existing words and blocks keep their
DOM identity as new chunks arrive.

[Live demo](https://stream-morph.vercel.app) · [npm](https://www.npmjs.com/package/stream-morph) · [API](#api-reference) · [Response view guide](https://github.com/lumberjacque/stream-morph/blob/main/VIEW.md) · [Releases](https://github.com/lumberjacque/stream-morph/releases) · [Issues](https://github.com/lumberjacque/stream-morph/issues)

- No runtime dependencies. ESM with TypeScript declarations.
- Frame-batched text and response events; synchronous integration for your own renderer.
- Native Web Animations, bounded measurements and reduced-motion support.
- Separate imports for text, layout, views and optional renderers.

## Install

```sh
npm install stream-morph
```

No stylesheet or framework adapter is required. Create instances after the host
element mounts and call `destroy()` when its owning component unmounts.

## Stream plain text

```html
<p id="answer"></p>
```

```ts
import { createStreamMorph } from "stream-morph/text";

const host = document.querySelector<HTMLElement>("#answer");
if (!host) throw new Error("Missing answer element");
const stream = createStreamMorph(host, { locale: "en" });

stream.write("A growing ");
stream.write("response.");
stream.finish();

// In your component's cleanup: stream.destroy();
```

Call `write()` for each decoded chunk from your provider, then `finish()` when
the provider completes. Chunks can split inside a word or emoji. `write()` appends text and batches DOM
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
See the [response view guide](https://github.com/lumberjacque/stream-morph/blob/main/VIEW.md) for custom blocks and error handling.

## Animate an existing renderer

```ts
import { createStreamLayoutMorph } from "stream-morph/layout";

const host = document.querySelector<HTMLElement>("#rendered-answer");
if (!host) throw new Error("Missing rendered answer element");
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

## API reference

### Imports

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

### Controllers

| Controller                                | Methods and properties                                 | Cleanup                                                                         |
| ----------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `createStreamMorph(host, options?)`       | `write(delta)`, `flush()`, `finish()`, readonly `text` | `destroy()` restores the complete logical text, including queued chunks.        |
| `createStreamLayoutMorph(root, options?)` | `update(mutate)` for synchronous DOM changes           | `destroy()` stops motion and preserves the renderer's DOM.                      |
| `createStreamView(host, options)`         | `push(event)`, `flush()`                               | `destroy()` discards queued events, releases renderers and keeps committed DOM. |

Destruction is idempotent. Other operations on a destroyed controller throw.
`finish()` closes a text stream to further writes; flushing an empty queue is safe.
Public declarations include TSDoc for defaults, validation, ownership and cleanup.

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

## Performance and scope

The consumer bundles below are minified ESM compressed with gzip. They exclude
TypeScript declarations, tests and the private demo website. No runtime package
dependencies or CSS downloads are required.

| Import                                         | Measured gzip | Enforced budget |
| ---------------------------------------------- | ------------: | --------------: |
| `stream-morph/text`                            |       2.07 kB |         2.50 kB |
| Named `createStreamMorph` import from the root |       2.07 kB |         2.50 kB |
| `stream-morph/layout`                          |       1.24 kB |         1.80 kB |
| `stream-morph/view` without renderers          |       1.72 kB |         2.50 kB |
| View with all three built-in renderers         |       4.07 kB |         5.00 kB |

Reproduce exact byte counts with `npm run build` followed by `npm run size`.
The check also rejects optional modules that accidentally enter a smaller import.
These are download measurements, not FPS claims.

The common last-block view update avoids top-level layout reads and a scan of all
blocks. Text and layout snapshots visit only the recent measurement window,
without copying the full collection first. Disabling movement skips position
reads; disabling both durations also skips key queries and snapshots.

Measurement limits bound animation work, not document size. Long text still
accumulates word nodes; layout queries still traverse keyed descendants. Old
content is not virtualized.

Container height transitions, custom CSS entrances, Markdown parsing, syntax
highlighting and conversation controls belong to your integration. The separate
showcase includes examples of these; they are not bundled into this package.
There is no built-in HTTP client or framework dependency.

## Browser support and accessibility

Imports are SSR-safe; controller creation needs a browser document. Use a modern
browser with `requestAnimationFrame`, `matchMedia` and the Web Animations API,
including CSS `translate` and additive composition. Plain-text segmentation also
requires `Intl.Segmenter`. Polyfills are not included. The package is ESM-only.

Live changes to `prefers-reduced-motion` stop active animations. Content remains
readable when motion is disabled. Focus management and live-region announcements
belong to the application; the library does not add `aria-live` or move focus.

## Development

Use Node.js 22.12 or newer for development.

```sh
npm ci
npm run verify
```

Verification runs lint, formatting checks, types, tests, the build, bundle budgets,
package-output checks, and a tarball consumer check of exports and declarations.
`npm run build` creates `dist/`. `prepack` rejects missing, stale or unexpected
outputs; `prepublishOnly` runs verification before a manual publish.

Only built JavaScript, declarations, this README, the view guide and the MIT
license enter the npm tarball. The Astro website, editor, source tests and GitHub
workflows are separate from the published package.

## Contributing and releases

See [CONTRIBUTING.md](https://github.com/lumberjacque/stream-morph/blob/main/CONTRIBUTING.md) for development conventions.
Report reproducible bugs in [GitHub Issues](https://github.com/lumberjacque/stream-morph/issues).
Version history and release notes live in [GitHub Releases](https://github.com/lumberjacque/stream-morph/releases).

## License

MIT. See [LICENSE](https://github.com/lumberjacque/stream-morph/blob/main/LICENSE).
