# Response view

The `stream-morph/view` entry in the single `stream-morph` ESM package
batches events and animates block movement. Import only the renderers you need.
Plain-text and layout entries work independently of the event layer.

```ts
import { createStreamView } from "stream-morph/view";
import { textRenderer } from "stream-morph/renderers/text";
import { codeRenderer } from "stream-morph/renderers/code";
import { imageRenderer } from "stream-morph/renderers/image";

const stream = createStreamView(document.querySelector("#response")!, {
  renderers: {
    text: textRenderer(),
    code: codeRenderer(),
    image: imageRenderer(),
  },
});

stream.push({ id: "answer", kind: "text", delta: "An answer in arbitrary chunks" });
stream.push({ id: "example", kind: "code", language: "ts", delta: "const n = 1;\n" });
stream.push({ id: "art", kind: "image", status: "loading", ratio: 16 / 9 });
stream.push({ id: "art", kind: "image", status: "ready", src: "/art.png", alt: "Artwork" });
```

The host starts empty. IDs must be stable and keep the same kind. Events are
committed once per animation frame, in order. `flush()` commits immediately;
`destroy()` cancels work and leaves the rendered content in place.

The built-in text renderer handles plain text only. Code preserves newlines and
does not include syntax highlighting. Images use a reserved aspect ratio and fade
in when loaded. Markdown, tool cards, charts, and custom media need a renderer
supplied under another `kind`:

```ts
const customRenderer = (_id: string, document: Document) => {
  const element = document.createElement("div");
  return {
    element,
    update(event: { label?: unknown }) {
      element.textContent = String(event.label ?? "");
    },
  };
};
```

The event layer measures only top-level blocks and skips that work when the last
block grows. It measures and animates entrances for at most 48 recent top-level
blocks by default. Last-block lookup does not scan the whole response. The text renderer
uses the core's own word-node limit for measurement; long responses still grow
word nodes, so a plain-text fallback for old content remains future work.
All movement respects `prefers-reduced-motion`.

Renderer payload validation runs when the queued batch is committed. To catch a
renderer error synchronously, call `flush()` in your own `try`/`catch`. An error
does not roll back DOM changes from earlier events in that batch. Validate data
from your provider before pushing it; a renderer must not return an element that
already has a parent, even if that parent is not connected to the document.

The view animates block positions, not container height or arbitrary changes
inside custom blocks. A renderer owns those transitions. The website's measured
height transitions and Markdown reveal presets are separate integration code.
