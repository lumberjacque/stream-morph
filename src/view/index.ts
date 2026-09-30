import type { StreamBlock, StreamEvent, StreamView, StreamViewOptions } from "./types.js";

export type {
  StreamBlock,
  StreamEvent,
  StreamRenderer,
  StreamView,
  StreamViewOptions,
} from "./types.js";

const MOVE_EASING = "cubic-bezier(0.77, 0, 0.175, 1)";
const ENTER_EASING = "cubic-bezier(0.23, 1, 0.32, 1)";

function duration(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value < 0) throw new RangeError("Duration must be non-negative.");
  return value;
}

interface Position {
  element: HTMLElement;
  left: number;
  top: number;
}

class View implements StreamView {
  private readonly blocks = new Map<string, { kind: string; block: StreamBlock; index: number }>();
  private readonly recentIds: string[] = [];
  private readonly queue: StreamEvent[] = [];
  private readonly queuedKinds = new Map<string, string>();
  private readonly view: Window;
  private readonly media: MediaQueryList;
  private readonly moveDuration: number;
  private readonly enterDuration: number;
  private readonly maxAnimatedBlocks: number;
  private readonly animations = new Set<Animation>();
  private frame: number | null = null;
  private destroyed = false;

  constructor(
    private readonly host: HTMLElement,
    private readonly options: StreamViewOptions,
  ) {
    const view = host.ownerDocument.defaultView;
    if (!view) throw new Error("Stream View needs an element in a browser document.");
    if (host.childNodes.length) throw new Error("Stream View needs an empty host element.");
    if (!Object.keys(options.renderers).length)
      throw new Error("At least one renderer is required.");
    this.view = view;
    this.moveDuration = duration(options.duration, 180);
    this.enterDuration = duration(options.enterDuration, 120);
    const max = options.maxAnimatedBlocks ?? 48;
    if (!Number.isSafeInteger(max) || max < 1)
      throw new RangeError("maxAnimatedBlocks must be a positive safe integer.");
    this.maxAnimatedBlocks = max;
    this.media = view.matchMedia("(prefers-reduced-motion: reduce)");
    this.media.addEventListener("change", this.onMotionChange);
  }

  push(event: StreamEvent): void {
    this.assertAlive();
    if (typeof event.id !== "string" || !event.id || typeof event.kind !== "string" || !event.kind)
      throw new TypeError("Stream events need non-empty id and kind strings.");
    if (!Object.hasOwn(this.options.renderers, event.kind))
      throw new Error(`No renderer for stream kind: ${event.kind}`);
    const existing = this.blocks.get(event.id);
    const pendingKind = this.queuedKinds.get(event.id);
    if ((existing && existing.kind !== event.kind) || (pendingKind && pendingKind !== event.kind))
      throw new Error(`Stream ID ${event.id} changed kind.`);
    this.queue.push(event);
    this.queuedKinds.set(event.id, event.kind);
    if (this.frame === null) this.frame = this.view.requestAnimationFrame(() => this.flush());
  }

