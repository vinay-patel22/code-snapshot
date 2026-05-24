// Core app class - orchestrates all managers
import { renderTree, renderFileList, showToast, formatBytes } from "./ui.js";
import { UI_CONSTANTS, EXPORT_CONSTANTS } from "./constants.js";
import { createMemoizedCache } from "./utils.js";
import {
  createAppState,
  STORAGE_KEYS,
  getStoredValue,
} from "./state-management.js";
import { FilterManager } from "./filter-manager.js";
import { FileManager } from "./file-manager.js";
import { ExportManager } from "./export-manager.js";
import { EventHandlers } from "./event-handlers.js";

export class CodeSnapshotApp {
  constructor() {
    this.state = createAppState();
    this.caches = {
      allFiles: createMemoizedCache(),
      visibleFiles: createMemoizedCache(),
      exportFiles: createMemoizedCache(),
      fileCategory: createMemoizedCache(),
      warningPaths: createMemoizedCache(),
    };

    this.els = {
      dropZone: document.getElementById("dropZone"),
      handoffPanel: document.getElementById("handoffPanel"),
      fileListContainer: document.getElementById("fileListContainer"),
      fileList: document.getElementById("fileList"),
      treeContainer: document.getElementById("treeContainer"),
      fileInput: document.getElementById("fileInput"),
      folderInput: document.getElementById("folderInput"),
      fileSearch: document.getElementById("fileSearch"),
      clearSearchBtn: document.getElementById("clearSearchBtn"),
      sortSelect: document.getElementById("sortSelect"),
      categoryChips: document.getElementById("categoryChips"),
      readinessSummary: document.getElementById("readinessSummary"),
      warningList: document.getElementById("warningList"),
      includeAllBtn: document.getElementById("includeAllBtn"),
      excludeWarningsBtn: document.getElementById("excludeWarningsBtn"),
      excludeFilteredBtn: document.getElementById("excludeFilteredBtn"),
      removeSelectedBtn: document.getElementById("removeSelectedBtn"),
      removeFilteredBtn: document.getElementById("removeFilteredBtn"),
      fileCount: document.getElementById("fileCount"),
      totalSize: document.getElementById("totalSize"),
      fileListCount: document.getElementById("fileListCount"),
      selectedCount: document.getElementById("selectedCount"),
      selectFolderBtn: document.getElementById("selectFolderBtn"),
      clearBtn: document.getElementById("clearBtn"),
      downloadTxtBtn: document.getElementById("downloadTxtBtn"),
      downloadZipBtn: document.getElementById("downloadZipBtn"),
      downloadAiBtn: document.getElementById("downloadAiBtn"),
      loading: document.getElementById("loadingOverlay"),
      loadingText: document.getElementById("loadingText"),
      progressBar: document.getElementById("progressBar"),
      cancelBtn: document.getElementById("cancelBtn"),
      toastContainer: document.getElementById("toastContainer"),
      sidebar: document.getElementById("sidebar"),
      resizeHandle: document.getElementById("resizeHandle"),
      collapseAllBtn: document.getElementById("collapseAllBtn"),
      expandAllBtn: document.getElementById("expandAllBtn"),
    };

    // Initialize managers
    this.filterManager = new FilterManager(this.state, this.caches);
    this.fileManager = new FileManager(
      this.state,
      this.caches,
      this.els,
      this.getUICallbacks(),
      this.filterManager,
    );
    this.exportManager = new ExportManager(
      this.state,
      this.els,
      this.getUICallbacks(),
      this.filterManager,
    );
    this.eventHandlers = new EventHandlers(
      this.state,
      this.els,
      {
        fileManager: this.fileManager,
        exportManager: this.exportManager,
        filterManager: this.filterManager,
      },
      this.getUICallbacks(),
    );
  }

  init() {
    this.eventHandlers.restorePreferences();
    this.eventHandlers.bindEvents();
    this.eventHandlers.setupDropZoneEffects();
    this.eventHandlers.initResize();
    this.updateUI();
  }

  getUICallbacks() {
    return {
      showLoading: (show, text) => this.showLoading(show, text),
      hideLoading: () => this.showLoading(false),
      updateProgress: (percent, text) => this.updateProgress(percent, text),
      updateUI: () => this.updateUI(),
      clearCaches: () => this.clearCaches(),
      getStoredValue: (key, fallback) => getStoredValue(key, fallback),
    };
  }

  clearCaches() {
    this.caches.allFiles.clear();
    this.caches.visibleFiles.clear();
    this.caches.exportFiles.clear();
    this.caches.fileCategory.clear();
    this.caches.warningPaths.clear();
  }

  // Convenience methods for storage (delegates to state-management)
  getStoredValue(key, fallback) {
    return getStoredValue(key, fallback);
  }

