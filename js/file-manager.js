// File operations manager

import {
  DEFAULT_IGNORED,
  CONFIG,
  SECURITY_FILE_EXTENSIONS,
  readFiles,
  processDirectoryEntry,
} from "./file-ops.js";
import { showToast, formatBytes } from "./ui.js";
import { UI_CONSTANTS, EXPORT_CONSTANTS } from "./constants.js";

const SECRET_PATH_RE =
  /(^|\/)(\.env|id_rsa|id_dsa|credentials|secrets?|private[-_]?key|service[-_]?account|keystore|token)(\.|\/|$)/i;
const SECRET_VALUE_RE =
  /(api[_-]?key|secret|password|passwd|token|private[_-]?key|client[_-]?secret)\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{12,}/i;
const PRIVATE_KEY_RE = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;

function getExtension(path) {
  const cleanPath = path.split("?")[0].toLowerCase();
  const filename = cleanPath.split("/").pop() || "";
  const dotIndex = filename.lastIndexOf(".");
  return dotIndex > 0 ? filename.substring(dotIndex) : "";
}

export class FileManager {
  constructor(state, caches, els, uiCallbacks, filterManager) {
    this.state = state;
    this.caches = caches;
    this.els = els;
    this.uiCallbacks = uiCallbacks;
    this.filterManager = filterManager;
  }

  async handleFiles(fileList, inputEl) {
    try {
      if (!fileList?.length) {
        this.uiCallbacks.showLoading(false);
        return;
      }

      this.uiCallbacks.showLoading(true, "Reading files...");
      this.uiCallbacks.clearCaches();

      let fileCount = 0;
      const onProgress = (count) => {
        fileCount = count;
        const progressPercent = Math.min(
          EXPORT_CONSTANTS.PROGRESS_PERCENT_READING,
          Math.log10(count + 1) * 10,
        );
        this.uiCallbacks.updateProgress(
          progressPercent,
          `Reading: ${count.toLocaleString()} files found...`,
        );
      };

      const added = await readFiles(fileList, {
        ignored: DEFAULT_IGNORED,
        onProgress,
      });
      this.mergeIgnoredItems(added.skipped || []);
      added.forEach((f) => this.state.files.set(f.path, f));

      if (added.length) {
        this.uiCallbacks.updateProgress(55, "Scanning locally...");
        await this.scanFiles(added);
      }

      this.uiCallbacks.showLoading(false);
      this.uiCallbacks.updateUI();
      setTimeout(() => {
        if (inputEl) inputEl.value = "";
      }, UI_CONSTANTS.INPUT_CLEAR_DELAY_MS);

      this.showImportToast("Added", added.length, added.skipped?.length || 0);
    } catch (error) {
      console.error("Error handling files:", error);
      this.uiCallbacks.showLoading(false);
      showToast(
        this.els.toastContainer,
        `Error reading files: ${error.message}`,
        "error",
      );
    }
  }

  async handleDrop(e) {
    try {
      const dt = e.dataTransfer;
      if (!dt?.items?.length && !dt?.files?.length) return;

      this.els.selectFolderBtn.disabled = true;
      this.uiCallbacks.showLoading(true, "Processing drop...");
      this.uiCallbacks.clearCaches();
      let added = [];
      let skipped = [];
      let fileCount = 0;

      const onProgress = (count) => {
        fileCount = count;
        const progressPercent = Math.min(
          EXPORT_CONSTANTS.PROGRESS_PERCENT_READING,
          Math.log10(count + 1) * 10,
        );
        this.uiCallbacks.updateProgress(
          progressPercent,
          `Reading: ${count.toLocaleString()} files found...`,
        );
      };

      if (dt.items?.[0]?.webkitGetAsEntry) {
        const entries = Array.from(dt.items)
          .filter((i) => i.kind === "file")
          .map((i) => i.webkitGetAsEntry())
          .filter(Boolean);

        for (const entry of entries) {
          const entrySkipped = [];
          const files = await processDirectoryEntry(
            entry,
            "",
            DEFAULT_IGNORED,
            {
              skipped: entrySkipped,
              onProgress,
            },
          );
          skipped = skipped.concat(entrySkipped);
          added = added.concat(files);
        }
      }

      if (!added.length && dt.files?.length) {
        added = await readFiles(dt.files, {
          ignored: DEFAULT_IGNORED,
          onProgress,
        });
        skipped = skipped.concat(added.skipped || []);
      }

      this.mergeIgnoredItems(skipped);
      added.forEach((f) => this.state.files.set(f.path, f));

      if (added.length) {
        this.uiCallbacks.updateProgress(55, "Scanning locally...");
        await this.scanFiles(added);
      }

      this.uiCallbacks.showLoading(false);
      this.uiCallbacks.updateUI();
      this.showImportToast("Imported", added.length, skipped.length);
    } catch (error) {
      console.error("Error handling drop:", error);
      this.uiCallbacks.showLoading(false);
      showToast(
        this.els.toastContainer,
        `Error processing drop: ${error.message}`,
        "error",
      );
    }
  }

