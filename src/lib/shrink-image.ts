/**
 * Browser side of image uploads. Phone photos are often 5-12 MB, but a request to
 * the server can carry at most ~4 MB (Vercel's limit), so big photos are scaled
 * down here first; the server then does the real compression (lib/server/images.ts).
 * Uses the browser's own decoder and canvas: no library, nothing to download.
 */
const SEND_LIMIT = 3.5 * 1024 * 1024;
const MAX_SIDE = 2560;

export async function shrinkForUpload(file: File): Promise<File> {
  if (file.type === "image/gif") return file; // keep animation; GIFs this large are rare
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }); } catch { return file; }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  if (file.size <= SEND_LIMIT && scale === 1) { bitmap.close(); return file; }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.9, 0.8, 0.65]) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
    if (blob && blob.size <= SEND_LIMIT) return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  }
  return file; // still too big: the server will say so
}
