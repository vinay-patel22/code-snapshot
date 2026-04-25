// File handling utilities

export const DEFAULT_IGNORED = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".nuxt",
  "coverage",
  ".cache",
  ".DS_Store",
  "vendor",
]);

export const CONFIG = {
  MAX_FILE_SIZE: 50 * 1024 * 1024,
  CHUNK_SIZE: 10,
  MAX_TXT_EXPORT_SIZE: 200 * 1024 * 1024,
};

export function shouldIgnore(path, ignoredSet = DEFAULT_IGNORED) {
  return path
    .toLowerCase()
    .split(/[\/\\]/)
    .some((p) => ignoredSet.has(p));
}

export function normalizePath(p) {
  return (p || "").replace(/\\/g, "/");
}

export function getFullPath(file, base = "") {
  const path =
    file.webkitRelativePath || (base ? `${base}/${file.name}` : file.name);
  return normalizePath(path);
}

export async function readFiles(fileList, options = {}) {
  const { maxSize = CONFIG.MAX_FILE_SIZE, ignored = DEFAULT_IGNORED } = options;

  const added = [];

  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    if (file.size > maxSize) continue;

    const path = getFullPath(file);
    if (shouldIgnore(path, ignored)) continue;

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

  return added;
}

export async function processDirectoryEntry(
  entry,
  path = "",
  ignored = DEFAULT_IGNORED,
) {
  if (!entry || shouldIgnore(entry.name, ignored)) return [];

  const currentPath = path ? `${path}/${entry.name}` : entry.name;
  if (shouldIgnore(currentPath, ignored)) return [];

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
