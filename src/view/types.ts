/** An event envelope; each renderer validates its own payload fields. */
export interface StreamEvent {
  /** Non-empty block ID. Reuse it to update the same block; IDs are scoped to one view. */
  id: string;
  /** Non-empty key from the registered renderer map. An ID cannot change kind. */
  kind: string;
  /** App-defined payload. Use renderer event types to check built-in fields. */
  [field: string]: unknown;
}

/** One persistent block returned by a renderer factory. */
export interface StreamBlock {
  /** A detached HTMLElement belonging to the document passed to the factory. */
  element: HTMLElement;
  /** Apply one event synchronously. Validate untrusted fields before changing the DOM. */
  update(event: StreamEvent): void;
  /** Called once after all events batched into a frame. */
  flush?(): void;
  /** Release listeners and renderer-owned resources on view destruction. */
  destroy?(): void;
  /** Set false when the adapter animates its own content entrance. */
  enter?: boolean;
}

/**
 * Create a block once when its ID first appears; subsequent events call its update method.
 * @param id - Stable ID of the block being created.
 * @param document - The host's owner document. Create the block's elements here.
 * @returns A persistent detached HTML block and its synchronous update methods.
 */
export type StreamRenderer = (id: string, document: Document) => StreamBlock;

/** View scheduling and top-level motion options; renderer motion is configured separately. */
export interface StreamViewOptions {
  /** At least one renderer, keyed by event kind. Keep this map stable for the view's lifetime. */
  renderers: Record<string, StreamRenderer>;
  /**
   * Finite non-negative movement duration in milliseconds.
   * @defaultValue 180
   */
  duration?: number;
  /**
   * Finite non-negative entrance duration in milliseconds.
   * @defaultValue 120
   */
  enterDuration?: number;
  /**
   * Positive safe integer limiting recent top-level measurements and entrances.
   * @defaultValue 48
   */
  maxAnimatedBlocks?: number;
}

/** An ordered response view; the app owns its provider connection and cancellation. */
export interface StreamView {
  /**
   * Queue an event for the next animation frame. Blocks append in first-ID order.
   * @param event - Stable ID, registered kind and renderer payload. Do not mutate queued events.
   * @throws Error for an unregistered kind, a changed kind or a destroyed view;
   * TypeError for an empty ID or kind. Renderer errors occur during flush, not push.
   */
  push(event: StreamEvent): void;
  /**
   * Commit the pending batch immediately. Safe when the queue is empty.
   * @remarks Renderer errors propagate; earlier DOM updates are not rolled back.
   * Call inside try/catch to handle errors synchronously instead of in the scheduled frame.
   */
  flush(): void;
  /** Discard queued events, cancel motion and release renderers. Keeps committed DOM. Idempotent. */
  destroy(): void;
}
