import type { StreamEvent, StreamRenderer } from "./types.js";

/** Image events share the view envelope and optional sizing/accessibility metadata. */
interface ImageFields extends StreamEvent {
  /** Alternative text. Set an empty string for a decorative image. */
  alt?: string;
  /** Positive finite width/height ratio reserved before loading. Default is 16/9. */
  ratio?: number;
}

/** Image lifecycle payload; a ready event must provide a non-empty image URL. */
export type ImageEvent = ImageFields &
  ({ status: "loading" | "error" } | { status: "ready"; src: string });

const ENTER_EASING = "cubic-bezier(0.23, 1, 0.32, 1)";

/**
 * Create an image renderer with reserved aspect ratio, loading and error states.
 * @returns A factory accepting ImageEvent payloads for one persistent figure.
 * @remarks The browser loads src normally; your app owns URL policy and image hosting.
 * A ready image fades after its load event. Reduced motion displays it immediately.
 * Supply alt for informative images. Defaults to a 16/9 frame with a loading placeholder.
 * Invalid status, src or alt fields throw TypeError; invalid ratios throw RangeError on flush.
 */
export function imageRenderer(): StreamRenderer {
  return (_id, document) => {
    const figure = document.createElement("figure");
    const frame = document.createElement("div");
    const placeholder = document.createElement("span");
    const image = document.createElement("img");
    const view = document.defaultView;
    if (!view) throw new Error("Image renderer needs a browser document.");
    const media = view.matchMedia("(prefers-reduced-motion: reduce)");
    let animation: Animation | null = null;
    let destroyed = false;
    let status: "loading" | "ready" | "error" = "loading";
    frame.style.display = "grid";
    frame.style.placeItems = "center";
    frame.style.overflow = "hidden";
    frame.style.aspectRatio = "16 / 9";
    placeholder.textContent = "Generating image…";
    placeholder.style.gridArea = "1 / 1";
    image.style.gridArea = "1 / 1";
    image.style.width = "100%";
    image.style.height = "100%";
    image.style.objectFit = "cover";
    image.hidden = true;
    frame.append(placeholder, image);
    figure.append(frame);
    const stop = (): void => {
      animation?.cancel();
      animation = null;
    };
    const onMotionChange = (): void => {
      if (media.matches) stop();
    };
    media.addEventListener("change", onMotionChange);
    const onLoad = (): void => {
      if (destroyed || status !== "ready") return;
      image.hidden = false;
      placeholder.hidden = true;
      stop();
      if (!media.matches) {
        animation = image.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: 180,
          easing: ENTER_EASING,
        });
      }
    };
    const onError = (): void => {
      if (destroyed || status !== "ready") return;
      stop();
      image.hidden = true;
      placeholder.hidden = false;
      placeholder.textContent = "Image unavailable";
    };
    image.addEventListener("load", onLoad);
    image.addEventListener("error", onError);
    return {
      element: figure,
      update(event) {
        if (event.ratio !== undefined) {
          if (typeof event.ratio !== "number" || !Number.isFinite(event.ratio) || event.ratio <= 0)
            throw new RangeError("Image ratio must be a positive finite number.");
          frame.style.aspectRatio = String(event.ratio);
        }
        if (event.alt !== undefined) {
          if (typeof event.alt !== "string") throw new TypeError("Image alt must be a string.");
          image.alt = event.alt;
        }
        if (event.status === "loading") {
          status = "loading";
          stop();
          image.hidden = true;
          placeholder.textContent = "Generating image…";
          placeholder.hidden = false;
        } else if (event.status === "error") {
          status = "error";
          stop();
          image.hidden = true;
          placeholder.textContent = "Image unavailable";
          placeholder.hidden = false;
        } else if (event.status === "ready") {
          if (typeof event.src !== "string" || !event.src)
            throw new TypeError("Ready image events need a src string.");
          status = "ready";
          if (image.getAttribute("src") !== event.src) {
            stop();
            image.hidden = true;
            placeholder.hidden = false;
            image.src = event.src;
          } else if (image.complete && image.naturalWidth > 0) onLoad();
        } else throw new TypeError("Image status must be loading, ready, or error.");
      },
      destroy() {
        destroyed = true;
        stop();
        media.removeEventListener("change", onMotionChange);
        image.removeEventListener("load", onLoad);
        image.removeEventListener("error", onError);
      },
    };
  };
}
