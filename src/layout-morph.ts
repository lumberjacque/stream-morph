import { MorphAnimator } from "./motion.js";
import type { StreamLayoutMorph, StreamMorphOptions } from "./types.js";

class LayoutMorph implements StreamLayoutMorph {
  private readonly root: HTMLElement;
  private readonly animator: MorphAnimator;
  private destroyed = false;

  constructor(root: HTMLElement, options: StreamMorphOptions) {
    const view = root.ownerDocument.defaultView;
    if (!view) throw new Error("Stream Morph needs an element in a browser document.");
    this.root = root;
    this.animator = new MorphAnimator(view, options);
  }

  update(mutate: () => void): void {
    if (this.destroyed) throw new Error("Stream Layout Morph has been destroyed.");
    const before = this.animator.shouldAnimate ? this.animator.snapshot(this.tokens()) : null;
    this.animator.stop();
    const result: unknown = mutate();
    if (result && typeof (result as PromiseLike<unknown>).then === "function") {
      throw new TypeError("update() requires a synchronous DOM mutation.");
    }
    if (before) this.animator.animate(before, this.animator.snapshot(this.tokens()));
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.animator.destroy();
  }

  private tokens(): NodeListOf<HTMLElement> {
    return this.root.querySelectorAll<HTMLElement>("[data-stream-morph-key]");
  }
}

/**
 * Animate synchronous updates made by an existing DOM renderer.
 * @param root - Browser element whose keyed descendants should animate.
 * @param options - Movement, entrance and measurement limits. Locale is unused.
 * @returns A layout controller that leaves the renderer's DOM intact on destruction.
 * @throws Error when the root has no browser window; RangeError for invalid motion options.
 * @remarks Preserve element identity and unique data-stream-morph-key values across updates.
 * Container height and changes inside a keyed element belong to the renderer.
 * @example
 * ```ts
 * const morph = createStreamLayoutMorph(host);
 * morph.update(() => host.append(keyedBlock));
 * // On unmount: morph.destroy();
 * ```
 */
export function createStreamLayoutMorph(
  root: HTMLElement,
  options: StreamMorphOptions = {},
): StreamLayoutMorph {
  return new LayoutMorph(root, options);
}
