import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStreamView } from "./index.js";
import { textRenderer } from "./text.js";
import { codeRenderer } from "./code.js";
import { imageRenderer } from "./image.js";

const animations: Array<{ element: Element; keyframes: Keyframe[] }> = [];

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
    value: vi.fn(function (this: Element, keyframes: Keyframe[]) {
      animations.push({ element: this, keyframes });
      return { cancel: vi.fn(), addEventListener: vi.fn() };
    }),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function host(): HTMLElement {
  const element = document.createElement("div");
  document.body.append(element);
  return element;
}

describe("createStreamView", () => {
  it("bounds entrance animations when many blocks arrive in one frame", () => {
    const root = host();
    const stream = createStreamView(root, {
      maxAnimatedBlocks: 3,
      renderers: { code: codeRenderer() },
    });
    for (let index = 0; index < 20; index += 1)
      stream.push({ id: String(index), kind: "code", delta: `line ${index}` });
    stream.flush();
    expect(root.children).toHaveLength(20);
    expect(animations).toHaveLength(3);
    expect(animations.map(({ element }) => element.textContent)).toEqual([
      "line 17",
      "line 18",
      "line 19",
    ]);
    stream.destroy();
  });

  it("rejects a renderer that reuses an attached element in a detached host", () => {
    const root = document.createElement("div");
    const element = document.createElement("p");
    const stream = createStreamView(root, {
      renderers: { card: () => ({ element, update: () => {} }) },
    });
    stream.push({ id: "first", kind: "card" });
    stream.push({ id: "second", kind: "card" });
    expect(() => stream.flush()).toThrow("detached element");
    expect(root.children).toHaveLength(1);
    stream.destroy();
  });

  it("keeps block identity and cancels pending events on destruction", () => {
    const root = host();
    const stream = createStreamView(root, { renderers: { code: codeRenderer() } });
    stream.push({ id: "code", kind: "code", delta: "first" });
    stream.flush();
    const block = root.firstElementChild;
    stream.push({ id: "code", kind: "code", delta: " second" });
    stream.flush();
    expect(root.firstElementChild).toBe(block);
    expect(block?.textContent).toBe("first second");
    stream.push({ id: "code", kind: "code", delta: " discarded" });
    stream.destroy();
    stream.destroy();
    expect(block?.textContent).toBe("first second");
    expect(() => stream.push({ id: "code", kind: "code", delta: "late" })).toThrow("destroyed");
  });
  it("batches arbitrary text chunks without exposing partial DOM", () => {
    const root = host();
    const stream = createStreamView(root, { renderers: { text: textRenderer() } });
    stream.push({ id: "a", kind: "text", delta: "Hel" });
    stream.push({ id: "a", kind: "text", delta: "lo world" });
    expect(root.textContent).toBe("");
    stream.flush();
    expect(root.textContent).toBe("Hello world");
    expect(root.children).toHaveLength(1);
    stream.destroy();
    expect(root.textContent).toBe("Hello world");
  });

  it("does not measure block layouts for updates to the last block", () => {
    const root = host();
    const measure = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect");
    const stream = createStreamView(root, {
      renderers: {
        text: () => {
          const element = document.createElement("p");
          const content = document.createTextNode("");
          element.append(content);
          return {
            element,
            enter: false,
            update(event) {
              content.appendData(String(event.delta));
            },
          };
        },
      },
    });
    for (let index = 0; index < 40; index += 1)
      stream.push({ id: "answer", kind: "text", delta: "more text " });
    stream.flush();
    expect(root.textContent).toContain("more text");
    expect(measure).not.toHaveBeenCalled();
    stream.destroy();
  });

  it("accepts different kinds and preserves code newlines", () => {
    const root = host();
    const stream = createStreamView(root, {
      renderers: { text: textRenderer(), code: codeRenderer() },
    });
    stream.push({ id: "answer", kind: "text", delta: "Use this:" });
    stream.push({ id: "example", kind: "code", delta: "const a = 1;\n" });
    stream.push({ id: "example", kind: "code", delta: "console.log(a);" });
    stream.flush();
    expect(root.textContent).toBe("Use this:const a = 1;\nconsole.log(a);");
    expect(root.querySelector("pre code")?.textContent).toBe("const a = 1;\nconsole.log(a);");
    expect(() => stream.push({ id: "example", kind: "text", delta: "bad" })).toThrow(
      "changed kind",
    );
    stream.destroy();
  });

  it("animates only moved blocks when an earlier block changes", () => {
    const root = host();
    const stream = createStreamView(root, {
      renderers: {
        card: () => {
          const element = document.createElement("div");
          return {
            element,
            update(event) {
              element.textContent = String(event.value);
              if (event.value === "first updated") top = 30;
            },
            enter: false,
          };
        },
      },
    });
    let top = 0;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      const y = this.textContent === "second" ? top : 0;
      return {
        left: 0,
        top: y,
        right: 20,
        bottom: y + 20,
        width: 20,
        height: 20,
        x: 0,
        y,
        toJSON: () => ({}),
      };
    });
    stream.push({ id: "one", kind: "card", value: "first" });
    stream.push({ id: "two", kind: "card", value: "second" });
    stream.flush();
    stream.push({ id: "one", kind: "card", value: "first updated" });
    stream.flush();
    expect(animations.some(({ keyframes }) => JSON.stringify(keyframes).includes("-30px"))).toBe(
      true,
    );
    stream.destroy();
  });

  it("ignores image errors while a new image is being prepared", () => {
    const root = host();
    const stream = createStreamView(root, { renderers: { image: imageRenderer() } });
    stream.push({ id: "art", kind: "image", status: "ready", src: "/old.png" });
    stream.flush();
    stream.push({ id: "art", kind: "image", status: "loading" });
    stream.flush();
    root.querySelector("img")!.dispatchEvent(new Event("error"));
    expect(root.querySelector("figure span")?.textContent).toBe("Generating image…");
    stream.destroy();
  });

  it("reserves image space and reveals a loaded image", () => {
    const root = host();
    const stream = createStreamView(root, { renderers: { image: imageRenderer() } });
    stream.push({ id: "art", kind: "image", status: "loading", ratio: 1.5 });
    stream.flush();
    expect(root.querySelector("figure > div")?.getAttribute("style")).toContain(
      "aspect-ratio: 1.5",
    );
    stream.push({ id: "art", kind: "image", status: "ready", src: "/art.png", alt: "Art" });
    stream.flush();
    const image = root.querySelector("img")!;
    image.dispatchEvent(new Event("load"));
    expect(image.hidden).toBe(false);
    expect(image.alt).toBe("Art");
    stream.destroy();
  });
});