  flush(): void {
    this.assertAlive();
    if (this.frame !== null) this.view.cancelAnimationFrame(this.frame);
    this.frame = null;
    if (!this.queue.length) return;

    // An append to the final block cannot move earlier blocks. Skip layout reads
    // for the common case of a single growing answer.
    const needsMovement =
      this.moveDuration > 0 &&
      this.queue.some((event) => {
        const index = this.blocks.get(event.id)?.index;
        return index !== undefined && index < this.blocks.size - 1;
      });
    const before =
      !this.media.matches && needsMovement ? this.snapshot() : new Map<string, Position>();
    if (needsMovement) this.stopAnimations();
    const created = new Set<string>();
    const updated = new Set<StreamBlock>();
    const events = this.queue.splice(0);
    this.queuedKinds.clear();
    for (const event of events) {
      let entry = this.blocks.get(event.id);
      if (!entry) {
        const renderer = this.options.renderers[event.kind];
        if (!renderer) throw new Error(`No renderer for stream kind: ${event.kind}`);
        const block = renderer(event.id, this.host.ownerDocument);
        if (
          block.element?.nodeType !== 1 ||
          block.element.namespaceURI !== "http://www.w3.org/1999/xhtml" ||
          block.element.ownerDocument !== this.host.ownerDocument
        )
          throw new TypeError("A renderer must return an HTMLElement.");
        if (block.element.parentNode !== null || block.element.isConnected)
          throw new Error("A renderer must return a detached element.");
        entry = { kind: event.kind, block, index: this.blocks.size };
        this.blocks.set(event.id, entry);
        this.recentIds.push(event.id);
        if (this.recentIds.length > this.maxAnimatedBlocks) this.recentIds.shift();
        this.host.append(block.element);
        created.add(event.id);
      }
      entry.block.update(event);
      updated.add(entry.block);
    }
    for (const block of updated) block.flush?.();
    if (!this.media.matches) this.animate(before, created);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.frame !== null) this.view.cancelAnimationFrame(this.frame);
    this.frame = null;
    this.queue.length = 0;
    this.queuedKinds.clear();
    this.stopAnimations();
    this.media.removeEventListener("change", this.onMotionChange);
    for (const { block } of this.blocks.values()) block.destroy?.();
    this.blocks.clear();
    this.recentIds.length = 0;
  }

  private snapshot(): Map<string, Position> {
    const positions = new Map<string, Position>();
    for (const id of this.recentIds) {
      const entry = this.blocks.get(id);
      if (!entry) continue;
      const { block } = entry;
      const rect = block.element.getBoundingClientRect();
      positions.set(id, { element: block.element, left: rect.left, top: rect.top });
    }
    return positions;
  }

  private animate(before: Map<string, Position>, created: Set<string>): void {
    const after = before.size ? this.snapshot() : new Map<string, Position>();
    for (const [id, current] of after) {
      const previous = before.get(id);
      if (!previous) continue;
      const dx = previous.left - current.left;
      const dy = previous.top - current.top;
      if (!this.moveDuration || (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5)) continue;
      this.track(
        current.element.animate([{ translate: `${dx}px ${dy}px` }, { translate: "0px 0px" }], {
          duration: this.moveDuration,
          easing: MOVE_EASING,
          composite: "add",
        }),
      );
    }
    if (this.enterDuration)
      for (const id of this.recentIds) {
        if (!created.has(id)) continue;
        const block = this.blocks.get(id)?.block;
        if (block && block.enter !== false)
          this.track(
            block.element.animate([{ opacity: 0 }, { opacity: 1 }], {
              duration: this.enterDuration,
              easing: ENTER_EASING,
            }),
          );
      }
  }

  private stopAnimations(): void {
    for (const animation of this.animations) animation.cancel();
    this.animations.clear();
  }

  private track(animation: Animation): void {
    this.animations.add(animation);
    const release = (): void => {
      this.animations.delete(animation);
    };
    animation.addEventListener("finish", release, { once: true });
    animation.addEventListener("cancel", release, { once: true });
  }

  private readonly onMotionChange = (): void => {
    if (this.media.matches) this.stopAnimations();
  };

  private assertAlive(): void {
    if (this.destroyed) throw new Error("Stream View has been destroyed.");
  }
}

/**
 * Create a batched response view with persistent blocks and top-level layout motion.
 * @param host - Empty browser element. The view appends blocks in first-ID order.
 * @param options - Registered renderer factories and top-level animation limits.
 * @returns A view with push, flush and idempotent destroy methods.
 * @throws Error for a host without a browser window, a non-empty host or an empty renderer map;
 * RangeError for invalid durations or block limits.
 * @remarks Import renderers separately from stream-morph/renderers/text, code or image.
 * Built-in text is plain text; Markdown and tool cards need app-provided renderers.
 * The view owns batching, not the provider connection. Reduced motion disables movement.
 * @example
 * ```ts
 * const view = createStreamView(host, { renderers: { text: textRenderer() } });
 * view.push({ id: "answer", kind: "text", delta: "Hello" });
 * // On unmount: view.destroy();
 * ```
 */
export function createStreamView(host: HTMLElement, options: StreamViewOptions): StreamView {
  return new View(host, options);
}
