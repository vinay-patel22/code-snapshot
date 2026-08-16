// Export operations manager

import { CONFIG } from "./file-ops.js";
import { showToast, formatBytes } from "./ui.js";
import { STORAGE_KEYS, setStoredValue } from "./state-management.js";
import { UI_CONSTANTS } from "./constants.js";

export class ExportManager {
  constructor(state, els, uiCallbacks, filterManager) {
    this.state = state;
    this.els = els;
    this.uiCallbacks = uiCallbacks;
    this.filterManager = filterManager;
  }

  async startExport(type) {
    try {
      if (this.state.isExporting) return;

      const exportFiles = this.filterManager.getExportEntries();
      if (!exportFiles.length) {
        showToast(
          this.els.toastContainer,
          "No included files to export",
          "warning",
        );
        return;
      }

      const totalSize = exportFiles.reduce((sum, f) => sum + f.size, 0);

      if (type === "txt" && totalSize > CONFIG.MAX_TXT_EXPORT_SIZE) {
        if (
          !confirm(
            `Large Export Warning\n\nTotal size: ${formatBytes(totalSize)}\n\nCreating a combined TXT file this large may take several minutes, use significant memory, or fail.\n\nConsider using ZIP export instead, or exclude large files.\n\nContinue anyway?`,
          )
        ) {
          return;
        }
      }

      this.state.isExporting = true;
      this.state.exportCancelled = false;
      this.state.abortController = new AbortController();
      const abortSignal = this.state.abortController.signal;
      setStoredValue(STORAGE_KEYS.lastExport, type);
      this.setExportButtonsState(true);
      this.uiCallbacks.showLoading(
        true,
        `Preparing ${exportFiles.length} files...`,
      );

      const { startExportWorker, downloadBlob } = await import("./export.js");
      const blob = await startExportWorker(
        type,
        exportFiles,
        (percent, text) => this.uiCallbacks.updateProgress(percent, text),
        abortSignal,
        this.filterManager.getExportOptions(type, exportFiles),
      );

      const fileNames = {
        txt: "combined-code.txt",
        zip: "code-snapshot.zip",
        ai: "code-snapshot-ai.md",
      };
      const mimeTypes = {
        txt: "text/plain",
        zip: "application/zip",
        ai: "text/markdown",
      };
      downloadBlob(
        blob,
        fileNames[type] || "code-snapshot.txt",
        mimeTypes[type],
      );

      if (!this.state.exportCancelled) {
        showToast(
          this.els.toastContainer,
          `${this.filterManager.getExportLabel(type)} export completed`,
          "success",
        );
      }
    } catch (err) {
      console.error(err);
      if (err.message === "Export cancelled") {
        showToast(this.els.toastContainer, "Export cancelled", "warning");
      } else {
        showToast(
          this.els.toastContainer,
          `Export failed: ${err.message}`,
          "error",
        );
      }
    } finally {
      this.state.isExporting = false;
      this.state.abortController = null;
      // Delay re-enabling buttons to allow download to start
      setTimeout(() => {
      this.setExportButtonsState(false);
      if (!this.state.exportCancelled) this.uiCallbacks.showLoading(false);
    }, UI_CONSTANTS.BUTTON_REENABLE_DELAY_MS);
    }
  }

  async copyToClipboard(type) {
  try {
    if (this.state.isExporting) return;

    const exportFiles = this.filterManager.getExportEntries();
    if (!exportFiles.length) {
      showToast(
        this.els.toastContainer,
        "No included files to export",
        "warning",
      );
      return;
    }

    this.state.isExporting = true;
    this.state.exportCancelled = false;
    this.state.abortController = new AbortController();
    const abortSignal = this.state.abortController.signal;
    this.setExportButtonsState(true);
    this.uiCallbacks.showLoading(
      true,
      `Preparing ${exportFiles.length} files for clipboard...`,
    );

    const { startExportWorker } = await import("./export.js");
    const blob = await startExportWorker(
      type,
      exportFiles,
      (percent, text) => this.uiCallbacks.updateProgress(percent, text),
      abortSignal,
      this.filterManager.getExportOptions(type, exportFiles),
    );

    const text = await blob.text();
    if (!text) {
      throw new Error("Failed to export content");
    }
    await navigator.clipboard.writeText(text);

    if (!this.state.exportCancelled) {
      showToast(
        this.els.toastContainer,
        `${this.filterManager.getExportLabel(type)} copied to clipboard`,
        "success",
      );
    }
  } catch (err) {
    console.error(err);
    if (err.message === "Export cancelled") {
      showToast(this.els.toastContainer, "Copy cancelled", "warning");
    } else if (err.name === "NotAllowedError") {
      showToast(
        this.els.toastContainer,
        "Clipboard permission denied — try downloading instead",
        "error",
      );
    } else {
      showToast(
        this.els.toastContainer,
        `Copy failed: ${err.message}`,
        "error",
      );
    }
  } finally {
      this.state.isExporting = false;
      this.state.abortController = null;
      setTimeout(() => {
        this.setExportButtonsState(false);
        if (!this.state.exportCancelled) this.uiCallbacks.showLoading(false);
      }, UI_CONSTANTS.BUTTON_REENABLE_DELAY_MS);
    }
  }

setExportButtonsState(disabled) {
  const hasExportFiles = this.filterManager.getExportFiles().length > 0;
  const shouldDisable = disabled || !hasExportFiles;
  [
    this.els.downloadTxtBtn,
    this.els.downloadZipBtn,
    this.els.downloadAiBtn,
    this.els.copyAiBtn,
  ].forEach((button) => {
    if (!button) return;
    button.disabled = shouldDisable;
  });

  if (this.els.exportStructureBtn) {
    this.els.exportStructureBtn.disabled =
      disabled || this.state.files.size === 0;
  }
}

  async exportStructure() {
    try {
      if (this.state.isExporting) return;

      const files = this.filterManager.getAllFiles();
      if (!files.length) {
        showToast(
          this.els.toastContainer,
          "No project structure to export",
          "warning",
        );
        return;
      }

      const { buildStructureText, downloadBlob } = await import("./export.js");
      const totalSize = files.reduce((sum, fileInfo) => {
        return sum + (fileInfo.size || 0);
      }, 0);
      const text = buildStructureText(files, {
        generatedAt: new Date().toISOString(),
        totalSize,
      });

      downloadBlob(
        new Blob([text], { type: "text/plain" }),
        "code-snapshot-structure.txt",
        "text/plain",
      );
      showToast(
        this.els.toastContainer,
        "Project structure export completed",
        "success",
      );
    } catch (err) {
      console.error(err);
      showToast(
        this.els.toastContainer,
        `Structure export failed: ${err.message}`,
        "error",
      );
    }
  }

  cancelExport() {
    this.state.exportCancelled = true;
    if (this.state.abortController) {
      this.state.abortController.abort();
    }
    this.state.isExporting = false;
    this.setExportButtonsState(false);
    this.uiCallbacks.showLoading(false);
    showToast(this.els.toastContainer, "Export cancelled", "warning");
  }
}
