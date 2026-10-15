import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStreamLayoutMorph } from "./layout-morph.js";
import type { StreamLayoutMorph } from "./types.js";

let groups: StreamLayoutMorph[];

beforeEach(() => {
  groups = [];
  document.body.replaceChildren();
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  Object.defineProperty(HTMLElement.prototype, "animate", {
    configurable: true,
    value: vi.fn(() => ({ cancel: vi.fn(), addEventListener: vi.fn() })),
  });
});

afterEach(() => {
  groups.forEach((group) => group.destroy());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

function root() {
  const node = document.createElement("div");
  document.body.append(node);
  return node;
}

function row(key: string) {
  const node = document.createElement("div");
  node.dataset.streamMorphKey = key;
  return node;
}

describe("layout work budgets", () => {
  it("does not query or measure keyed nodes when both animation durations are zero", () => {
    const host = root(),
      query = vi.spyOn(host, "querySelectorAll"),
      measure = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect");
    const group = createStreamLayoutMorph(host, { duration: 0, enterDuration: 0 });
    groups.push(group);
    group.update(() => host.append(row("answer")));
    expect(host.children).toHaveLength(1);
    expect(query).not.toHaveBeenCalled();
    expect(measure).not.toHaveBeenCalled();
    expect(HTMLElement.prototype.animate).not.toHaveBeenCalled();
  });

  it("keeps entrances without position reads when only movement is disabled", () => {
    const host = root(),
      measure = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect");
    const group = createStreamLayoutMorph(host, { duration: 0, enterDuration: 120 });
    groups.push(group);
    const element = row("answer");
    group.update(() => host.append(element));
    group.update(() => element.append("More text"));
    expect(element.textContent).toBe("More text");
    expect(HTMLElement.prototype.animate).toHaveBeenCalledTimes(1);
    expect(measure).not.toHaveBeenCalled();
  });

  it("visits only the recent measurement window in a long DOM collection", () => {
    const host = root();
    for (let index = 0; index < 2000; index++) host.append(row(String(index)));
    let visited = 0;
    const query = host.querySelectorAll.bind(host);
    // Count access through both iterable and indexed collection APIs. A bounded
    // snapshot must not enumerate the old prefix just to discard it afterward.
    vi.spyOn(host, "querySelectorAll").mockImplementation(
      (selector: string) =>
        new Proxy(query(selector), {
          get(target, key) {
            if (key === Symbol.iterator)
              return function* () {
                for (const node of target) {
                  visited++;
                  yield node;
                }
              };
            if (typeof key === "string" && /^\d+$/.test(key)) visited++;
            return Reflect.get(target, key, target);
          },
        }),
    );
    const group = createStreamLayoutMorph(host, { maxAnimatedElements: 8 });
    groups.push(group);
    group.update(() => host.lastElementChild!.append("Still growing"));
    expect(visited).toBe(16);
    expect(host.children).toHaveLength(2000);
    expect(host.lastElementChild?.textContent).toBe("Still growing");
  });
});
