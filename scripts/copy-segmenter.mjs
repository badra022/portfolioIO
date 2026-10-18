// Copies the photo background remover's WebAssembly runtime (lib/cutout.ts) from
// node_modules into public/segment/, so it is served from our own domain. Runs on
// install; the model file (selfie_segmenter.tflite) is committed next to it.
import fs from "node:fs";
import path from "node:path";

const from = path.join("node_modules", "@mediapipe", "tasks-vision", "wasm");
const to = path.join("public", "segment");
if (!fs.existsSync(from)) process.exit(0);
fs.mkdirSync(to, { recursive: true });
for (const f of ["vision_wasm_internal.js", "vision_wasm_internal.wasm", "vision_wasm_nosimd_internal.js", "vision_wasm_nosimd_internal.wasm"]) {
  fs.copyFileSync(path.join(from, f), path.join(to, f));
}
