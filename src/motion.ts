import type { StreamMorphOptions } from "./types.js";

interface Bounds {
  left: number;
  top: number;
}

interface MeasuredElement extends Bounds {
  element: HTMLElement;
}

export type Snapshot = Map<string, MeasuredElement>;

const MOVE_EASING = "cubic-bezier(0.77, 0, 0.175, 1)";
const ENTER_EASING = "cubic-bezier(0.23, 1, 0.32, 1)";
const MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function nonNegativeNumber(value: number | undefined, fallback: number, label: string): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value < 0)
    throw new RangeError(`${label} must be a finite, non-negative number.`);
  return value;
}

export class MorphAnimator {
  readonly maxAnimatedElements: number;
  private readonly duration: number;
  private readonly enterDuration: number;
  private readonly media: MediaQueryList;
  private readonly active = new Set<Animation>();
  private destroyed = false;

  constructor(view: Window, options: StreamMorphOptions) {
    this.duration = nonNegativeNumber(options.duration, 180, "duration");
    this.enterDuration = nonNegativeNumber(options.enterDuration, 120, "enterDuration");
    const max = options.maxAnimatedElements ?? 160;
    if (!Number.isSafeInteger(max) || max < 1) {
      throw new RangeError("maxAnimatedElements must be a positive safe integer.");
    }
    this.maxAnimatedElements = max;
    this.media = view.matchMedia(MOTION_QUERY);
    this.media.addEventListener("change", this.onMotionChange);
  }

  get shouldAnimate(): boolean {
    return !this.destroyed && !this.media.matches;
  }

  /** Read only the most recent nodes; an append normally cannot move earlier text. */
  snapshot(elements: Iterable<HTMLElement>): Snapshot {
    const recent = Array.isArray(elements)
      ? elements.slice(-this.maxAnimatedElements)
      : Array.from(elements).slice(-this.maxAnimatedElements);
    const result: Snapshot = new Map();
    for (const element of recent) {
      const key = element.dataset.streamMorphKey;
      if (key === undefined) throw new Error("A motion element is missing data-stream-morph-key.");
      if (result.has(key)) throw new Error(`Duplicate stream morph key: ${key}`);
      const rect = element.getBoundingClientRect();
      result.set(key, { element, left: rect.left, top: rect.top });
    }
    return result;
  }

  animate(before: Snapshot, after: Snapshot): void {
    if (!this.shouldAnimate) return;
    for (const [key, next] of after) {
      const previous = before.get(key);
      if (previous) {
        const dx = previous.left - next.left;
        const dy = previous.top - next.top;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
        if (this.duration === 0) continue;
        this.track(
          next.element.animate([{ translate: `${dx}px ${dy}px` }, { translate: "0px 0px" }], {
            duration: this.duration,
            easing: MOVE_EASING,
            composite: "add",
          }),
        );
      } else if (this.enterDuration > 0) {
        this.track(
          next.element.animate([{ opacity: 0 }, { opacity: 1 }], {
            duration: this.enterDuration,
            easing: ENTER_EASING,
          }),
        );
      }
    }
  }

  stop(): void {
    for (const animation of this.active) animation.cancel();
    this.active.clear();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stop();
    this.media.removeEventListener("change", this.onMotionChange);
  }

  private readonly onMotionChange = (): void => {
    if (this.media.matches) this.stop();
  };

  private track(animation: Animation): void {
    this.active.add(animation);
    const release = (): void => {
      this.active.delete(animation);
    };
    animation.addEventListener("finish", release, { once: true });
    animation.addEventListener("cancel", release, { once: true });
  }
}
