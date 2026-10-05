/**
 * Image fields are resolved to absolute URLs on the server before rendering
 * (see lib/server/assets.ts), so components can use the value directly.
 */
export function asset(file: string): string {
  return file;
}
