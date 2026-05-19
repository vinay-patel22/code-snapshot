// Core app class
import {
  ASSET_FILE_EXTENSIONS,
  CONFIG,
  DEFAULT_IGNORED,
  SECURITY_FILE_EXTENSIONS,
  readFiles,
  processDirectoryEntry,
} from "./file-ops.js";
import { renderTree, renderFileList, showToast, formatBytes } from "./ui.js";

const STORAGE_KEYS = {
  sidebarWidth: "codeSnapshot.sidebarWidth",
  sort: "codeSnapshot.sort",
  lastExport: "codeSnapshot.lastExport",
};

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

const SECRET_PATH_RE =
  /(^|\/)(\.env|id_rsa|id_dsa|credentials|secrets?|private[-_]?key|service[-_]?account|keystore|token)(\.|\/|$)/i;
const SECRET_VALUE_RE =
  /(api[_-]?key|secret|password|passwd|token|private[_-]?key|client[_-]?secret)\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{12,}/i;
const PRIVATE_KEY_RE = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;

export class CodeSnapshotApp {
  constructor() {
    this.files = new Map();
    this.warnings = new Map();
    this.ignoredItems = [];
    this.selectedPaths = new Set();
    this.excludedPaths = new Set();
    this.isExporting = false;
    this.exportCancelled = false;
    this.abortController = null;
    this.filter = {
      query: "",
      category: "all",
      sort: this.getStoredValue(STORAGE_KEYS.sort, "path-asc"),
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
  }

  init() {
    this.restorePreferences();
    this.bindEvents();
    this.setupDropZoneEffects();
    this.initResize();
    this.updateUI();
  }

  bindEvents() {
    this.els.fileInput?.addEventListener("change", (e) => {
      this.handleFiles(e.target.files, this.els.fileInput);
    });

    this.els.folderInput?.addEventListener("change", (e) => {
      this.handleFiles(e.target.files, this.els.folderInput);
    });

    this.els.clearBtn.onclick = () => this.clearAll();

    this.els.fileSearch?.addEventListener("input", (e) => {
      this.filter.query = e.target.value.trim().toLowerCase();
      this.updateUI();
    });

    this.els.clearSearchBtn?.addEventListener("click", () => {
      this.filter.query = "";
      this.els.fileSearch.value = "";
      this.updateUI();
    });

    this.els.sortSelect?.addEventListener("change", (e) => {
      this.filter.sort = e.target.value;
      this.setStoredValue(STORAGE_KEYS.sort, this.filter.sort);
      this.updateUI();
    });

    this.els.categoryChips?.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-category]");
      if (!chip) return;
      this.filter.category = chip.dataset.category || "all";
      this.updateUI();
    });

    this.els.includeAllBtn?.addEventListener("click", () => this.includeAll());
    this.els.excludeWarningsBtn?.addEventListener("click", () =>
      this.excludeWarningFiles(),
    );
    this.els.excludeFilteredBtn?.addEventListener("click", () =>
      this.excludeFilteredFiles(),
    );
    this.els.removeSelectedBtn?.addEventListener("click", () =>
      this.removeSelectedFiles(),
    );
    this.els.removeFilteredBtn?.addEventListener("click", () =>
      this.removeFilteredFiles(),
    );

    this.els.fileList?.addEventListener("click", (e) =>
      this.handleFileListClick(e),
    );
    this.els.fileList?.addEventListener("change", (e) =>
      this.handleFileListChange(e),
    );
    this.els.fileList?.addEventListener("keydown", (e) =>
      this.handleFileListKeydown(e),
    );

    document.addEventListener("keydown", (e) => this.handleGlobalKeydown(e));
  }

  restorePreferences() {
    if (this.els.sortSelect) {
      this.els.sortSelect.value = this.filter.sort;
    }

    const savedWidth = Number(
      this.getStoredValue(STORAGE_KEYS.sidebarWidth, ""),
    );
    if (savedWidth && this.els.sidebar) {
      const width = Math.max(280, Math.min(500, savedWidth));
      this.els.sidebar.style.width = `${width}px`;
      document.documentElement.style.setProperty(
        "--sidebar-width",
        `${width}px`,
      );
    }
  }

  initResize() {
    const handle = this.els.resizeHandle;
    const sidebar = this.els.sidebar;
    if (!handle || !sidebar) return;

    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    const onMouseDown = (e) => {
      isResizing = true;
      handle.classList.add("resizing");
      startX = e.clientX;
      startWidth = sidebar.offsetWidth;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      e.preventDefault();
    };

    const onMouseMove = (e) => {
      if (!isResizing) return;
      const newWidth = Math.max(
        280,
        Math.min(500, startWidth + (e.clientX - startX)),
      );
      sidebar.style.width = `${newWidth}px`;
      document.documentElement.style.setProperty(
        "--sidebar-width",
        `${newWidth}px`,
      );
    };

    const onMouseUp = () => {
      if (!isResizing) return;
      isResizing = false;
      handle.classList.remove("resizing");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      this.setStoredValue(
        STORAGE_KEYS.sidebarWidth,
        String(sidebar.offsetWidth),
      );
    };

    handle.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  setupDropZoneEffects() {
    const zone = this.els.dropZone;
    if (!zone) return;

    zone.addEventListener("mousemove", (e) => {
      const rect = zone.getBoundingClientRect();
      zone.style.setProperty("--x", `${e.clientX - rect.left}px`);
      zone.style.setProperty("--y", `${e.clientY - rect.top}px`);
    });

    const onDrag = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const onEnter = (e) => {
      onDrag(e);
      zone.classList.add("drag-over");
    };
    const onLeave = (e) => {
      onDrag(e);
      setTimeout(() => {
        if (!zone.matches(":hover")) zone.classList.remove("drag-over");
      }, 15);
    };
    const onDrop = async (e) => {
      onDrag(e);
      zone.classList.remove("drag-over");
      await this.handleDrop(e);
    };

    [zone, this.els.fileListContainer].forEach((el) => {
      el?.addEventListener("dragenter", onEnter);
      el?.addEventListener("dragover", onDrag);
      el?.addEventListener("dragleave", onLeave);
      el?.addEventListener("drop", onDrop);
    });
  }

  selectFiles() {
    this.els.fileInput.value = "";
    setTimeout(() => this.els.fileInput.click(), 50);
  }

  selectFolder() {
    if (!this.els.folderInput) {
      showToast(
        this.els.toastContainer,
        "Folder selection is not supported",
        "warning",
      );
      return;
    }
    this.els.selectFolderBtn.disabled = true;
    this.showLoading(true, "Opening folder picker...");
    this.els.folderInput.value = "";
    setTimeout(() => this.els.folderInput.click(), 50);
  }

  async handleFiles(fileList, inputEl) {
    if (!fileList?.length) {
      this.showLoading(false);
      return;
    }

    this.showLoading(true, "Reading files...");

    let fileCount = 0;
    const onProgress = (count) => {
      fileCount = count;
      const progressPercent = Math.min(
        50,
        Math.log10(count + 1) * 10,
      );
      this.updateProgress(
        progressPercent,
        `Reading: ${count.toLocaleString()} files found...`,
      );
    };

    const added = await readFiles(fileList, {
      ignored: DEFAULT_IGNORED,
      onProgress,
    });
    this.mergeIgnoredItems(added.skipped || []);
    added.forEach((f) => this.files.set(f.path, f));

    if (added.length) {
      this.updateProgress(55, "Scanning locally...");
      await this.scanFiles(added);
    }

    this.showLoading(false);
    this.updateUI();
    setTimeout(() => {
      if (inputEl) inputEl.value = "";
    }, 100);

    this.showImportToast("Added", added.length, added.skipped?.length || 0);
  }

  async handleDrop(e) {
    const dt = e.dataTransfer;
    if (!dt?.items?.length && !dt?.files?.length) return;

    this.els.selectFolderBtn.disabled = true;
    this.showLoading(true, "Processing drop...");
    let added = [];
    let skipped = [];
    let fileCount = 0;

    const onProgress = (count) => {
      fileCount = count;
      const progressPercent = Math.min(
        50,
        Math.log10(count + 1) * 10,
      );
      this.updateProgress(
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
        const files = await processDirectoryEntry(entry, "", DEFAULT_IGNORED, {
          skipped: entrySkipped,
          onProgress,
        });
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
    added.forEach((f) => this.files.set(f.path, f));

    if (added.length) {
      this.updateProgress(55, "Scanning locally...");
      await this.scanFiles(added);
    }

    this.showLoading(false);
    this.updateUI();
    this.showImportToast("Imported", added.length, skipped.length);
  }

  showImportToast(action, addedCount, skippedCount) {
    if (addedCount) {
      const suffix = skippedCount ? `, ${skippedCount} ignored` : "";
      showToast(
        this.els.toastContainer,
        `${action} ${addedCount} file${addedCount !== 1 ? "s" : ""}${suffix}`,
        skippedCount ? "info" : "success",
      );
    } else if (!this.files.size) {
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
      this.ignoredItems.map((item) => [`${item.path}:${item.reason}`, item]),
    );
    for (const item of items) {
      existing.set(`${item.path}:${item.reason}`, item);
    }
    this.ignoredItems = Array.from(existing.values()).slice(-1000);
  }

  async scanFiles(files) {
    for (let i = 0; i < files.length; i++) {
      const fileInfo = files[i];
      const warnings = await this.getFileSafetyWarnings(fileInfo);
      if (warnings.length) {
        this.warnings.set(fileInfo.path, warnings);
      } else {
        this.warnings.delete(fileInfo.path);
      }
      if (i % 25 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  }

  async getFileSafetyWarnings(fileInfo) {
    const warnings = [];
    const lowerPath = fileInfo.path.toLowerCase();
    const extension = getExtension(lowerPath);
    const isAsset = this.isBinaryLikeFile(fileInfo);

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

  updateUI() {
    const hasFiles = this.files.size > 0;
    const allFiles = this.getAllFiles();
    const visibleFiles = this.getVisibleFiles();
    const visibleMap = new Map(visibleFiles.map((f) => [f.path, f]));
    const exportFiles = this.getExportFiles();
    const totalSize = allFiles.reduce((s, f) => s + (f.size || 0), 0);
    const exportSize = exportFiles.reduce((s, f) => s + (f.size || 0), 0);

    this.els.fileCount.textContent = this.files.size;
    this.els.totalSize.textContent = formatBytes(totalSize);
    this.els.fileListCount.textContent = hasFiles
      ? `${visibleFiles.length}/${this.files.size} shown`
      : "0 items";
    this.els.selectedCount.textContent = `${this.selectedPaths.size} selected`;

    this.els.clearBtn.disabled = !hasFiles;
    this.setExportButtonsState(this.isExporting);

    this.els.dropZone.classList.toggle("has-files", hasFiles);
    this.els.handoffPanel?.classList.toggle(
      "active",
      hasFiles || this.ignoredItems.length > 0,
    );
    this.els.fileListContainer.classList.toggle("active", hasFiles);

    renderTree(visibleMap, this.els.treeContainer, {
      emptyTitle: hasFiles ? "No matches" : "No files yet",
      emptyDescription: hasFiles
        ? "Adjust search or filters"
        : 'Drop folders or click "Select Files"',
      excludedPaths: this.excludedPaths,
      warnings: this.warnings,
    });
    renderFileList(visibleMap, this.els.fileList, {
      emptyTitle: "No matching files",
      emptyDescription: "Adjust search or filters",
      selectedPaths: this.selectedPaths,
      excludedPaths: this.excludedPaths,
      warnings: this.warnings,
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
      warnings: 0,
      excluded: 0,
    };

    files.forEach((fileInfo) => {
      const category = this.getFileCategory(fileInfo);
      if (counts[category] !== undefined) counts[category]++;
      if (this.warnings.has(fileInfo.path)) counts.warnings++;
      if (this.excludedPaths.has(fileInfo.path)) counts.excluded++;
    });

    this.els.categoryChips
      ?.querySelectorAll("[data-category]")
      .forEach((chip) => {
        const category = chip.dataset.category;
        chip.classList.toggle("active", category === this.filter.category);
        const countEl = chip.querySelector("span");
        if (countEl) countEl.textContent = counts[category] ?? 0;
      });

    if (
      this.els.fileSearch &&
      this.els.fileSearch.value !== this.filter.query
    ) {
      this.els.fileSearch.value = this.filter.query;
    }
    this.els.clearSearchBtn?.toggleAttribute("hidden", !this.filter.query);
  }

  updateReadinessPanel(visibleFiles, exportFiles, exportSize) {
    const warningPaths = this.getWarningPaths();
    const visibleIncludedCount = visibleFiles.filter(
      (fileInfo) => !this.excludedPaths.has(fileInfo.path),
    ).length;

    this.els.readinessSummary.textContent = `${exportFiles.length} included, ${formatBytes(exportSize)}`;
    this.els.includeAllBtn.disabled = this.excludedPaths.size === 0;
    this.els.excludeWarningsBtn.disabled = warningPaths.length === 0;
    this.els.excludeFilteredBtn.disabled = visibleIncludedCount === 0;
    this.els.removeSelectedBtn.disabled = this.selectedPaths.size === 0;
    this.els.removeFilteredBtn.disabled = visibleFiles.length === 0;

    const warningItems = [];
    for (const [path, warnings] of this.warnings) {
      warnings.forEach((warning) => {
        warningItems.push({ path, ...warning });
      });
    }
    this.ignoredItems.slice(-10).forEach((item) => {
      warningItems.push({
        path: item.path,
        severity: "info",
        message: `Ignored: ${item.reason}`,
      });
    });

    if (!warningItems.length) {
      this.els.warningList.innerHTML = `
        <div class="warning-pill info">
          <strong>Ready</strong>
          <span>No local warnings</span>
        </div>
      `;
      return;
    }

    const preview = warningItems.slice(0, 12);
    const extra = warningItems.length - preview.length;
    this.els.warningList.innerHTML = preview
      .map(
        (item) => `
          <div class="warning-pill ${item.severity}">
            <strong>${item.severity === "error" ? "Risk" : item.severity === "warning" ? "Warn" : "Info"}</strong>
            <span title="${escapeForAttr(item.path)}">${escapeHtml(`${item.path}: ${item.message}`)}</span>
          </div>
        `,
      )
      .join("");
    if (extra > 0) {
      this.els.warningList.insertAdjacentHTML(
        "beforeend",
        `<div class="warning-pill info"><strong>More</strong><span>${extra} more</span></div>`,
      );
    }
  }

  setExportButtonsState(disabled) {
    const hasExportFiles = this.getExportFiles().length > 0;
    [
      this.els.downloadTxtBtn,
      this.els.downloadZipBtn,
      this.els.downloadAiBtn,
    ].forEach((button) => {
      if (!button) return;
      button.disabled = disabled || !hasExportFiles;
    });
  }

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
    this.els.progressBar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
    if (text) this.els.loadingText.textContent = text;
  }

  async startExport(type) {
    if (this.isExporting) return;

    const exportFiles = this.getExportEntries();
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

    this.isExporting = true;
    this.exportCancelled = false;
    this.abortController = new AbortController();
    this.setStoredValue(STORAGE_KEYS.lastExport, type);
    this.setExportButtonsState(true);
    this.showLoading(true, `Preparing ${exportFiles.length} files...`);

    try {
      const { startExportWorker, downloadBlob } = await import("./export.js");
      const blob = await startExportWorker(
        type,
        exportFiles,
        (percent, text) => this.updateProgress(percent, text),
        this.abortController.signal,
        this.getExportOptions(type, exportFiles),
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

      if (!this.exportCancelled) {
        showToast(
          this.els.toastContainer,
          `${this.getExportLabel(type)} export completed`,
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
      this.isExporting = false;
      this.abortController = null;
      this.setExportButtonsState(false);
      if (!this.exportCancelled) this.showLoading(false);
    }
  }

  cancelExport() {
    this.exportCancelled = true;
    if (this.abortController) {
      this.abortController.abort();
    }
    this.isExporting = false;
    this.setExportButtonsState(false);
    this.showLoading(false);
    showToast(this.els.toastContainer, "Export cancelled", "warning");
  }

  removeFile(path) {
    this.files.delete(path);
    this.warnings.delete(path);
    this.selectedPaths.delete(path);
    this.excludedPaths.delete(path);
    this.updateUI();
    showToast(this.els.toastContainer, "File removed", "success");
  }

  clearAll() {
    this.files.clear();
    this.warnings.clear();
    this.ignoredItems = [];
    this.selectedPaths.clear();
    this.excludedPaths.clear();
    this.filter.query = "";
    if (this.els.fileSearch) this.els.fileSearch.value = "";
    this.updateUI();
    showToast(this.els.toastContainer, "All files cleared", "success");
  }

  includeAll() {
    const count = this.excludedPaths.size;
    this.excludedPaths.clear();
    this.updateUI();
    showToast(
      this.els.toastContainer,
      `Included ${count} file${count !== 1 ? "s" : ""}`,
      "success",
    );
  }

  excludeWarningFiles() {
    const paths = this.getWarningPaths();
    paths.forEach((path) => this.excludedPaths.add(path));
    this.selectedPaths.clear();
    this.updateUI();
    showToast(
      this.els.toastContainer,
      `Excluded ${paths.length} warning file${paths.length !== 1 ? "s" : ""}`,
      "warning",
    );
  }

  excludeFilteredFiles() {
    const visibleIncluded = this.getVisibleFiles().filter(
      (fileInfo) => !this.excludedPaths.has(fileInfo.path),
    );
    visibleIncluded.forEach((fileInfo) =>
      this.excludedPaths.add(fileInfo.path),
    );
    this.selectedPaths.clear();
    this.updateUI();
    showToast(
      this.els.toastContainer,
      `Excluded ${visibleIncluded.length} filtered file${visibleIncluded.length !== 1 ? "s" : ""}`,
      "info",
    );
  }

  removeSelectedFiles() {
    const count = this.selectedPaths.size;
    if (!count) return;
    Array.from(this.selectedPaths).forEach((path) =>
      this.removeFileSilently(path),
    );
    this.selectedPaths.clear();
    this.updateUI();
    showToast(
      this.els.toastContainer,
      `Removed ${count} selected file${count !== 1 ? "s" : ""}`,
      "success",
    );
  }

  removeFilteredFiles() {
    const visibleFiles = this.getVisibleFiles();
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
    this.updateUI();
    showToast(
      this.els.toastContainer,
      `Removed ${visibleFiles.length} filtered file${visibleFiles.length !== 1 ? "s" : ""}`,
      "success",
    );
  }

  removeFileSilently(path) {
    this.files.delete(path);
    this.warnings.delete(path);
    this.selectedPaths.delete(path);
    this.excludedPaths.delete(path);
  }

  handleFileListClick(e) {
    const removeButton = e.target.closest("[data-remove-file]");
    if (removeButton) {
      this.removeFile(removeButton.dataset.removeFile);
      return;
    }

    if (e.target.closest("input, button, label")) return;

    const row = e.target.closest("[data-file-row]");
    if (!row) return;
    this.toggleSelection(row.dataset.path);
  }

  handleFileListChange(e) {
    const toggle = e.target.closest(".file-include-toggle");
    if (!toggle) return;
    const path = toggle.dataset.path;
    if (toggle.checked) {
      this.excludedPaths.delete(path);
    } else {
      this.excludedPaths.add(path);
      this.selectedPaths.delete(path);
    }
    this.updateUI();
  }

  handleFileListKeydown(e) {
    const row = e.target.closest("[data-file-row]");
    if (!row) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      this.toggleSelection(row.dataset.path);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      this.removeFile(row.dataset.path);
    }
  }

  handleGlobalKeydown(e) {
    const key = e.key.toLowerCase();
    const isTyping = ["INPUT", "TEXTAREA", "SELECT"].includes(
      document.activeElement?.tagName,
    );

    if (e.key === "Escape") {
      if (this.isExporting) {
        this.cancelExport();
      } else if (this.selectedPaths.size) {
        this.selectedPaths.clear();
        this.updateUI();
      } else if (this.filter.query) {
        this.filter.query = "";
        if (this.els.fileSearch) this.els.fileSearch.value = "";
        this.updateUI();
      }
      return;
    }

    if (isTyping) return;

    if ((e.ctrlKey || e.metaKey) && e.shiftKey && key === "o") {
      e.preventDefault();
      this.selectFolder();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && key === "o") {
      e.preventDefault();
      this.selectFiles();
      return;
    }

    if (
      (e.key === "Delete" || e.key === "Backspace") &&
      this.selectedPaths.size
    ) {
      e.preventDefault();
      this.removeSelectedFiles();
      return;
    }

    if (!this.getExportFiles().length || this.isExporting) return;

    if ((e.ctrlKey || e.metaKey) && e.shiftKey && key === "a") {
      e.preventDefault();
      this.startExport("ai");
    } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && key === "t") {
      e.preventDefault();
      this.startExport("txt");
    } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && key === "z") {
      e.preventDefault();
      this.startExport("zip");
    }
  }

  toggleSelection(path) {
    if (this.selectedPaths.has(path)) {
      this.selectedPaths.delete(path);
    } else {
      this.selectedPaths.add(path);
    }
    this.updateUI();
  }

  getAllFiles() {
    return Array.from(this.files.values()).sort((a, b) =>
      a.path.localeCompare(b.path),
    );
  }

  getVisibleFiles() {
    const query = this.filter.query;
    const category = this.filter.category;
    const files = this.getAllFiles().filter((fileInfo) => {
      const matchesQuery =
        !query ||
        fileInfo.path.toLowerCase().includes(query) ||
        fileInfo.name.toLowerCase().includes(query);
      if (!matchesQuery) return false;

      if (category === "all") return true;
      if (category === "warnings") return this.warnings.has(fileInfo.path);
      if (category === "excluded") return this.excludedPaths.has(fileInfo.path);
      return this.getFileCategory(fileInfo) === category;
    });

    return this.sortFiles(files);
  }

  sortFiles(files) {
    const sorted = [...files];
    const sort = this.filter.sort;
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
    return this.getAllFiles().filter(
      (fileInfo) => !this.excludedPaths.has(fileInfo.path),
    );
  }

  getExportEntries() {
    return this.getExportFiles().map((fileInfo) => ({
      ...fileInfo,
      category: this.getFileCategory(fileInfo),
      warnings: this.warnings.get(fileInfo.path) || [],
    }));
  }

  getWarningPaths() {
    return Array.from(this.warnings.entries())
      .filter(([, warnings]) =>
        warnings.some((warning) => warning.severity !== "info"),
      )
      .map(([path]) => path);
  }

  getFileCategory(fileInfo) {
    const extension = getExtension(fileInfo.path);
    if (this.isBinaryLikeFile(fileInfo)) return "assets";
    if (DOC_EXTENSIONS.has(extension)) return "docs";
    if (CONFIG_EXTENSIONS.has(extension)) return "config";
    if (CODE_EXTENSIONS.has(extension)) return "code";
    return "code";
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
      return sum + (this.warnings.get(fileInfo.path)?.length || 0);
    }, 0);

    return {
      type,
      generatedAt: new Date().toISOString(),
      totalFiles: this.files.size,
      includedFiles: files.length,
      excludedFiles: this.excludedPaths.size,
      ignoredItems: this.ignoredItems.length,
      warningCount,
      filters: { ...this.filter },
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

  collapseAll() {
    const childSections = Array.from(
      this.els.treeContainer.querySelectorAll(".tree-children"),
    );
    const openSections = childSections.filter(
      (c) => !c.classList.contains("collapsed"),
    );

    if (!childSections.length) {
      showToast(this.els.toastContainer, "No folders to collapse", "info");
      return;
    }

    childSections.forEach((c) => {
      c.classList.add("collapsed");
      c.setAttribute("aria-hidden", "true");
      c.setAttribute("inert", "");
    });
    this.els.treeContainer
      .querySelectorAll(".tree-toggle")
      .forEach((t) => t.classList.add("collapsed"));
    this.els.treeContainer
      .querySelectorAll(".tree-row.folder[aria-expanded]")
      .forEach((row) => {
        row.setAttribute("aria-expanded", "false");
        row.setAttribute(
          "aria-label",
          `Expand ${row.querySelector(".tree-label")?.textContent || "folder"}`,
        );
      });
    this.els.collapseAllBtn.classList.add("active");
    this.els.expandAllBtn.classList.remove("active");
    showToast(
      this.els.toastContainer,
      openSections.length
        ? `Collapsed ${openSections.length} folder${openSections.length !== 1 ? "s" : ""}`
        : "Explorer is already collapsed",
      openSections.length ? "success" : "info",
    );
  }

  expandAll() {
    const childSections = Array.from(
      this.els.treeContainer.querySelectorAll(".tree-children"),
    );
    const collapsedSections = childSections.filter((c) =>
      c.classList.contains("collapsed"),
    );

    if (!childSections.length) {
      showToast(this.els.toastContainer, "No folders to expand", "info");
      return;
    }

    childSections.forEach((c) => {
      c.classList.remove("collapsed");
      c.setAttribute("aria-hidden", "false");
      c.removeAttribute("inert");
    });
    this.els.treeContainer
      .querySelectorAll(".tree-toggle")
      .forEach((t) => t.classList.remove("collapsed"));
    this.els.treeContainer
      .querySelectorAll(".tree-row.folder[aria-expanded]")
      .forEach((row) => {
        row.setAttribute("aria-expanded", "true");
        row.setAttribute(
          "aria-label",
          `Collapse ${row.querySelector(".tree-label")?.textContent || "folder"}`,
        );
      });
    this.els.expandAllBtn.classList.add("active");
    this.els.collapseAllBtn.classList.remove("active");
    showToast(
      this.els.toastContainer,
      collapsedSections.length
        ? `Expanded ${collapsedSections.length} folder${collapsedSections.length !== 1 ? "s" : ""}`
        : "Explorer is already expanded",
      collapsedSections.length ? "success" : "info",
    );
  }

  getStoredValue(key, fallback) {
    try {
      return localStorage.getItem(key) || fallback;
    } catch {
      return fallback;
    }
  }

  setStoredValue(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Local storage can be disabled in private browser contexts.
    }
  }
}

function getExtension(path) {
  const cleanPath = path.split("?")[0].toLowerCase();
  const filename = cleanPath.split("/").pop() || "";
  const dotIndex = filename.lastIndexOf(".");
  return dotIndex > 0 ? filename.substring(dotIndex) : "";
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}

function escapeForAttr(value) {
  return escapeHtml(value).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
