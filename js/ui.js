// UI rendering

export function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / 1024 ** i).toFixed(i ? 1 : 0) + " " + units[i];
}

export function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function renderTree(files, container, onRemove) {
  if (!files.size) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📁</div>
        <div class="empty-state-title">No files yet</div>
        <div class="empty-state-desc">Drop folders or click "Select Files"</div>
      </div>
    `;
    return;
  }

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
    curr.files.push({ ...data, displayName: parts.at(-1) });
  }

  const renderNode = (node, depth = 0) => {
    let html = "";

    for (const [name, child] of node.children) {
      const hasKids = child.children.size || child.files.length;
      const isOpen = depth < 2;
      const safeName = escapeHtml(name);
      const safeNameAttr = escapeAttr(name);
      html += `
        <div class="tree-node">
          <div class="tree-row folder" style="padding-left:${8 + depth * 16}px" role="button" tabindex="0" aria-expanded="${isOpen}" aria-label="${isOpen ? "Collapse" : "Expand"} ${safeNameAttr}" data-tree-trigger>
            ${hasKids ? `<span class="tree-toggle ${isOpen ? "" : "collapsed"}" aria-hidden="true">▼</span>` : '<span style="width:20px"></span>'}
            <span class="tree-icon folder">📁</span>
            <span class="tree-label" title="${safeNameAttr}">${safeName}</span>
          </div>
          ${hasKids ? `<div class="tree-children ${isOpen ? "" : "collapsed"}" ${isOpen ? "" : 'aria-hidden="true" inert'}><div class="tree-children-inner">${renderNode(child, depth + 1)}</div></div>` : ""}
        </div>
      `;
    }

    for (const f of node.files) {
      const safePath = f.path.replace(/'/g, "\\'");
      html += `
        <div class="tree-node">
          <div class="tree-row" style="padding-left:${8 + depth * 16 + 20}px">
            <span style="width:20px"></span>
            <span class="tree-icon file">📄</span>
            <span class="tree-label" title="${escapeAttr(f.path)}">${escapeHtml(f.displayName)}</span>
            <span class="tree-meta">${formatBytes(f.size)}</span>
            <button class="tree-remove" onclick="window.app.removeFile('${safePath}')" title="Remove">×</button>
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

export function renderFileList(files, container, onRemove) {
  if (!files.size) {
    container.innerHTML = "";
    return;
  }

  const sorted = Array.from(files.values()).sort((a, b) =>
    a.path.localeCompare(b.path),
  );

  container.innerHTML = sorted
    .map((f) => {
      const safePath = f.path.replace(/'/g, "\\'");
      return `
      <div class="file-item">
        <span class="file-item-icon">📄</span>
        <span class="file-item-path" title="${escapeHtml(f.path)}">${escapeHtml(f.path)}</span>
        <span class="file-item-size">${formatBytes(f.size)}</span>
        <button class="file-item-remove" onclick="window.app.removeFile('${safePath}')" title="Remove">×</button>
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
    success: { icon: "✓", title: "Success", role: "status" },
    error: { icon: "⚠", title: "Error", role: "alert" },
    warning: { icon: "⚡", title: "Warning", role: "status" },
    info: { icon: "i", title: "Info", role: "status" },
  };
  const config = toastConfig[toastType];

  container.setAttribute("aria-live", toastType === "error" ? "assertive" : "polite");
  container.setAttribute("aria-atomic", "false");

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
