import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStreamLayoutMorph } from "./layout-morph.js";

const animations: Array<{
  keyframes: PropertyIndexedKeyframes | Keyframe[] | null;
  options: number | KeyframeAnimationOptions | undefined;
}> = [];

beforeEach(() => {
  document.body.replaceChildren();
  animations.length = 0;
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  Object.defineProperty(HTMLElement.prototype, "animate", {
    configurable: true,
    value: vi.fn((keyframes, options) => {
      animations.push({ keyframes, options });
      return { cancel: vi.fn(), addEventListener: vi.fn() };
    }),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createStreamLayoutMorph", () => {
  it("animates a persistent keyed node from its previous position", () => {
    const root = document.createElement("div");
    const row = document.createElement("div");
    row.dataset.streamMorphKey = "row";
    root.append(row);
    document.body.append(root);
    let top = 10;
    vi.spyOn(row, "getBoundingClientRect").mockImplementation(() => ({
      left: 5,
      top,
      right: 25,
      bottom: top + 20,
      width: 20,
      height: 20,
      x: 5,
      y: top,
      toJSON: () => ({}),
    }));

    const motion = createStreamLayoutMorph(root);
    motion.update(() => {
      top = 50;
    });

    expect(root.firstChild).toBe(row);
    expect(animations).toHaveLength(1);
    expect(animations[0]?.keyframes).toEqual([
      { translate: "0px -40px" },
      { translate: "0px 0px" },
    ]);
    motion.destroy();
  });

  it("rejects async mutations and invalid animation limits", () => {
    const root = document.createElement("div");
    document.body.append(root);
    expect(() => createStreamLayoutMorph(root, { maxAnimatedElements: 0 })).toThrow("positive");
    const motion = createStreamLayoutMorph(root);
    expect(() => motion.update(async () => {})).toThrow("synchronous");
    motion.destroy();
  });

  it("stops active motion on a live reduced-motion change and releases the listener", () => {
    const media = new EventTarget();
    Object.assign(media, { matches: false });
    const remove = vi.spyOn(media, "removeEventListener");
    vi.stubGlobal("matchMedia", () => media);
    const cancel = vi.fn();
    vi.spyOn(HTMLElement.prototype, "animate").mockReturnValue({
      cancel,
      addEventListener: vi.fn(),
    } as unknown as Animation);
    const root = document.createElement("div");
    document.body.append(root);
    const motion = createStreamLayoutMorph(root);
    motion.update(() => {
      const row = document.createElement("div");
      row.dataset.streamMorphKey = "row";
      root.append(row);
    });
    Object.assign(media, { matches: true });
    media.dispatchEvent(new Event("change"));
    expect(cancel).toHaveBeenCalledTimes(1);
    motion.update(() => root.firstElementChild!.append("Still readable"));
    expect(root.textContent).toBe("Still readable");
    motion.destroy();
    motion.destroy();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
