import path from "node:path";

/**
 * Resout un nom de fichier dans un dossier en garantissant qu'il n'y a aucun
 * "path traversal" (../, absolut, etc.). Retourne null si le nom est suspect.
 */
export function resolveWithin(dir: string, fileName: string): string | null {
  if (typeof fileName !== "string" || fileName.length === 0 || fileName.length > 200) return null;
  if (fileName.includes("..") || fileName.includes("/") || fileName.includes("\\") || fileName.includes("\0")) {
    return null;
  }
  const base = path.resolve(dir);
  const target = path.resolve(base, fileName);
  if (!target.startsWith(base + path.sep)) return null;
  return target;
}
