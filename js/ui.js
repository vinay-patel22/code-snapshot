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
      html += `
        <div class="tree-node">
          <div class="tree-row folder" style="padding-left:${8 + depth * 16}px">
            ${hasKids ? `<span class="tree-toggle ${isOpen ? "" : "collapsed"}" data-toggle>▼</span>` : '<span style="width:20px"></span>'}
            <span class="tree-icon folder">📁</span>
            <span class="tree-label" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
          </div>
          ${hasKids ? `<div class="tree-children ${isOpen ? "" : "collapsed"}">${renderNode(child, depth + 1)}</div>` : ""}
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
            <span class="tree-label" title="${escapeHtml(f.path)}">${escapeHtml(f.displayName)}</span>
            <span class="tree-meta">${formatBytes(f.size)}</span>
            <button class="tree-remove" onclick="window.app.removeFile('${safePath}')" title="Remove">×</button>
          </div>
        </div>
      `;
    }
    return html;
  };

  container.innerHTML = `<div class="tree">${renderNode(root)}</div>`;

  container.querySelectorAll("[data-toggle]").forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const children = btn
        .closest(".tree-node")
        .querySelector(".tree-children");
      if (children) {
        children.classList.toggle("collapsed");
        btn.classList.toggle("collapsed");
      }
    };
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
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${type === "success" ? "✓" : type === "error" ? "⚠" : "⚡"}</span>
    <div class="toast-content">
      <div class="toast-title">${type === "success" ? "Success" : type === "error" ? "Error" : "Warning"}</div>
      <div class="toast-desc">${escapeHtml(message)}</div>
    </div>
  `;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}
