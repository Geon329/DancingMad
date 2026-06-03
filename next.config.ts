import type { NextConfig } from "next";

const exportMode = process.env.NEXT_OUTPUT_EXPORT === "true";
const configuredBasePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim() ?? "";
const normalizedBasePath =
  configuredBasePath.length > 0 && configuredBasePath !== "/"
    ? configuredBasePath.replace(/\/$/, "")
    : "";

const nextConfig: NextConfig = {
  ...(exportMode
    ? {
        output: "export",
        trailingSlash: true,
        images: {
          unoptimized: true
        }
      }
    : {}),
  ...(normalizedBasePath.length > 0
    ? {
        basePath: normalizedBasePath,
        assetPrefix: normalizedBasePath
      }
    : {})
};

export default nextConfig;
