import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStreamMorph } from "./stream-morph.js";

function host(): HTMLElement {
  const element = document.createElement("p");
  document.body.append(element);
  return element;
}

beforeEach(() => {
  document.body.replaceChildren();
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createStreamMorph", () => {
  it("bounds measurements on long streams and batches many chunks into one frame", () => {
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const element = host(),
      initial = "word ".repeat(2000);
    element.textContent = initial;
    const stream = createStreamMorph(element, { maxAnimatedElements: 8, enterDuration: 0 });
    const first = element.querySelector("[data-stream-morph-key]");
    const read = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect");
    const schedule = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(42);
    const cancel = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    try {
      for (let i = 0; i < 100; i++) stream.write("next ");
      expect(schedule).toHaveBeenCalledTimes(1);
      stream.flush();
      expect(read).toHaveBeenCalledTimes(16);
      expect(element.querySelector("[data-stream-morph-key]")).toBe(first);
      expect(element.textContent).toBe(initial + "next ".repeat(100));
      expect(stream.text).toBe(element.textContent);
      expect(cancel).toHaveBeenCalledWith(42);
    } finally {
      stream.destroy();
      read.mockRestore();
      schedule.mockRestore();
      cancel.mockRestore();
    }
  });

  it("reassembles arbitrary chunks, including a split surrogate pair", () => {
    const element = host();
    const stream = createStreamMorph(element);
    stream.write("A growing wor");
    stream.flush();
    stream.write("d \ud83d");
    stream.flush();
    stream.write("\ude80 stays readable.");
    stream.finish();

    expect(stream.text).toBe("A growing word 🚀 stays readable.");
    expect(element.textContent).toBe(stream.text);
  });

  it("keeps a stable word node while its mutable tail grows", () => {
    const element = host();
    const stream = createStreamMorph(element);
    stream.write("Hel");
    stream.flush();
    const firstWord = element.querySelector("[data-stream-morph-key]");

    stream.write("lo world");
    stream.flush();

    expect(firstWord?.textContent).toBe("Hello");
    expect(element.querySelector("[data-stream-morph-key]")).toBe(firstWord);
    expect(element.textContent).toBe("Hello world");
  });

  it("batches writes until flush and rejects writes after finish", () => {
    const element = host();
    const stream = createStreamMorph(element);
    stream.write("One");
    stream.write(" two");

    expect(stream.text).toBe("One two");
    expect(element.textContent).toBe("");

    stream.finish();
    expect(element.textContent).toBe("One two");
    expect(() => stream.write(" three")).toThrow("finish");
  });

  it("restores plain text and refuses further use after destroy", () => {
    const element = host();
    element.textContent = "Start";
    const stream = createStreamMorph(element);
    stream.write(" here");
    stream.destroy();

    expect(element.textContent).toBe("Start here");
    expect(element.childNodes).toHaveLength(1);
    expect(element.firstChild?.nodeType).toBe(3);
    expect(() => stream.flush()).toThrow("destroyed");
  });

  it("rejects ownership of existing rendered DOM", () => {
    const element = host();
    element.innerHTML = "<strong>Existing markup</strong>";
    expect(() => createStreamMorph(element)).toThrow("plain text only");
  });

  it("cancels a queued frame on destroy and restores text without a delayed mutation", () => {
    const schedule = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(41);
    const cancel = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    const element = host();
    const stream = createStreamMorph(element);
    try {
      stream.write("Not yet painted");
      stream.write(" but never lost.");
      expect(schedule).toHaveBeenCalledTimes(1);
      stream.destroy();
      stream.destroy();
      expect(cancel).toHaveBeenCalledExactlyOnceWith(41);
      expect(element.childNodes).toHaveLength(1);
      expect(element.textContent).toBe("Not yet painted but never lost.");
    } finally {
      stream.destroy();
      schedule.mockRestore();
      cancel.mockRestore();
    }
  });

  it("rejects invalid options before changing the host or scheduling work", () => {
    const element = host();
    element.textContent = "Existing answer";
    expect(() => createStreamMorph(element, { duration: NaN })).toThrow(RangeError);
    expect(() => createStreamMorph(element, { enterDuration: -1 })).toThrow(RangeError);
    expect(() => createStreamMorph(element, { maxAnimatedElements: 1.5 })).toThrow(RangeError);
    expect(element.childNodes).toHaveLength(1);
    expect(element.textContent).toBe("Existing answer");
  });
});
