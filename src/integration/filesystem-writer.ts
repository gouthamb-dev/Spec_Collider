import type { Artifact } from '../types/domain.ts';
import type { ExportResult } from '../types/ui.ts';

/** Filesystem operations interface for dependency injection (testing & runtime). */
export interface FsOps {
  mkdir(path: string, options: { recursive: boolean }): Promise<string | undefined>;
  writeFile(path: string, content: string, encoding: string): Promise<void>;
}

/**
 * Creates FsOps backed by Node.js fs/promises.
 * Only call this in a Node.js context (server, Electron main, tests).
 * Never import this in client-side browser code.
 */
export async function createNodeFsOps(): Promise<FsOps> {
  // Dynamic import hidden from TypeScript's module analysis (browser build won't call this)
  const modulePath = 'node:fs/promises';
  const fs = await import(/* @vite-ignore */ modulePath) as { mkdir: Function; writeFile: Function };
  return {
    mkdir: (path: string, options: { recursive: boolean }) => fs.mkdir(path, options),
    writeFile: (path: string, content: string, encoding: string) => fs.writeFile(path, content, encoding),
  };
}

/**
 * Joins path segments with '/' separator (browser-safe, no Node.js dependency).
 */
function joinPath(...segments: string[]): string {
  return segments.join('/').replace(/\/+/g, '/');
}

/**
 * Returns the directory portion of a path (browser-safe dirname).
 */
function dirName(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx > 0 ? path.slice(0, idx) : '.';
}

/**
 * Determines the filesystem path for an artifact based on its type.
 * - steering_rules → .kiro/steering/steering-rules.md
 * - all others → .kiro/specs/{type}.md
 */
export function getArtifactPath(artifact: Artifact, basePath: string): string {
  if (artifact.type === 'steering_rules') {
    return joinPath(basePath, '.kiro', 'steering', 'steering-rules.md');
  }
  return joinPath(basePath, '.kiro', 'specs', `${artifact.type}.md`);
}

/**
 * Exports artifacts to the filesystem, creating directories as needed.
 * Handles per-file write failures independently — a single failure does not
 * prevent other files from being written.
 *
 * The caller MUST provide an FsOps implementation (e.g. from createNodeFsOps()
 * in a Node.js context, or a custom implementation for Electron/Tauri).
 */
export async function exportToFilesystem(
  artifacts: Artifact[],
  basePath: string,
  fsOps: FsOps,
): Promise<ExportResult> {
  const writtenFiles: string[] = [];
  const failedFiles: { path: string; error: string }[] = [];

  for (const artifact of artifacts) {
    const filePath = getArtifactPath(artifact, basePath);

    try {
      await fsOps.mkdir(dirName(filePath), { recursive: true });
      await fsOps.writeFile(filePath, artifact.content, 'utf-8');
      writtenFiles.push(filePath);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      failedFiles.push({ path: filePath, error: errorMessage });
    }
  }

  return {
    success: failedFiles.length === 0,
    writtenFiles,
    failedFiles,
  };
}
