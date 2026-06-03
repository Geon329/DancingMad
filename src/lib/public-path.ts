const configuredBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const normalizedBasePath =
  configuredBasePath.length > 0 && configuredBasePath !== "/"
    ? configuredBasePath.replace(/\/$/, "")
    : "";

export function publicPath(path: string): string {
  if (path.startsWith("/")) {
    return `${normalizedBasePath}${path}`;
  }

  return `${normalizedBasePath}/${path}`;
}
