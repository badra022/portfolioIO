"use client";

/**
 * Removes the background from a teacher's photo in the browser (MediaPipe's
 * selfie segmenter, Apache-2.0), so the hero shows the teacher on the site's own
 * colors (components/Hero.tsx, ".hero-photo.cut"). Nothing is sent anywhere: the
 * runtime and the 250 KB model are served from /segment/ (scripts/copy-segmenter.mjs).
 *
 * The result's file name contains "cutout"; the stored key keeps it, and that is
 * how the site knows the photo has no background.
 */
import type { ImageSegmenter } from "@mediapipe/tasks-vision";

const MAX_SIDE = 1100;
let segmenter: Promise<ImageSegmenter> | null = null;

function load(): Promise<ImageSegmenter> {
  segmenter ??= (async () => {
    const { FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
    const files = await FilesetResolver.forVisionTasks("/segment");
    return ImageSegmenter.createFromOptions(files, {
      baseOptions: { modelAssetPath: "/segment/selfie_segmenter.tflite", delegate: "CPU" },
      runningMode: "IMAGE",
      outputConfidenceMasks: true,
      outputCategoryMask: false,
    });
  })();
  segmenter.catch(() => { segmenter = null; });
  return segmenter;
}

/** Starts downloading the model early (e.g. when a photo is picked). */
export function preloadCutout(): void {
  void load().catch(() => {});
}

async function toCanvas(src: Blob | string): Promise<HTMLCanvasElement> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = typeof src === "string" ? src : URL.createObjectURL(src);
  await img.decode();
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * scale);
  c.height = Math.round(img.naturalHeight * scale);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  if (typeof src !== "string") URL.revokeObjectURL(img.src);
  return c;
}

/**
 * Keeps the teacher's shapes (the biggest one, and others at least a tenth of its
 * size, like a raised hand) and drops stray bits of background.
 */
function keepShapes(alpha: Float32Array, w: number, h: number): void {
  const label = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  const sizes = [0];
  for (let start = 0; start < w * h; start++) {
    if (label[start] || alpha[start] < 0.5) continue;
    const id = sizes.length;
    let size = 0, top = 0;
    stack[top++] = start; label[start] = id;
    while (top) {
      const i = stack[--top]; size++;
      const x = i % w, y = (i - x) / w;
      if (x > 0 && !label[i - 1] && alpha[i - 1] >= 0.5) { label[i - 1] = id; stack[top++] = i - 1; }
      if (x < w - 1 && !label[i + 1] && alpha[i + 1] >= 0.5) { label[i + 1] = id; stack[top++] = i + 1; }
      if (y > 0 && !label[i - w] && alpha[i - w] >= 0.5) { label[i - w] = id; stack[top++] = i - w; }
      if (y < h - 1 && !label[i + w] && alpha[i + w] >= 0.5) { label[i + w] = id; stack[top++] = i + w; }
    }
    sizes.push(size);
  }
  const biggest = Math.max(...sizes);
  const keep = sizes.map((n) => n >= biggest * 0.1);
  const kept = (j: number) => j >= 0 && j < w * h && label[j] > 0 && keep[label[j]];
  for (let i = 0; i < w * h; i++) {
    if (label[i]) { if (!keep[label[i]]) alpha[i] = 0; continue; }
    // Soft edges (hair, shoulders) only next to a kept shape.
    if (alpha[i] > 0 && !(kept(i - 1) || kept(i + 1) || kept(i - w) || kept(i + w) || kept(i - 2) || kept(i + 2) || kept(i - 2 * w) || kept(i + 2 * w))) alpha[i] = 0;
  }
}

export type Cutout = { file: File; url: string };

/** The photo without its background, cropped to the teacher; null when no person was found. */
export async function cutout(src: Blob | string): Promise<Cutout | null> {
  const seg = await load();
  const canvas = await toCanvas(src);
  const { width: w, height: h } = canvas;
  const result = seg.segment(canvas);
  const mask = result.confidenceMasks?.[0];
  if (!mask) return null;
  const raw = mask.getAsFloat32Array();
  const mw = mask.width, mh = mask.height;
  const alpha = new Float32Array(mw * mh);
  // Confidence → opacity, with a soft ramp so edges (hair, shoulders) aren't jagged.
  for (let i = 0; i < raw.length; i++) alpha[i] = Math.min(1, Math.max(0, (raw[i] - 0.2) / 0.6));
  result.close();
  keepShapes(alpha, mw, mh);

  let fg = 0, minX = mw, minY = mh, maxX = -1, maxY = -1;
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
    if (alpha[y * mw + x] > 0.1) { fg++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  const share = fg / (mw * mh);
  if (share < 0.06 || share > 0.92) return null;

  const m = document.createElement("canvas");
  m.width = mw; m.height = mh;
  const mctx = m.getContext("2d")!;
  const data = mctx.createImageData(mw, mh);
  for (let i = 0; i < alpha.length; i++) data.data[i * 4 + 3] = Math.round(alpha[i] * 255);
  mctx.putImageData(data, 0, 0);

  const out = document.createElement("canvas");
  out.width = w; out.height = h;
  const ctx = out.getContext("2d")!;
  ctx.filter = "blur(0.6px)";
  ctx.drawImage(m, 0, 0, w, h);
  ctx.filter = "none";
  ctx.globalCompositeOperation = "source-in";
  ctx.drawImage(canvas, 0, 0);

  // Crop to the teacher with a little air on the sides and top.
  const sx = w / mw, sy = h / mh;
  const padX = (maxX - minX) * 0.06, padTop = (maxY - minY) * 0.05;
  const cx = Math.max(0, Math.floor((minX - padX) * sx)), cy = Math.max(0, Math.floor((minY - padTop) * sy));
  const cw = Math.min(w, Math.ceil((maxX + padX) * sx)) - cx, ch = Math.min(h, Math.ceil((maxY + 1) * sy)) - cy;
  const crop = document.createElement("canvas");
  crop.width = cw; crop.height = ch;
  crop.getContext("2d")!.drawImage(out, cx, cy, cw, ch, 0, 0, cw, ch);

  const blob = await new Promise<Blob | null>((ok) => crop.toBlob(ok, "image/webp", 0.9));
  // Safari can't make WebP: PNG keeps the transparency too.
  const final = blob && blob.type === "image/webp" ? blob : await new Promise<Blob | null>((ok) => crop.toBlob(ok, "image/png"));
  if (!final) return null;
  const ext = final.type === "image/webp" ? "webp" : "png";
  const file = new File([final], `photo-cutout.${ext}`, { type: final.type });
  return { file, url: URL.createObjectURL(file) };
}