  setStoredValue(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Local storage can be disabled in private browser contexts.
    }
  }

  // UI methods - kept in app.js as they manage UI state
  showLoading(show, text = "Processing...") {
    this.els.loadingText.textContent = text;
    this.els.progressBar.style.width = "0%";
    this.els.loading.classList.toggle("active", show);
    this.els.cancelBtn.style.display = show ? "block" : "none";
    if (!show) {
      this.els.selectFolderBtn.disabled = false;
    }
  }

  updateProgress(percent, text) {
    this.els.progressBar.style.width = `${Math.min(
      UI_CONSTANTS.PROGRESS_MAX_PERCENT,
      Math.max(UI_CONSTANTS.PROGRESS_MIN_PERCENT, percent),
    )}%`;
    if (text) this.els.loadingText.textContent = text;
  }

  updateUI() {
    const hasFiles = this.state.files.size > 0;
    const allFiles = this.filterManager.getAllFiles();
    const visibleFiles = this.filterManager.getVisibleFiles();
    const visibleMap = new Map(visibleFiles.map((f) => [f.path, f]));
    const exportFiles = this.filterManager.getExportFiles();
    const totalSize = allFiles.reduce((s, f) => s + (f.size || 0), 0);
    const exportSize = exportFiles.reduce((s, f) => s + (f.size || 0), 0);

    this.els.fileCount.textContent = this.state.files.size;
    this.els.totalSize.textContent = formatBytes(totalSize);
    this.els.fileListCount.textContent = hasFiles
      ? `${visibleFiles.length}/${this.state.files.size} shown`
      : "0 items";
    this.els.selectedCount.textContent = `${this.state.selectedPaths.size} selected`;

    this.els.clearBtn.disabled = !hasFiles;
    this.exportManager.setExportButtonsState(this.state.isExporting);

    this.els.dropZone.classList.toggle("has-files", hasFiles);
    this.els.handoffPanel?.classList.toggle(
      "active",
      hasFiles || this.state.ignoredItems.length > 0,
    );
    this.els.fileListContainer.classList.toggle("active", hasFiles);

    renderTree(visibleMap, this.els.treeContainer, {
      emptyTitle: hasFiles ? "No matches" : "No files yet",
      emptyDescription: hasFiles
        ? "Adjust search or filters"
        : 'Drop folders or click "Select Files"',
      excludedPaths: this.state.excludedPaths,
      warnings: this.state.warnings,
    });
    renderFileList(visibleMap, this.els.fileList, {
      emptyTitle: "No matching files",
      emptyDescription: "Adjust search or filters",
      selectedPaths: this.state.selectedPaths,
      excludedPaths: this.state.excludedPaths,
      warnings: this.state.warnings,
    });

    this.updateCategoryChips(allFiles);
    this.updateReadinessPanel(visibleFiles, exportFiles, exportSize);
  }

  updateCategoryChips(files) {
    const counts = {
      all: files.length,
      code: 0,
      docs: 0,
      config: 0,
      assets: 0,
      other: 0,
      warnings: 0,
      excluded: this.state.excludedPaths.size,
    };

    files.forEach((fileInfo) => {
      const category = this.filterManager.getFileCategory(fileInfo);
      if (counts[category] !== undefined) counts[category]++;
    });

    counts.warnings = this.filterManager.getWarningPaths().length;

    this.els.categoryChips
      .querySelectorAll("[data-category]")
      .forEach((chip) => {
        const category = chip.dataset.category;
        const count = counts[category] || 0;
        const countEl = chip.querySelector(".chip-count");
        if (countEl) countEl.textContent = count;
        chip.classList.toggle(
          "active",
          this.state.filter.category === category,
        );
      });
  }

  updateReadinessPanel(visibleFiles, exportFiles, exportSize) {
    if (!this.els.readinessSummary) return;

    const warningPaths = this.filterManager.getWarningPaths();
    const hasWarnings = warningPaths.length > 0;

    let html = "";
    if (hasWarnings) {
      html += `<div class="readiness-item warning">
        <span class="readiness-icon">⚠️</span>
        <span class="readiness-text">${warningPaths.length} warning${warningPaths.length !== 1 ? "s" : ""}</span>
      </div>`;
    }

    if (this.state.excludedPaths.size > 0) {
      html += `<div class="readiness-item info">
        <span class="readiness-icon">📤</span>
        <span class="readiness-text">${this.state.excludedPaths.size} excluded</span>
      </div>`;
    }

    if (exportFiles.length > 0) {
      html += `<div class="readiness-item success">
        <span class="readiness-icon">✓</span>
        <span class="readiness-text">${exportFiles.length} files (${formatBytes(exportSize)})</span>
      </div>`;
    }

    this.els.readinessSummary.innerHTML =
      html || '<div class="readiness-empty">No files</div>';

    if (this.els.warningList && hasWarnings) {
      this.els.warningList.innerHTML = warningPaths
        .slice(0, 10)
        .map(
          (path) => `<div class="warning-item" title="${path}">
            <span class="warning-path">${path}</span>
          </div>`,
        )
        .join("");
      if (warningPaths.length > 10) {
        this.els.warningList.innerHTML += `<div class="warning-item">+${warningPaths.length - 10} more</div>`;
      }
    }
  }

  // Button event handlers - delegate to managers
  selectFiles() {
    this.eventHandlers.selectFiles();
  }

  selectFolder() {
    this.eventHandlers.selectFolder();
  }

  startExport(type) {
    this.exportManager.startExport(type);
  }

  collapseAll() {
    this.eventHandlers.collapseAll();
  }

  expandAll() {
    this.eventHandlers.expandAll();
  }

  cancelExport() {
    this.exportManager.cancelExport();
  }
}
