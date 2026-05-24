export function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / 1024 ** i).toFixed(i ? 1 : 0) + " " + units[i];
}

export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

export function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}

export function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function escapeForAttr(value) {
  return escapeAttr(value);
}

export function getExtension(path) {
  const lowerPath = path.toLowerCase();
  const dotIndex = lowerPath.lastIndexOf(".");
  return dotIndex > 0 ? lowerPath.substring(dotIndex) : "";
}

export function memoize(fn, keyGenerator = (...args) => JSON.stringify(args)) {
  const cache = new Map();
  return function memoized(...args) {
    const key = keyGenerator(...args);
    if (cache.has(key)) {
      return cache.get(key);
    }
    const result = fn.apply(this, args);
    cache.set(key, result);
    return result;
  };
}

export function createMemoizedCache() {
  const cache = new Map();
  return {
    get(key) {
      return cache.get(key);
    },
    set(key, value) {
      cache.set(key, value);
    },
    has(key) {
      return cache.has(key);
    },
    clear() {
      cache.clear();
    },
    delete(key) {
      cache.delete(key);
    },
  };
}
