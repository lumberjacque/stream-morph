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
});
