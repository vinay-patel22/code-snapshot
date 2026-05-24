export const DEFAULT_IGNORED = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".nuxt",
  "coverage",
  ".cache",
  ".DS_Store",
  "vendor",

  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",

  ".ssh",
  ".aws",
  ".vault",
  ".secrets",

  ".env",
  ".env.local",
  ".env.development.local",
  ".env.production.local",
  ".env.test.local",
  ".env.development",
  ".env.production",
  ".env.test",
  ".env.staging",
  ".env.*.local",
  ".envrc",
  ".env.example",

  "credentials.json",
  ".credentials",
  ".netrc",
  ".htaccess",
  "web.config",
  ".htpasswd",
  ".passwd",
  "config.php",
  "secrets.json",
  "thumbs.db",
]);

export const ASSET_FILE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".bmp",
  ".ico",
  ".webp",
  ".tiff",
  ".tif",
  ".svg",
  ".psd",
  ".ai",

  ".mp4",
  ".avi",
  ".mov",
  ".mkv",
  ".flv",
  ".wmv",
  ".webm",
  ".m4v",
  ".mts",
  ".m2ts",
  ".mxf",

  ".mp3",
  ".wav",
  ".aac",
  ".flac",
  ".ogg",
  ".m4a",
  ".wma",
  ".opus",
  ".aiff",

  ".ttf",
  ".woff",
  ".woff2",
  ".eot",
  ".otf",

  ".pdf",
  ".zip",
  ".tar",
  ".gz",
  ".rar",
  ".7z",
]);

export const STYLE_FILE_EXTENSIONS = new Set([
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".stylus",
  ".postcss",
  ".styl",
]);

export const SECURITY_FILE_EXTENSIONS = new Set([
  ".pem",
  ".key",
  ".crt",
  ".cert",
  ".cer",
  ".p8",
  ".p12",
  ".pfx",
  ".jks",
  ".pkcs12",
  ".pub",
  ".gpg",

  ".enc",
  ".encrypted",
  ".vault",

  ".account",
  ".api_key",
  ".apikey",

  ".bak",
  ".backup",
  ".swp",
  ".swo",
  "~",
]);

export function getIgnoreReason(
  path,
  ignoredSet = DEFAULT_IGNORED,
  ignoredExtensions = null,
) {
  if (!path) return { ignored: false, reason: "", category: "" };

  const lowerPath = path.replace(/\\/g, "/").toLowerCase();
  const normalizedIgnored = new Set(
    Array.from(ignoredSet || []).map((item) => String(item).toLowerCase()),
  );

  const pathComponents = lowerPath.split(/[\/\\]+/).filter(Boolean);

  const ignoredComponent = pathComponents.find((component) =>
    normalizedIgnored.has(component),
  );

  if (ignoredComponent) {
    return {
      ignored: true,
      reason: `${ignoredComponent} is ignored by default`,
      category: "default",
    };
  }

  const extensionsToCheck = [];
  if (ignoredExtensions) {
    extensionsToCheck.push({
      set: ignoredExtensions,
      reason: "Extension is excluded by the active filter",
      category: "custom",
    });
  }
  extensionsToCheck.push({
    set: ASSET_FILE_EXTENSIONS,
    reason: "Asset or binary extension is ignored by default",
    category: "asset",
  });
  extensionsToCheck.push({
    set: STYLE_FILE_EXTENSIONS,
    reason: "Style extension is ignored by default",
    category: "style",
  });
  extensionsToCheck.push({
    set: SECURITY_FILE_EXTENSIONS,
    reason: "Security-sensitive extension is ignored by default",
    category: "security",
  });

  if (pathComponents.length > 0) {
    const filename = pathComponents[pathComponents.length - 1];

    if (filename.startsWith(".env")) {
      return {
        ignored: true,
        reason: "Environment file is ignored by default",
        category: "security",
      };
    }

    const dotIndex = filename.lastIndexOf(".");
    if (dotIndex > 0) {
      const extension = filename.substring(dotIndex);

      for (const extRule of extensionsToCheck) {
        if (extRule.set.has(extension)) {
          return {
            ignored: true,
            reason: extRule.reason,
            category: extRule.category,
          };
        }
      }
    }
  }

  return { ignored: false, reason: "", category: "" };
}

export function shouldIgnore(
  path,
  ignoredSet = DEFAULT_IGNORED,
  ignoredExtensions = null,
) {
  return getIgnoreReason(path, ignoredSet, ignoredExtensions).ignored;
}
