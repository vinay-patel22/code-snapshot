// Export functions (Worker-backed, local-only)
import { EXPORT_CONSTANTS, UI_CONSTANTS } from "./constants.js";
import { formatBytes } from "./utils.js";

export async function startExportWorker(
  type,
  files,
  onProgress,
  signal,
  options = {},
) {
  return new Promise(function (resolve, reject) {
    const worker = new Worker("./js/export-worker.js");
    const filesArray = Array.from(files);

    if (!filesArray.length) {
      reject(new Error("No files to export"));
      return;
    }

    const CHUNK_SIZE =
      type === "zip"
        ? EXPORT_CONSTANTS.ZIP_CHUNK_SIZE
        : EXPORT_CONSTANTS.TXT_CHUNK_SIZE;
    const totalChunks = Math.ceil(filesArray.length / CHUNK_SIZE);
    let nextChunkIndex = 0;
    let completedChunks = 0;
    let cancelled = false;

    const txtBlobs = [];
    const aiBlobs = [];

    worker.onmessage = async function (e) {
      const msg = e.data;
      const msgType = msg.type;

      if (msgType === "progress") {
        onProgress?.(msg.percent, msg.text);
        return;
      }

      if (msgType === "txtChunk" || msgType === "aiChunk") {
        const blob = new Blob([msg.data], {
          type: msgType === "aiChunk" ? "text/markdown" : "text/plain",
        });
        if (msgType === "aiChunk") {
          aiBlobs.push(blob);
        } else {
          txtBlobs.push(blob);
        }
        completedChunks++;

        if (completedChunks >= msg.totalChunks) {
          const finalBlob = new Blob(
            msgType === "aiChunk" ? aiBlobs : txtBlobs,
            {
              type: msgType === "aiChunk" ? "text/markdown" : "text/plain",
            },
          );
          worker.terminate();
          onProgress?.(100, "Export ready");
          resolve(finalBlob);
        } else {
          await sendNextChunk();
        }
        return;
      }

      if (msgType === "chunkComplete") {
        completedChunks++;
        await sendNextChunk();
        return;
      }

      if (msgType === "zipChunk") {
        const finalBlob = new Blob([new Uint8Array(msg.data)], {
          type: "application/zip",
        });
        worker.terminate();
        onProgress?.(100, "Export ready");
        resolve(finalBlob);
        return;
      }

      if (msgType === "error") {
        worker.terminate();
        reject(new Error(msg.data));
        return;
      }

      if (msgType === "cancelled") {
        worker.terminate();
        reject(new Error("Export cancelled"));
      }
    };

    worker.onerror = function (err) {
      worker.terminate();
      reject(err);
    };

    if (signal) {
      signal.addEventListener("abort", function () {
        cancelled = true;
        worker.postMessage({ action: "cancel" });
        worker.terminate();
        reject(new Error("Export cancelled"));
      });
    }

    worker.postMessage({
      type,
      action: "start",
      options,
      fileIndex: filesArray.map((fileInfo) => ({
        path: fileInfo.path,
        name: fileInfo.name,
        size: fileInfo.size,
        category: fileInfo.category || "",
        warnings: fileInfo.warnings || [],
      })),
      totalChunks,
    });

    async function sendNextChunk() {
      if (nextChunkIndex >= totalChunks || cancelled) return;

      const start = nextChunkIndex * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, filesArray.length);
      const chunkFiles = filesArray.slice(start, end);
      const chunkIndex = nextChunkIndex + 1;
      nextChunkIndex++;

      onProgress?.(
        Math.round(((chunkIndex - 1) / totalChunks) * 20),
        `Reading files... ${chunkIndex}/${totalChunks}`,
      );

      const filesWithData = await Promise.all(
        chunkFiles.map(async function (f) {
          return {
            path: f.path,
            name: f.name,
            size: f.size,
            category: f.category || "",
            warnings: f.warnings || [],
            data: new Uint8Array(await f.file.arrayBuffer()),
          };
        }),
      );

      if (cancelled) return;

      worker.postMessage(
        {
          type,
          action: "processChunk",
          files: filesWithData,
          chunkIndex,
          totalChunks,
        },
        filesWithData.map((f) => f.data.buffer),
      );
    }

    sendNextChunk().catch(reject);
  });
}

export function downloadBlob(blob, filename, mime) {
  mime = mime || blob.type || "application/octet-stream";
  const typedBlob =
    blob.type === mime ? blob : new Blob([blob], { type: mime });
  const url = URL.createObjectURL(typedBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () {
    URL.revokeObjectURL(url);
  }, UI_CONSTANTS.URL_REVOKE_DELAY_MS);
}

export function buildStructureText(files, options = {}) {
  const filesArray = Array.from(files || []).sort((a, b) =>
    a.path.localeCompare(b.path),
  );
  const totalSize =
    options.totalSize ??
    filesArray.reduce((sum, fileInfo) => sum + (fileInfo.size || 0), 0);

  return [
    "Code Snapshot Project Structure",
    "",
    `Generated: ${options.generatedAt || new Date().toISOString()}`,
    `Files: ${filesArray.length}`,
    `Total size: ${formatBytes(totalSize)}`,
    "",
    buildDirectoryTree(filesArray.map((fileInfo) => fileInfo.path)),
    "",
    "Generated by Code Snapshot. All processing happened locally in the browser.",
    "",
  ].join("\n");
}

function buildDirectoryTree(paths) {
  const root = { dirs: new Map(), files: [] };

  for (const path of [...paths].sort((a, b) => a.localeCompare(b))) {
    const parts = String(path || "")
      .replace(/\\/g, "/")
      .split("/")
      .filter(Boolean);
    if (!parts.length) continue;

    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!node.dirs.has(part)) {
        node.dirs.set(part, { dirs: new Map(), files: [] });
      }
      node = node.dirs.get(part);
    }
    node.files.push(parts[parts.length - 1]);
  }

  const lines = [];
  const walk = (node, prefix = "") => {
    const dirs = Array.from(node.dirs.entries()).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    const files = node.files.sort((a, b) => a.localeCompare(b));

    dirs.forEach(([name, child], index) => {
      const isLast = index === dirs.length - 1 && files.length === 0;
      lines.push(`${prefix}${isLast ? "+-- " : "|-- "}${name}/`);
      walk(child, `${prefix}${isLast ? "    " : "|   "}`);
    });

    files.forEach((name, index) => {
      const isLast = index === files.length - 1;
      lines.push(`${prefix}${isLast ? "+-- " : "|-- "}${name}`);
    });
  };

  walk(root);
  return lines.join("\n") || ".";
}
