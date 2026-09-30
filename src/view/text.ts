import { createStreamMorph } from "../stream-morph.js";
import type { StreamMorphOptions } from "../types.js";
import type { StreamEvent, StreamRenderer } from "./types.js";

/** Payload accepted by the plain-text renderer; kind is the registry key chosen by your app. */
export interface TextEvent extends StreamEvent {
  /** Append-only text delta. May split inside a word or emoji. */
  delta: string;
}

/**
 * Create a plain-text renderer factory for a response view.
 * @param options - Text word segmentation and motion options, independent of view options.
 * @returns A factory creating a persistent paragraph that accepts TextEvent payloads.
 * @remarks Text is escaped by DOM text nodes. The renderer does not parse Markdown or HTML.
 * Each batch flushes its text stream; destroying the view restores plain text in the paragraph.
 * Invalid delta fields throw TypeError during the view's flush.
 */
export function textRenderer(options: StreamMorphOptions = {}): StreamRenderer {
  return (_id, document) => {
    const element = document.createElement("p");
    const stream = createStreamMorph(element, options);
    return {
      element,
      enter: false,
      update(event) {
        if (typeof event.delta !== "string")
          throw new TypeError("Text events need a delta string.");
        stream.write(event.delta);
      },
      flush: () => stream.flush(),
      destroy: () => stream.destroy(),
    };
  };
}
