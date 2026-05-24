// File filtering and sorting logic

import { ASSET_FILE_EXTENSIONS } from "./file-ops.js";

const CODE_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".html",
  ".htm",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".json",
  ".py",
  ".rb",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".swift",
  ".c",
  ".cc",
  ".cpp",
  ".h",
  ".hpp",
  ".cs",
  ".php",
  ".sh",
  ".ps1",
  ".sql",
  ".vue",
  ".svelte",
]);

const DOC_EXTENSIONS = new Set([".md", ".mdx", ".txt", ".rst", ".adoc"]);
const CONFIG_EXTENSIONS = new Set([
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".config",
  ".conf",
  ".xml",
]);

function getExtension(path) {
  const cleanPath = path.split("?")[0].toLowerCase();
  const filename = cleanPath.split("/").pop() || "";
  const dotIndex = filename.lastIndexOf(".");
  return dotIndex > 0 ? filename.substring(dotIndex) : "";
}

export class FilterManager {
  constructor(state, caches) {
    this.state = state;
    this.caches = caches;
  }

  getAllFiles() {
    const cacheKey = this.state.files.size;
    if (this.caches.allFiles.has(cacheKey)) {
      return this.caches.allFiles.get(cacheKey);
    }
    const result = Array.from(this.state.files.values()).sort((a, b) =>
      a.path.localeCompare(b.path),
    );
    this.caches.allFiles.set(cacheKey, result);
    return result;
  }

  getVisibleFiles() {
    const cacheKey = `${this.state.files.size}|${this.state.filter.query}|${this.state.filter.category}|${this.state.filter.sort}`;
    if (this.caches.visibleFiles.has(cacheKey)) {
      return this.caches.visibleFiles.get(cacheKey);
    }
    const query = this.state.filter.query;
    const category = this.state.filter.category;
    const files = this.getAllFiles().filter((fileInfo) => {
      const matchesQuery =
        !query ||
        fileInfo.path.toLowerCase().includes(query) ||
        fileInfo.name.toLowerCase().includes(query);
      if (!matchesQuery) return false;

      if (category === "all") return true;
      if (category === "warnings")
        return this.state.warnings.has(fileInfo.path);
      if (category === "excluded")
        return this.state.excludedPaths.has(fileInfo.path);
      return this.getFileCategory(fileInfo) === category;
    });

    const result = this.sortFiles(files);
    this.caches.visibleFiles.set(cacheKey, result);
    return result;
  }

  sortFiles(files) {
    const sorted = [...files];
    const sort = this.state.filter.sort;
    sorted.sort((a, b) => {
      if (sort === "path-desc") return b.path.localeCompare(a.path);
      if (sort === "size-desc") return (b.size || 0) - (a.size || 0);
      if (sort === "size-asc") return (a.size || 0) - (b.size || 0);
      if (sort === "type-asc") {
        const byType = this.getFileCategory(a).localeCompare(
          this.getFileCategory(b),
        );
        return byType || a.path.localeCompare(b.path);
      }
      return a.path.localeCompare(b.path);
    });
    return sorted;
  }

  getExportFiles() {
    const cacheKey = `${this.state.files.size}|${this.state.excludedPaths.size}`;
    if (this.caches.exportFiles.has(cacheKey)) {
      return this.caches.exportFiles.get(cacheKey);
    }
    const result = this.getAllFiles().filter(
      (fileInfo) => !this.state.excludedPaths.has(fileInfo.path),
    );
    this.caches.exportFiles.set(cacheKey, result);
    return result;
  }

  getExportEntries() {
    return this.getExportFiles().map((fileInfo) => ({
      ...fileInfo,
      category: this.getFileCategory(fileInfo),
      warnings: this.state.warnings.get(fileInfo.path) || [],
    }));
  }

  getWarningPaths() {
    const cacheKey = `${this.state.warnings.size}`;
    if (this.caches.warningPaths.has(cacheKey)) {
      return this.caches.warningPaths.get(cacheKey);
    }
    const result = Array.from(this.state.warnings.entries())
      .filter(([, warnings]) =>
        warnings.some((warning) => warning.severity !== "info"),
      )
      .map(([path]) => path);
    this.caches.warningPaths.set(cacheKey, result);
    return result;
  }

  getFileCategory(fileInfo) {
    const cacheKey = fileInfo.path;
    if (this.caches.fileCategory.has(cacheKey)) {
      return this.caches.fileCategory.get(cacheKey);
    }
    const extension = getExtension(fileInfo.path);
    let result;
    if (this.isBinaryLikeFile(fileInfo)) {
      result = "assets";
    } else if (DOC_EXTENSIONS.has(extension)) {
      result = "docs";
    } else if (CONFIG_EXTENSIONS.has(extension)) {
      result = "config";
    } else if (CODE_EXTENSIONS.has(extension)) {
      result = "code";
    } else {
      result = "other";
    }
    this.caches.fileCategory.set(cacheKey, result);
    return result;
  }

  isBinaryLikeFile(fileInfo) {
    const extension = getExtension(fileInfo.path);
    return (
      ASSET_FILE_EXTENSIONS.has(extension) ||
      /^(image|video|audio|font)\//.test(fileInfo.file?.type || "")
    );
  }

  getExportOptions(type, files) {
    const warningCount = files.reduce((sum, fileInfo) => {
      return sum + (this.state.warnings.get(fileInfo.path)?.length || 0);
    }, 0);

    return {
      type,
      generatedAt: new Date().toISOString(),
      totalFiles: this.state.files.size,
      includedFiles: files.length,
      excludedFiles: this.state.excludedPaths.size,
      ignoredItems: this.state.ignoredItems.length,
      warningCount,
      filters: { ...this.state.filter },
      exportSize: files.reduce(
        (sum, fileInfo) => sum + (fileInfo.size || 0),
        0,
      ),
    };
  }

  getExportLabel(type) {
    if (type === "ai") return "AI Snapshot";
    if (type === "zip") return "ZIP";
    return "TXT";
  }
}
