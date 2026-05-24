// State management utilities

const STORAGE_KEYS = {
  sidebarWidth: "codeSnapshot.sidebarWidth",
  sort: "codeSnapshot.sort",
  lastExport: "codeSnapshot.lastExport",
};

export function getStoredValue(key, fallback) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

export function setStoredValue(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Local storage can be disabled in private browser contexts.
  }
}

export function createAppState() {
  return {
    files: new Map(),
    warnings: new Map(),
    ignoredItems: [],
    selectedPaths: new Set(),
    excludedPaths: new Set(),
    isExporting: false,
    exportCancelled: false,
    abortController: null,
    filter: {
      query: "",
      category: "all",
      sort: getStoredValue(STORAGE_KEYS.sort, "path-asc"),
    },
  };
}

export { STORAGE_KEYS };
