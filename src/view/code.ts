import type { StreamEvent, StreamRenderer } from "./types.js";

/** Payload accepted by the code renderer; kind is your registered renderer key. */
export interface CodeEvent extends StreamEvent {
  /** Code to append, including literal newlines. */
  delta: string;
  /** Optional language metadata stored on the pre element; does not enable highlighting. */
  language?: string;
}

const ENTER_EASING = "cubic-bezier(0.23, 1, 0.32, 1)";

/**
 * Create a renderer for incremental, escaped code inside a pre/code element.
 * @returns A factory accepting CodeEvent payloads with a string delta and optional language.
 * @remarks Preserves newlines and existing line nodes; includes no syntax highlighter.
 * Up to eight new line spans fade per batch, unless reduced motion is requested.
 * Invalid delta or language fields throw TypeError during the view's flush.
 */
export function codeRenderer(): StreamRenderer {
  return (_id, document) => {
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    pre.append(code);
    const view = document.defaultView;
    if (!view) throw new Error("Code renderer needs a browser document.");
    const media = view.matchMedia("(prefers-reduced-motion: reduce)");
    const animations = new Set<Animation>();
    const entering: HTMLElement[] = [];
    let line = document.createElement("span");
    let content = document.createTextNode("");
    line.append(content);
    code.append(line);
    const stop = (): void => {
      for (const animation of animations) animation.cancel();
      animations.clear();
    };
    const onMotionChange = (): void => {
      if (media.matches) stop();
    };
    media.addEventListener("change", onMotionChange);
    return {
      element: pre,
      update(event) {
        if (typeof event.delta !== "string")
          throw new TypeError("Code events need a delta string.");
        if (event.language !== undefined) {
          if (typeof event.language !== "string")
            throw new TypeError("Code language must be a string.");
          pre.dataset.language = event.language;
        }
        const parts = event.delta.split("\n");
        for (let index = 0; index < parts.length; index += 1) {
          if (index) {
            code.append(document.createTextNode("\n"));
            line = document.createElement("span");
            content = document.createTextNode("");
            line.append(content);
            code.append(line);
            entering.push(line);
          }
          content.appendData(parts[index] ?? "");
        }
      },
      flush() {
        if (!media.matches) {
          for (const node of entering.slice(0, 8)) {
            const animation = node.animate([{ opacity: 0 }, { opacity: 1 }], {
              duration: 120,
              easing: ENTER_EASING,
            });
            animations.add(animation);
            const release = (): void => {
              animations.delete(animation);
            };
            animation.addEventListener("finish", release, { once: true });
            animation.addEventListener("cancel", release, { once: true });
          }
        }
        entering.length = 0;
      },
      destroy() {
        stop();
        media.removeEventListener("change", onMotionChange);
      },
    };
  };
}
