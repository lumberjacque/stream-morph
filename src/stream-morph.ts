import { MorphAnimator } from "./motion.js";
import { splitStableTail, type TextSegment } from "./segment.js";
import type { StreamMorph, StreamMorphOptions } from "./types.js";

type TokenNode = Text | HTMLElement;

class TextStream implements StreamMorph {
  private readonly host: HTMLElement;
  private readonly root: HTMLElement;
  private readonly view: Window;
  private readonly segmenter: Intl.Segmenter;
  private readonly animator: MorphAnimator;
  private logicalText: string;
  private queued = "";
  private mutableTail = "";
  private tailNode: TokenNode | null = null;
  private readonly wordNodes: HTMLElement[] = [];
  private nextKey = 0;
  private frame: number | null = null;
  private finished = false;
  private destroyed = false;

  constructor(host: HTMLElement, options: StreamMorphOptions) {
    const view = host.ownerDocument.defaultView;
    if (!view) throw new Error("Stream Morph needs an element in a browser document.");
    if (host.childElementCount > 0) {
      throw new Error(
        "createStreamMorph owns plain text only. Use createStreamLayoutMorph for rendered DOM.",
      );
    }
    if (typeof Intl.Segmenter !== "function") {
      throw new TypeError("Stream Morph requires Intl.Segmenter for Unicode word boundaries.");
    }

    this.host = host;
    this.view = view;
    this.logicalText = host.textContent ?? "";
    this.segmenter = new Intl.Segmenter(options.locale, { granularity: "word" });
    this.animator = new MorphAnimator(view, options);
    this.root = host.ownerDocument.createElement("span");
    this.root.dataset.streamMorphRoot = "";
    this.root.style.whiteSpace = "pre-wrap";
    this.root.style.overflowWrap = "anywhere";
    host.replaceChildren(this.root);
    if (this.logicalText) {
      this.queued = this.logicalText;
      this.render(false);
    }
  }

  get text(): string {
    return this.logicalText;
  }

  write(chunk: string): void {
    this.assertWritable();
    if (typeof chunk !== "string") throw new TypeError("write() expects a string.");
    if (!chunk) return;
    this.logicalText += chunk;
    this.queued += chunk;
    if (this.frame === null) {
      this.frame = this.view.requestAnimationFrame(() => {
        this.frame = null;
        this.render(true);
      });
    }
  }

  flush(): void {
    this.assertAlive();
    if (this.frame !== null) {
      this.view.cancelAnimationFrame(this.frame);
      this.frame = null;
    }
    this.render(true);
  }

  finish(): void {
    this.assertAlive();
    this.flush();
    this.finished = true;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.frame !== null) this.view.cancelAnimationFrame(this.frame);
    this.frame = null;
    this.animator.destroy();
    this.host.replaceChildren(this.host.ownerDocument.createTextNode(this.logicalText));
  }

  private render(animate: boolean): void {
    if (!this.queued) return;
    const next = splitStableTail(this.mutableTail + this.queued, this.segmenter);
    const parts = [...next.stable, ...(next.tail ? [next.tail] : [])];
    const before =
      animate && this.animator.shouldAnimate ? this.animator.snapshot(this.tokens()) : null;
    this.animator.stop();

    const oldTail = this.tailNode;
    let lastNode: TokenNode | null = null;
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index];
      if (!part) continue;
      let node: TokenNode;
      if (index === 0 && oldTail && this.matchesKind(oldTail, part)) {
        node = oldTail;
        node.textContent = part.text;
      } else {
        node = this.createNode(part);
        if (index === 0 && oldTail) {
          if (oldTail.nodeType === 1) this.wordNodes.pop();
          oldTail.replaceWith(node);
        } else {
          this.root.append(node);
        }
        if (node.nodeType === 1) this.wordNodes.push(node as HTMLElement);
      }
      lastNode = node;
    }

    this.mutableTail = next.tail?.text ?? "";
    this.tailNode = lastNode;
    this.queued = "";
    if (before) this.animator.animate(before, this.animator.snapshot(this.tokens()));
  }

  private tokens(): Iterable<HTMLElement> {
    return this.wordNodes.slice(-this.animator.maxAnimatedElements);
  }

  private createNode(part: TextSegment): TokenNode {
    if (!part.wordLike) return this.host.ownerDocument.createTextNode(part.text);
    const span = this.host.ownerDocument.createElement("span");
    span.dataset.streamMorphKey = String(this.nextKey++);
    span.style.display = "inline-block";
    span.style.maxWidth = "100%";
    span.style.overflowWrap = "anywhere";
    span.textContent = part.text;
    return span;
  }

  private matchesKind(node: TokenNode, part: TextSegment): boolean {
    return part.wordLike ? node.nodeType === 1 : node.nodeType === 3;
  }

  private assertAlive(): void {
    if (this.destroyed) throw new Error("Stream Morph has been destroyed.");
  }

  private assertWritable(): void {
    this.assertAlive();
    if (this.finished) throw new Error("Cannot write after finish().");
  }
}

/**
 * Create an append-only plain-text stream with word entrance and layout motion.
 * @param host - Browser element containing plain text only. The stream owns its children.
 * @param options - Word segmentation, animation durations and the measurement limit.
 * @returns A stream with write, flush, finish and idempotent destroy methods.
 * @throws Error for a host without a browser window or containing child elements;
 * TypeError without Intl.Segmenter; RangeError for invalid options.
 * @remarks Importing is safe on the server. Create the instance after mounting in the browser.
 * Motion is disabled when the user requests reduced motion. Parsing and provider transport
 * belong to the app; use the layout entry to integrate rendered Markdown.
 * @example
 * ```ts
 * const stream = createStreamMorph(host, { locale: "en" });
 * stream.write("Hello ");
 * stream.write("world");
 * stream.finish();
 * // On unmount: stream.destroy();
 * ```
 */
export function createStreamMorph(
  host: HTMLElement,
  options: StreamMorphOptions = {},
): StreamMorph {
  return new TextStream(host, options);
}
