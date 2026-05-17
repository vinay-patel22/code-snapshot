// Core app class
import {
  readFiles,
  processDirectoryEntry,
  DEFAULT_IGNORED,
  CONFIG,
} from "./file-ops.js";
import { downloadBlob } from "./export.js";
import { renderTree, renderFileList, showToast, formatBytes } from "./ui.js";

export class CodeSnapshotApp {
  constructor() {
    this.files = new Map();
    this.isExporting = false;
    this.exportCancelled = false;
    this.abortController = null;

    this.els = {
      dropZone: document.getElementById("dropZone"),
      fileListContainer: document.getElementById("fileListContainer"),
      fileList: document.getElementById("fileList"),
      treeContainer: document.getElementById("treeContainer"),
      fileInput: document.getElementById("fileInput"),
      fileCount: document.getElementById("fileCount"),
      totalSize: document.getElementById("totalSize"),
      fileListCount: document.getElementById("fileListCount"),
      clearBtn: document.getElementById("clearBtn"),
      downloadTxtBtn: document.getElementById("downloadTxtBtn"),
      downloadZipBtn: document.getElementById("downloadZipBtn"),
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
    this.bindEvents();
    this.updateUI();
    this.setupDropZoneEffects();
    this.initResize();
  }

  bindEvents() {
    this.els.fileInput.addEventListener("change", (e) => {
      this.handleFiles(e.target.files, this.els.fileInput);
    });

    this.els.clearBtn.onclick = () => this.clearAll();
    this.setupDropZoneEffects();
  }

  initResize() {
    const handle = this.els.resizeHandle;
    const sidebar = this.els.sidebar;
    let isResizing = false,
      startX,
      startWidth;

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
      sidebar.style.width = newWidth + "px";
      document.documentElement.style.setProperty(
        "--sidebar-width",
        newWidth + "px",
      );
    };

    const onMouseUp = () => {
      if (isResizing) {
        isResizing = false;
        handle.classList.remove("resizing");
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };

    handle.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  setupDropZoneEffects() {
    const zone = this.els.dropZone;

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

  // ✅ ADDED: Method called by HTML button
  selectFiles() {
    this.els.fileInput.value = "";
    setTimeout(() => this.els.fileInput.click(), 50);
  }

  async handleFiles(fileList, inputEl) {
    if (!fileList?.length) return;

    this.showLoading(true, "Reading files...");
    const added = await readFiles(fileList, { ignored: DEFAULT_IGNORED });

    added.forEach((f) => this.files.set(f.path, f));

    this.showLoading(false);
    this.updateUI();
    setTimeout(() => {
      if (inputEl) inputEl.value = "";
    }, 100);

    if (added.length) {
      showToast(
        this.els.toastContainer,
        `Added ${added.length} file${added.length !== 1 ? "s" : ""}`,
        "success",
      );
    } else if (!this.files.size) {
      showToast(this.els.toastContainer, "No valid files found", "error");
    }
  }

  async handleDrop(e) {
    const dt = e.dataTransfer;
    if (!dt?.items?.length && !dt?.files?.length) return;

    this.showLoading(true, "Processing drop...");
    let added = [];

    if (dt.items?.[0]?.webkitGetAsEntry) {
      const entries = Array.from(dt.items)
        .filter((i) => i.kind === "file")
        .map((i) => i.webkitGetAsEntry())
        .filter(Boolean);

      for (const entry of entries) {
        const files = await processDirectoryEntry(entry, "", DEFAULT_IGNORED);
        added = added.concat(files);
      }
    }

    if (!added.length && dt.files?.length) {
      added = await readFiles(dt.files, { ignored: DEFAULT_IGNORED });
    }

    added.forEach((f) => this.files.set(f.path, f));

    this.showLoading(false);
    this.updateUI();

    if (added.length) {
      showToast(
        this.els.toastContainer,
        `Imported ${added.length} file${added.length !== 1 ? "s" : ""}`,
        "success",
      );
    } else if (!this.files.size) {
      showToast(
        this.els.toastContainer,
        "Nothing to add (ignored/duplicate)",
        "error",
      );
    }
  }

  updateUI() {
    const hasFiles = this.files.size > 0;
    const totalSize = Array.from(this.files.values()).reduce(
      (s, f) => s + (f.size || 0),
      0,
    );

    this.els.fileCount.textContent = this.files.size;
    this.els.totalSize.textContent = formatBytes(totalSize);
    this.els.fileListCount.textContent = `${this.files.size} item${this.files.size !== 1 ? "s" : ""}`;

    this.els.clearBtn.disabled = !hasFiles;
    this.els.downloadTxtBtn.disabled = !hasFiles;
    this.els.downloadZipBtn.disabled = !hasFiles;

    this.els.dropZone.classList.toggle("has-files", hasFiles);
    this.els.fileListContainer.classList.toggle("active", hasFiles);

    renderTree(this.files, this.els.treeContainer);
    renderFileList(this.files, this.els.fileList);
  }

  showLoading(show, text = "Processing...") {
    this.els.loadingText.textContent = text;
    this.els.progressBar.style.width = "0%";
    this.els.loading.classList.toggle("active", show);
    this.els.cancelBtn.style.display = show ? "block" : "none";
  }

  updateProgress(percent, text) {
    this.els.progressBar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
    if (text) this.els.loadingText.textContent = text;
  }

  setExportButtonsState(disabled) {
    this.els.downloadTxtBtn.disabled = disabled;
    this.els.downloadZipBtn.disabled = disabled;

    if (disabled) {
      this.els.downloadTxtBtn.style.opacity = "0.5";
      this.els.downloadZipBtn.style.opacity = "0.5";
      this.els.downloadTxtBtn.style.cursor = "not-allowed";
      this.els.downloadZipBtn.style.cursor = "not-allowed";
    } else {
      this.els.downloadTxtBtn.style.opacity = "";
      this.els.downloadZipBtn.style.opacity = "";
      this.els.downloadTxtBtn.style.cursor = "";
      this.els.downloadZipBtn.style.cursor = "";
    }
  }

  async startExport(type) {
    if (!this.files.size || this.isExporting) return;

    const totalSize = Array.from(this.files.values()).reduce(
      (sum, f) => sum + f.size,
      0,
    );

    if (type === "txt" && totalSize > CONFIG.MAX_TXT_EXPORT_SIZE) {
      if (
        !confirm(
          `⚠️ Large Export Warning\n\nTotal size: ${formatBytes(totalSize)}\n\nCreating a combined TXT file this large may:\n• Take several minutes\n• Use significant memory\n• Potentially fail\n\nConsider using ZIP export instead, or filter out large files.\n\nContinue anyway?`,
        )
      ) {
        return;
      }
    }

    this.isExporting = true;
    this.exportCancelled = false;
    this.abortController = new AbortController();
    this.setExportButtonsState(true);
    this.showLoading(true, `Preparing ${this.files.size} files...`);

    try {
      const { startExportWorker } = await import("./export.js");
      const blob = await startExportWorker(
        type,
        this.files.values(),
        (percent, text) => this.updateProgress(percent, text),
        this.abortController.signal,
      );

      const { downloadBlob } = await import("./export.js");
      downloadBlob(
        blob,
        type === "txt" ? "combined-code.txt" : "code-snapshot.zip",
      );

      if (!this.exportCancelled) {
        showToast(
          this.els.toastContainer,
          `${type.toUpperCase()} export completed`,
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
    this.updateUI();
    showToast(this.els.toastContainer, "File removed", "success");
  }

  clearAll() {
    this.files.clear();
    this.updateUI();
    showToast(this.els.toastContainer, "All files cleared", "success");
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
}
