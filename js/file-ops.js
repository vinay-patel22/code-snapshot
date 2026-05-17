// File handling utilities

import { DEFAULT_IGNORED, getIgnoreReason, shouldIgnore } from "./ignore-rules.js";

export {
  DEFAULT_IGNORED,
  ASSET_FILE_EXTENSIONS,
  STYLE_FILE_EXTENSIONS,
  SECURITY_FILE_EXTENSIONS,
  getIgnoreReason,
  shouldIgnore,
} from "./ignore-rules.js";

export const CONFIG = {
  MAX_FILE_SIZE: 50 * 1024 * 1024,
  CHUNK_SIZE: 10,
  MAX_TXT_EXPORT_SIZE: 200 * 1024 * 1024,
  LARGE_FILE_WARNING_SIZE: 5 * 1024 * 1024,
  SAFETY_SCAN_TEXT_LIMIT: 64 * 1024,
};

export function normalizePath(p) {
  return (p || "").replace(/\\/g, "/");
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / 1024 ** i).toFixed(i ? 1 : 0) + " " + units[i];
}

export function getFullPath(file, base = "") {
  const path =
    file.webkitRelativePath || (base ? `${base}/${file.name}` : file.name);
  return normalizePath(path);
}

export async function readFiles(fileList, options = {}) {
  const { maxSize = CONFIG.MAX_FILE_SIZE, ignored = DEFAULT_IGNORED } = options;

  const added = [];
  const skipped = [];

  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    const path = getFullPath(file);

    if (file.size > maxSize) {
      skipped.push({
        path,
        name: file.name,
        size: file.size || 0,
        reason: `Larger than ${formatBytes(maxSize)} file limit`,
        category: "large",
      });
      continue;
    }

    const ignore = getIgnoreReason(path, ignored);
    if (ignore.ignored) {
      skipped.push({
        path,
        name: file.name,
        size: file.size || 0,
        reason: ignore.reason,
        category: ignore.category,
      });
      continue;
    }

    added.push({
      file,
      path,
      name: file.name,
      size: file.size || 0,
    });

    if (i % 100 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  added.skipped = skipped;
  return added;
}

export async function processDirectoryEntry(
  entry,
  path = "",
  ignored = DEFAULT_IGNORED,
  options = {},
) {
  if (!entry) return [];

  const skipped = options.skipped || [];
  const currentPath = path ? `${path}/${entry.name}` : entry.name;
  const ignore = getIgnoreReason(currentPath, ignored);
  if (ignore.ignored) {
    skipped.push({
      path: currentPath,
      name: entry.name,
      size: 0,
      reason: ignore.reason,
      category: ignore.category,
    });
    return [];
  }

  if (entry.isFile) {
    return new Promise((resolve) => {
      entry.file(
        (file) => {
          resolve([
            {
              file,
              path: currentPath,
              name: file.name,
              size: file.size || 0,
            },
          ]);
        },
        () => resolve([]),
      );
    });
  }

  if (entry.isDirectory) {
    const reader = entry.createReader();
    return new Promise((resolve) => {
      let allFiles = [];
      const read = () => {
        reader.readEntries(
          async (entries) => {
            if (!entries.length) return resolve(allFiles);
            for (const e of entries) {
              const files = await processDirectoryEntry(
                e,
                currentPath,
                ignored,
                options,
              );
              allFiles = allFiles.concat(files);
            }
            read();
          },
          () => resolve(allFiles),
        );
      };
      read();
    });
  }

  return [];
}
