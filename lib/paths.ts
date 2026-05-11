import path from "node:path";

export function assertSafeRelativeUrl(value: unknown, label: string) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty relative URL.`);
  }
  if (/^[a-z][a-z0-9+.-]*:/iu.test(value) || value.startsWith("//")) {
    throw new Error(`${label} must not be an absolute URL.`);
  }
  if (value.startsWith("/")) {
    throw new Error(`${label} must be relative to the manifest URL.`);
  }
  if (value.includes("?") || value.includes("#")) {
    throw new Error(`${label} must not include query strings or fragments.`);
  }
  const segments = value.split("/");
  if (segments.some((segment) => segment === ".." || segment.includes("\\"))) {
    throw new Error(`${label} contains an unsafe path segment.`);
  }
  return value;
}

export function resolveArtifactPath(manifestDir: string, relativeUrl: string) {
  const target = path.resolve(manifestDir, relativeUrl);
  const root = path.resolve(manifestDir);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Artifact path escapes the manifest directory: ${relativeUrl}`);
  }
  return target;
}

export function toPublicPath(filePath: string, rootDir: string) {
  const relativePath = path.relative(path.resolve(rootDir), path.resolve(filePath));
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(`Path is outside the upload root: ${filePath}`);
  }
  return relativePath.split(path.sep).join("/");
}

export function joinPublicPath(basePath: string, relativePath: string) {
  return path.posix.normalize(path.posix.join(path.posix.dirname(basePath), relativePath));
}

export function blobPrefix(chainId: number | string, channelId: string) {
  return `channel-workspace/${String(chainId)}/${channelId}`;
}
