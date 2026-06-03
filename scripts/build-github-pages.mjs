import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "";
const isUserOrOrgPagesRepo = repositoryName.endsWith(".github.io");
const defaultBasePath =
  process.env.GITHUB_ACTIONS === "true" && repositoryName.length > 0 && !isUserOrOrgPagesRepo
    ? `/${repositoryName}`
    : "";
const nextCliPath = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));

const child = spawn(process.execPath, [nextCliPath, "build"], {
  env: {
    ...process.env,
    NEXT_OUTPUT_EXPORT: "true",
    NEXT_PUBLIC_BASE_PATH: process.env.NEXT_PUBLIC_BASE_PATH ?? defaultBasePath
  },
  shell: false,
  stdio: "inherit"
});

child.on("exit", async (code, signal) => {
  if (signal !== null) {
    process.kill(process.pid, signal);
    return;
  }

  if (code === 0) {
    await rm(new URL("../out/board", import.meta.url), { recursive: true, force: true });
  }

  process.exit(code ?? 1);
});
