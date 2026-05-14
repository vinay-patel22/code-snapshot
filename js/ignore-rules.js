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

export function shouldIgnore(
  path,
  ignoredSet = DEFAULT_IGNORED,
  ignoredExtensions = null,
) {
  if (!path) return false;

  const lowerPath = path.replace(/\\/g, "/").toLowerCase();

  const pathComponents = lowerPath.split(/[\/\\]+/).filter(Boolean);

  if (pathComponents.some((component) => ignoredSet.has(component))) {
    return true;
  }

  const extensionsToCheck = [];
  if (ignoredExtensions) {
    extensionsToCheck.push(ignoredExtensions);
  }
  extensionsToCheck.push(ASSET_FILE_EXTENSIONS);
  extensionsToCheck.push(STYLE_FILE_EXTENSIONS);
  extensionsToCheck.push(SECURITY_FILE_EXTENSIONS);

  if (pathComponents.length > 0) {
    const filename = pathComponents[pathComponents.length - 1];

    if (filename.startsWith(".env")) {
      return true;
    }

    const dotIndex = filename.lastIndexOf(".");
    if (dotIndex > 0) {
      const extension = filename.substring(dotIndex);

      for (const extSet of extensionsToCheck) {
        if (extSet.has(extension)) {
          return true;
        }
      }
    }
  }

  return false;
}
