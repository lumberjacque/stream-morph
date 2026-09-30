/** Configuration shared by text streaming and keyed DOM layout motion. */
export interface StreamMorphOptions {
  /** BCP 47 locale for text word segmentation. Ignored by layout motion. */
  locale?: string;
  /**
   * Movement duration in milliseconds. Must be finite and non-negative.
   * @defaultValue 180
   */
  duration?: number;
  /**
   * Entrance duration in milliseconds. Must be finite and non-negative.
   * @defaultValue 120
   */
  enterDuration?: number;
  /**
   * Positive safe integer limiting recent keyed elements measured per update.
   * @defaultValue 160
   */
  maxAnimatedElements?: number;
}

/** An append-only text stream that owns its host's child nodes. */
export interface StreamMorph {
  /** Full logical text, including chunks waiting for the next animation frame. */
  readonly text: string;
  /**
   * Append a text delta; writes in one frame are batched, including partial words and emoji.
   * @param chunk - Text to append. An empty string is a no-op.
   * @throws TypeError if the chunk is not a string; Error after finish or destruction.
   */
  write(chunk: string): void;
  /** Render queued text immediately. Throws after destruction. */
  flush(): void;
  /** Flush queued text and reject later writes. Repeat calls are safe until destruction. */
  finish(): void;
  /** Cancel work, release listeners and restore all logical text, including queued deltas. Idempotent. */
  destroy(): void;
}

/** Motion around synchronous updates to DOM owned by an external renderer. */
export interface StreamLayoutMorph {
  /**
   * Measure keyed descendants, apply the mutation, then animate changed positions and entrances.
   * @param mutate - A synchronous DOM update. Keep existing elements and their unique keys stable.
   * @throws TypeError if the callback returns a thenable; Error after destruction or for invalid keys.
   * @remarks DOM changes are not rolled back if the callback or key validation throws.
   */
  update(mutate: () => void): void;
  /** Cancel animations and release listeners. Leaves rendered DOM untouched. Idempotent. */
  destroy(): void;
}
