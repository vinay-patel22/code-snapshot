// Export functions (fflate + Worker)

export async function startExportWorker(type, files, onProgress, signal) {
  return new Promise(function (resolve, reject) {
    const worker = new Worker("./js/export-worker.js");
    const filesArray = Array.from(files);

    const CHUNK_SIZE = 50;
    const totalChunks = Math.ceil(filesArray.length / CHUNK_SIZE);
    let currentChunk = 0;
    let cancelled = false;

    const txtBlobs = [];
    const zipChunks = [];

    worker.onmessage = async function (e) {
      const msg = e.data;
      const msgType = msg.type;
      const data = msg.data;
      const chunkIndex = msg.chunkIndex;
      const totalChunksWorker = msg.totalChunks;
      const isTxt = msg.isTxt;
      const percent = msg.percent;
      const text = msg.text;

      if (msgType === "progress") {
        onProgress(percent, text);
      } else if (msgType === "txtChunk") {
        const blob = new Blob([data], { type: "text/plain" });
        txtBlobs.push(blob);
        currentChunk++;

        if (currentChunk >= totalChunksWorker) {
          const finalBlob = new Blob(txtBlobs, { type: "text/plain" });
          worker.terminate();
          resolve(finalBlob);
        } else {
          await sendNextChunk();
        }
      } else if (msgType === "zipChunk") {
        zipChunks.push(new Uint8Array(data));
        currentChunk++;

        if (currentChunk >= totalChunksWorker) {
          const finalBlob = new Blob(zipChunks, { type: "application/zip" });
          worker.terminate();
          resolve(finalBlob);
        } else {
          await sendNextChunk();
        }
      } else if (msgType === "error") {
        worker.terminate();
        reject(new Error(data));
      } else if (msgType === "cancelled") {
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

    worker.postMessage({ type: type, action: "start" });

    async function sendNextChunk() {
      if (currentChunk >= totalChunks || cancelled) return;

      const start = currentChunk * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, filesArray.length);
      const chunkFiles = filesArray.slice(start, end);

      const filesWithData = await Promise.all(
        chunkFiles.map(async function (f) {
          return {
            path: f.path,
            name: f.name,
            size: f.size,
            data: new Uint8Array(await f.file.arrayBuffer()),
          };
        }),
      );

      worker.postMessage({
        type: type,
        action: "processChunk",
        files: filesWithData,
        chunkIndex: currentChunk + 1,
        totalChunks: totalChunks,
      });
    }

    sendNextChunk().catch(reject);
  });
}

export function downloadBlob(blob, filename, mime) {
  mime = mime || "application/octet-stream";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () {
    URL.revokeObjectURL(url);
  }, 100);
}
