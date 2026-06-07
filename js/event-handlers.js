// Event handlers and UI interactions

import { debounce, showToast } from "./ui.js";
import { UI_CONSTANTS } from "./constants.js";
import {
  STORAGE_KEYS,
  setStoredValue,
  getStoredValue,
} from "./state-management.js";

export class EventHandlers {
  constructor(state, els, managers, uiCallbacks) {
    this.state = state;
    this.els = els;
    this.managers = managers;
    this.uiCallbacks = uiCallbacks;
  }

  bindEvents() {
    this.els.fileInput?.addEventListener("change", (e) => {
      this.managers.fileManager.handleFiles(e.target.files, this.els.fileInput);
    });

    this.els.folderInput?.addEventListener("change", (e) => {
      this.managers.fileManager.handleFiles(
        e.target.files,
        this.els.folderInput,
      );
    });

    this.els.clearBtn.onclick = () => this.managers.fileManager.clearAll();

    this.els.fileSearch?.addEventListener(
      "input",
      debounce((e) => {
        this.state.filter.query = e.target.value.trim().toLowerCase();
        this.uiCallbacks.updateUI();
      }, UI_CONSTANTS.DEBOUNCE_DELAY_MS),
    );

    this.els.clearSearchBtn?.addEventListener("click", () => {
      this.state.filter.query = "";
      this.els.fileSearch.value = "";
      this.uiCallbacks.updateUI();
    });

    this.els.sortSelect?.addEventListener("change", (e) => {
      this.state.filter.sort = e.target.value;
      setStoredValue(STORAGE_KEYS.sort, this.state.filter.sort);
      this.uiCallbacks.updateUI();
    });

    this.els.categoryChips?.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-category]");
      if (!chip) return;
      this.state.filter.category = chip.dataset.category || "all";
      this.uiCallbacks.updateUI();
    });

    this.els.includeAllBtn?.addEventListener("click", () =>
      this.managers.fileManager.includeAll(),
    );
    this.els.excludeWarningsBtn?.addEventListener("click", () =>
      this.managers.fileManager.excludeWarningFiles(),
    );
    this.els.excludeFilteredBtn?.addEventListener("click", () =>
      this.managers.fileManager.excludeFilteredFiles(),
    );
    this.els.removeSelectedBtn?.addEventListener("click", () =>
      this.managers.fileManager.removeSelectedFiles(),
    );
    this.els.removeFilteredBtn?.addEventListener("click", () =>
      this.managers.fileManager.removeFilteredFiles(),
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

    // Export buttons
    this.els.downloadTxtBtn?.addEventListener("click", () =>
      this.managers.exportManager.startExport("txt"),
    );
    this.els.downloadZipBtn?.addEventListener("click", () =>
      this.managers.exportManager.startExport("zip"),
    );
    this.els.downloadAiBtn?.addEventListener("click", () =>
      this.managers.exportManager.startExport("ai"),
    );
    this.els.exportStructureBtn?.addEventListener("click", () =>
      this.managers.exportManager.exportStructure(),
    );

    // Cancel button
    this.els.cancelBtn?.addEventListener("click", () =>
      this.managers.exportManager.cancelExport(),
    );

    // Collapse/Expand buttons
    this.els.collapseAllBtn?.addEventListener("click", () =>
      this.collapseAll(),
    );
    this.els.expandAllBtn?.addEventListener("click", () => this.expandAll());
  }

  handleFileListClick(e) {
    const removeButton = e.target.closest("[data-remove-file]");
    if (removeButton) {
      this.managers.fileManager.removeFile(removeButton.dataset.removeFile);
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
      this.state.excludedPaths.delete(path);
    } else {
      this.state.excludedPaths.add(path);
      this.state.selectedPaths.delete(path);
    }
    this.uiCallbacks.updateUI();
  }

  handleFileListKeydown(e) {
    const row = e.target.closest("[data-file-row]");
    if (!row) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      this.toggleSelection(row.dataset.path);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      this.managers.fileManager.removeFile(row.dataset.path);
    }
  }

  handleGlobalKeydown(e) {
    const key = e.key.toLowerCase();
    const isTyping = ["INPUT", "TEXTAREA", "SELECT"].includes(
      document.activeElement?.tagName,
    );

    if (e.key === "Escape") {
      if (this.state.isExporting) {
        this.managers.exportManager.cancelExport();
      } else if (this.state.selectedPaths.size) {
        this.state.selectedPaths.clear();
        this.uiCallbacks.updateUI();
      } else if (this.state.filter.query) {
        this.state.filter.query = "";
        if (this.els.fileSearch) this.els.fileSearch.value = "";
        this.uiCallbacks.updateUI();
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
      this.state.selectedPaths.size
    ) {
      e.preventDefault();
      this.managers.fileManager.removeSelectedFiles();
      return;
    }

    if (
      !this.managers.filterManager.getExportFiles().length ||
      this.state.isExporting
    )
      return;

    if ((e.ctrlKey || e.metaKey) && e.shiftKey && key === "a") {
      e.preventDefault();
      this.managers.exportManager.startExport("ai");
    } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && key === "t") {
      e.preventDefault();
      this.managers.exportManager.startExport("txt");
    } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && key === "z") {
      e.preventDefault();
      this.managers.exportManager.startExport("zip");
    }
  }

  toggleSelection(path) {
    if (this.state.selectedPaths.has(path)) {
      this.state.selectedPaths.delete(path);
    } else {
      this.state.selectedPaths.add(path);
    }
    this.uiCallbacks.updateUI();
  }

  selectFiles() {
    this.els.fileInput.value = "";
    setTimeout(
      () => this.els.fileInput.click(),
      UI_CONSTANTS.FILE_INPUT_CLICK_DELAY_MS,
    );
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
    this.uiCallbacks.showLoading(true, "Opening folder picker...");
    this.els.folderInput.value = "";
    setTimeout(
      () => this.els.folderInput.click(),
      UI_CONSTANTS.FILE_INPUT_CLICK_DELAY_MS,
    );
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
        UI_CONSTANTS.SIDEBAR_MIN_WIDTH,
        Math.min(
          UI_CONSTANTS.SIDEBAR_MAX_WIDTH,
          startWidth + (e.clientX - startX),
        ),
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
      setStoredValue(STORAGE_KEYS.sidebarWidth, String(sidebar.offsetWidth));
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
      await this.managers.fileManager.handleDrop(e);
    };

    [zone, this.els.fileListContainer].forEach((el) => {
      el?.addEventListener("dragenter", onEnter);
      el?.addEventListener("dragover", onDrag);
      el?.addEventListener("dragleave", onLeave);
      el?.addEventListener("drop", onDrop);
    });
  }

  restorePreferences() {
    if (this.els.sortSelect) {
      this.els.sortSelect.value = this.state.filter.sort;
    }

    const savedWidth = Number(getStoredValue(STORAGE_KEYS.sidebarWidth, ""));
    if (savedWidth && this.els.sidebar) {
      const width = Math.max(
        UI_CONSTANTS.SIDEBAR_MIN_WIDTH,
        Math.min(UI_CONSTANTS.SIDEBAR_MAX_WIDTH, savedWidth),
      );
      this.els.sidebar.style.width = `${width}px`;
      document.documentElement.style.setProperty(
        "--sidebar-width",
        `${width}px`,
      );
    }
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
