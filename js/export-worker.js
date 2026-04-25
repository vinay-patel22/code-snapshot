// Web Worker for heavy export tasks

importScripts("https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.js");

let cancelled = false;

self.onmessage = async function (e) {
  const { type, files, action, chunkIndex, totalChunks } = e.data;

  if (action === "start") {
    cancelled = false;
  } else if (action === "processChunk") {
    try {
      if (cancelled) {
        self.postMessage({ type: "cancelled" });
        return;
      }

      if (type === "txt") {
        const chunks = [];
        const encoder = new TextEncoder();

        for (const f of files) {
          const header = `// ============================================\n// File: ${f.name}\n// Path: ${f.path}\n// Size: ${formatBytes(f.size)}\n// ============================================\n\n`;
          chunks.push(encoder.encode(header));
          chunks.push(f.data);
          chunks.push(encoder.encode("\n\n\n"));
        }

        const blob = new Blob(chunks);
        const arrayBuffer = await blob.arrayBuffer();

        // Send as ArrayBuffer (transferable)
        self.postMessage(
          {
            type: "txtChunk",
            data: arrayBuffer,
            chunkIndex: chunkIndex,
            totalChunks: totalChunks,
            isTxt: true,
          },
          [arrayBuffer],
        );
      } else if (type === "zip") {
        const zipData = {};
        for (const f of files) {
          zipData[f.path] = f.data;
        }

        // Use callback-based fflate.zip for UMD
        self.fflate.zip(zipData, { level: 6 }, function (err, zipped) {
          if (err) {
            self.postMessage({ type: "error", data: err.message });
            return;
          }

          // Send the underlying ArrayBuffer (transferable)
          self.postMessage(
            {
              type: "zipChunk",
              data: zipped.buffer,
              chunkIndex: chunkIndex,
              totalChunks: totalChunks,
              isTxt: false,
            },
            [zipped.buffer],
          );
        });
        return;
      }

      const percent = Math.round((chunkIndex / totalChunks) * 95);
      const label = type === "txt" ? "Combining files" : "Compressing files";
      self.postMessage({
        type: "progress",
        percent: percent,
        text: label + "... " + chunkIndex + "/" + totalChunks,
      });
    } catch (err) {
      if (!cancelled) {
        self.postMessage({ type: "error", data: err.message });
      }
    }
  } else if (action === "cancel") {
    cancelled = true;
    self.postMessage({ type: "cancelled" });
  }
};

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0) + " " + units[i];
}