  showImportToast(action, addedCount, skippedCount) {
    if (addedCount) {
      const suffix = skippedCount ? `, ${skippedCount} ignored` : "";
      showToast(
        this.els.toastContainer,
        `${action} ${addedCount} file${addedCount !== 1 ? "s" : ""}${suffix}`,
        skippedCount ? "info" : "success",
      );
    } else if (!this.state.files.size) {
      showToast(
        this.els.toastContainer,
        skippedCount
          ? `${skippedCount} item${skippedCount !== 1 ? "s were" : " was"} ignored by default rules`
          : "No valid files found",
        skippedCount ? "warning" : "error",
      );
    }
  }

  mergeIgnoredItems(items) {
    if (!items?.length) return;
    const existing = new Map(
      this.state.ignoredItems.map((item) => [
        `${item.path}:${item.reason}`,
        item,
      ]),
    );
    for (const item of items) {
      existing.set(`${item.path}:${item.reason}`, item);
    }
    this.state.ignoredItems = Array.from(existing.values()).slice(
      -UI_CONSTANTS.IGNORED_ITEMS_MAX,
    );
  }

  async scanFiles(files) {
    try {
      for (let i = 0; i < files.length; i++) {
        const fileInfo = files[i];
        const warnings = await this.getFileSafetyWarnings(fileInfo);
        if (warnings.length) {
          this.state.warnings.set(fileInfo.path, warnings);
        } else {
          this.state.warnings.delete(fileInfo.path);
        }
        if (i % UI_CONSTANTS.SCAN_FILES_YIELD_INTERVAL === 0) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
      this.caches.warningPaths.clear();
    } catch (error) {
      console.error("Error scanning files:", error);
    }
  }

  async getFileSafetyWarnings(fileInfo) {
    const warnings = [];
    const lowerPath = fileInfo.path.toLowerCase();
    const extension = getExtension(lowerPath);
    const isAsset = this.filterManager.isBinaryLikeFile(fileInfo);

    if (fileInfo.size === 0) {
      warnings.push({
        type: "empty",
        severity: "info",
        message: "Empty file",
      });
    }

    if (fileInfo.size > CONFIG.LARGE_FILE_WARNING_SIZE) {
      warnings.push({
        type: "large",
        severity: "warning",
        message: `Large file (${formatBytes(fileInfo.size)})`,
      });
    }

    if (isAsset) {
      warnings.push({
        type: "binary",
        severity: "warning",
        message: "Binary or asset-like file",
      });
    }

    if (
      SECURITY_FILE_EXTENSIONS.has(extension) ||
      SECRET_PATH_RE.test(lowerPath)
    ) {
      warnings.push({
        type: "secret-path",
        severity: "error",
        message: "Sensitive-looking path",
      });
    }

    if (
      !isAsset &&
      fileInfo.size > 0 &&
      fileInfo.size <= CONFIG.SAFETY_SCAN_TEXT_LIMIT
    ) {
      try {
        const sample = await fileInfo.file
          .slice(0, CONFIG.SAFETY_SCAN_TEXT_LIMIT)
          .text();
        if (sample.includes("\0")) {
          warnings.push({
            type: "unsupported",
            severity: "warning",
            message: "Unsupported binary-like content",
          });
        } else if (
          SECRET_VALUE_RE.test(sample) ||
          PRIVATE_KEY_RE.test(sample)
        ) {
          warnings.push({
            type: "secret-content",
            severity: "error",
            message: "Potential secret in file contents",
          });
        }
      } catch {
        warnings.push({
          type: "unsupported",
          severity: "warning",
          message: "Unable to preview safely",
        });
      }
    }

    return warnings;
  }

  removeFile(path) {
    this.state.files.delete(path);
    this.state.warnings.delete(path);
    this.state.selectedPaths.delete(path);
    this.state.excludedPaths.delete(path);
    this.uiCallbacks.clearCaches();
    this.uiCallbacks.updateUI();
    showToast(this.els.toastContainer, "File removed", "success");
  }

  clearAll() {
    this.state.files.clear();
    this.state.warnings.clear();
    this.state.ignoredItems = [];
    this.state.selectedPaths.clear();
    this.state.excludedPaths.clear();
    this.uiCallbacks.clearCaches();
    this.uiCallbacks.updateUI();
    showToast(this.els.toastContainer, "Cleared all files", "success");
  }

  includeAll() {
    const count = this.state.excludedPaths.size;
    this.state.excludedPaths.clear();
    this.uiCallbacks.updateUI();
    showToast(
      this.els.toastContainer,
      `Included ${count} file${count !== 1 ? "s" : ""}`,
      "success",
    );
  }

  excludeWarningFiles() {
    const paths = this.filterManager.getWarningPaths();
    paths.forEach((path) => this.state.excludedPaths.add(path));
    this.state.selectedPaths.clear();
    this.uiCallbacks.updateUI();
    showToast(
      this.els.toastContainer,
      `Excluded ${paths.length} warning file${paths.length !== 1 ? "s" : ""}`,
      "warning",
    );
  }

  excludeFilteredFiles() {
    const visibleIncluded = this.filterManager
      .getVisibleFiles()
      .filter((fileInfo) => !this.state.excludedPaths.has(fileInfo.path));
    visibleIncluded.forEach((fileInfo) =>
      this.state.excludedPaths.add(fileInfo.path),
    );
    this.state.selectedPaths.clear();
    this.uiCallbacks.updateUI();
    showToast(
      this.els.toastContainer,
      `Excluded ${visibleIncluded.length} filtered file${visibleIncluded.length !== 1 ? "s" : ""}`,
      "info",
    );
  }

  removeSelectedFiles() {
    const count = this.state.selectedPaths.size;
    if (!count) return;
    Array.from(this.state.selectedPaths).forEach((path) =>
      this.removeFileSilently(path),
    );
    this.state.selectedPaths.clear();
    this.uiCallbacks.clearCaches();
    this.uiCallbacks.updateUI();
    showToast(
      this.els.toastContainer,
      `Removed ${count} selected file${count !== 1 ? "s" : ""}`,
      "success",
    );
  }

  removeFilteredFiles() {
    const visibleFiles = this.filterManager.getVisibleFiles();
    if (!visibleFiles.length) return;
    if (
      visibleFiles.length > 20 &&
      !confirm(
        `Remove ${visibleFiles.length} filtered files from the current snapshot?`,
      )
    ) {
      return;
    }
    visibleFiles.forEach((fileInfo) => this.removeFileSilently(fileInfo.path));
    this.uiCallbacks.clearCaches();
    this.uiCallbacks.updateUI();
    showToast(
      this.els.toastContainer,
      `Removed ${visibleFiles.length} filtered file${visibleFiles.length !== 1 ? "s" : ""}`,
      "success",
    );
  }

  removeFileSilently(path) {
    this.state.files.delete(path);
    this.state.warnings.delete(path);
    this.state.selectedPaths.delete(path);
    this.state.excludedPaths.delete(path);
  }
}
