// UI rendering
import {
  formatBytes,
  escapeHtml,
  escapeAttr as escapeAttrUtil,
  debounce,
} from "./utils.js";

export { formatBytes, escapeHtml, debounce };
export const escapeAttr = escapeAttrUtil;

function encodePath(path) {
  return encodeURIComponent(path);
}

function renderEmpty(container, title, desc) {
  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">&#128193;</div>
      <div class="empty-state-title">${escapeHtml(title)}</div>
      <div class="empty-state-desc">${escapeHtml(desc)}</div>
    </div>
  `;
}

export function renderTree(files, container, options = {}) {
  if (!files.size) {
    renderEmpty(
      container,
      options.emptyTitle || "No files yet",
      options.emptyDescription || 'Drop folders or click "Select Files"',
    );
    return;
  }

  const excludedPaths = options.excludedPaths || new Set();
  const warnings = options.warnings || new Map();
  const root = { children: new Map(), files: [] };

  for (const [path, data] of files) {
    const parts = path.split("/").filter(Boolean);
    let curr = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (!curr.children.has(p)) {
        curr.children.set(p, { name: p, children: new Map(), files: [] });
      }
      curr = curr.children.get(p);
    }
    curr.files.push({ ...data, displayName: parts[parts.length - 1] || path });
  }

  const renderNode = (node, depth = 0) => {
    let html = "";
    const folders = Array.from(node.children.entries()).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    const nodeFiles = node.files.sort((a, b) => a.path.localeCompare(b.path));

    for (const [name, child] of folders) {
      const hasKids = child.children.size || child.files.length;
      const isOpen = depth < 2;
      const safeName = escapeHtml(name);
      const safeNameAttr = escapeAttr(name);
      html += `
        <div class="tree-node">
          <div class="tree-row folder" style="padding-left:${8 + depth * 16}px" role="button" tabindex="0" aria-expanded="${isOpen}" aria-label="${isOpen ? "Collapse" : "Expand"} ${safeNameAttr}" data-tree-trigger>
            ${hasKids ? `<span class="tree-toggle ${isOpen ? "" : "collapsed"}" aria-hidden="true">&#9660;</span>` : '<span style="width:20px"></span>'}
            <span class="tree-icon folder">&#128193;</span>
            <span class="tree-label" title="${safeNameAttr}">${safeName}</span>
          </div>
          ${hasKids ? `<div class="tree-children ${isOpen ? "" : "collapsed"}" ${isOpen ? "" : 'aria-hidden="true" inert'}><div class="tree-children-inner">${renderNode(child, depth + 1)}</div></div>` : ""}
        </div>
      `;
    }

    for (const f of nodeFiles) {
      const encodedPath = encodePath(f.path);
      const hasWarning = warnings.has(f.path);
      const isExcluded = excludedPaths.has(f.path);
      const classes = [
        "tree-row",
        hasWarning ? "has-warning" : "",
        isExcluded ? "excluded" : "",
      ]
        .filter(Boolean)
        .join(" ");
      html += `
        <div class="tree-node">
          <div class="${classes}" style="padding-left:${8 + depth * 16 + 20}px">
            <span style="width:20px"></span>
            <span class="tree-icon file">&#128196;</span>
            <span class="tree-label" title="${escapeAttr(f.path)}">${escapeHtml(f.displayName)}</span>
            <span class="tree-meta">${formatBytes(f.size)}</span>
            <button class="tree-remove" onclick="window.app.removeFile(decodeURIComponent('${encodedPath}'))" title="Remove" aria-label="Remove ${escapeAttr(f.path)}">&times;</button>
          </div>
        </div>
      `;
    }
    return html;
  };

  container.innerHTML = `<div class="tree">${renderNode(root)}</div>`;

  const getDirectChildren = (row) =>
    Array.from(row.parentElement.children).find((el) =>
      el.classList?.contains("tree-children"),
    );

  const toggleFolderRow = (row) => {
    const children = getDirectChildren(row);
    const toggle = row.querySelector(".tree-toggle");
    if (!children || !toggle) return;

    const isCollapsed = children.classList.toggle("collapsed");
    toggle.classList.toggle("collapsed", isCollapsed);
    children.toggleAttribute("inert", isCollapsed);
    children.setAttribute("aria-hidden", String(isCollapsed));
    row.setAttribute("aria-expanded", String(!isCollapsed));
    row.setAttribute(
      "aria-label",
      `${isCollapsed ? "Expand" : "Collapse"} ${row.querySelector(".tree-label")?.textContent || "folder"}`,
    );
  };

  container.querySelectorAll("[data-tree-trigger]").forEach((row) => {
    row.addEventListener("click", () => toggleFolderRow(row));
    row.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      toggleFolderRow(row);
    });
  });
}

export function renderFileList(files, container, options = {}) {
  if (!files.size) {
    renderEmpty(
      container,
      options.emptyTitle || "No matching files",
      options.emptyDescription || "Adjust search or filters",
    );
    return;
  }

  const selectedPaths = options.selectedPaths || new Set();
  const excludedPaths = options.excludedPaths || new Set();
  const warnings = options.warnings || new Map();
  const sorted = Array.from(files.values());

  container.innerHTML = sorted
    .map((f) => {
      const hasWarning = warnings.has(f.path);
      const isSelected = selectedPaths.has(f.path);
      const isExcluded = excludedPaths.has(f.path);
      const classes = [
        "file-item",
        isSelected ? "selected" : "",
        isExcluded ? "excluded" : "",
        hasWarning ? "has-warning" : "",
      ]
        .filter(Boolean)
        .join(" ");
      const warningCount = hasWarning ? warnings.get(f.path).length : 0;
      return `
      <div class="${classes}" data-file-row data-path="${escapeAttr(f.path)}" tabindex="0" role="option" aria-selected="${isSelected}">
        <label class="file-include" title="Include in exports">
          <input class="file-include-toggle" type="checkbox" data-path="${escapeAttr(f.path)}" ${isExcluded ? "" : "checked"} aria-label="Include ${escapeAttr(f.path)} in exports" />
          <span>Include</span>
        </label>
        <span class="file-item-icon" aria-hidden="true">&#128196;</span>
        <span class="file-item-path" title="${escapeAttr(f.path)}">${escapeHtml(f.path)}</span>
        <span class="file-item-size">${formatBytes(f.size)}</span>
        <span class="file-item-badges">
          ${hasWarning ? `<span class="file-badge warning">${warningCount}</span>` : ""}
          ${isExcluded ? '<span class="file-badge excluded">Out</span>' : ""}
        </span>
        <button class="file-item-remove" data-remove-file="${escapeAttr(f.path)}" title="Remove" aria-label="Remove ${escapeAttr(f.path)}">&times;</button>
      </div>
    `;
    })
    .join("");
}

export function showToast(container, message, type = "success") {
  if (!container) return;

  const toastType = ["success", "error", "warning", "info"].includes(type)
    ? type
    : "info";
  const toastConfig = {
    success: { icon: "OK", title: "Success", role: "status" },
    error: { icon: "!", title: "Error", role: "alert" },
    warning: { icon: "!", title: "Warning", role: "status" },
    info: { icon: "i", title: "Info", role: "status" },
  };
  const config = toastConfig[toastType];

  container.setAttribute(
    "aria-live",
    toastType === "error" ? "assertive" : "polite",
  );
  container.setAttribute("aria-atomic", "false");

  while (container.children.length > 3) {
    container.firstElementChild?.remove();
  }

  const toast = document.createElement("div");
  toast.className = `toast ${toastType}`;
  toast.setAttribute("role", config.role);
  toast.innerHTML = `
    <span class="toast-icon" aria-hidden="true">${config.icon}</span>
    <div class="toast-content">
      <div class="toast-title">${config.title}</div>
      <div class="toast-desc">${escapeHtml(message)}</div>
    </div>
  `;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}
