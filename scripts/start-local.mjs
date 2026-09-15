import { execFileSync } from "node:child_process";

function findOnPath(name) {
  try {
    return execFileSync(process.platform === "win32" ? "where.exe" : "which", [name], { encoding: "utf8" })
      .split(/\r?\n/)[0]
      .trim();
  } catch {
    return "";
  }
}

process.env.MODEL_BACKEND = "seedvc";
process.env.FFMPEG_PATH ||= findOnPath(process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
process.env.FFPROBE_PATH ||= findOnPath(process.platform === "win32" ? "ffprobe.exe" : "ffprobe");
process.env.PYTORCH_CUDA_ALLOC_CONF ||= "expandable_segments:True";
process.env.HF_HUB_DOWNLOAD_TIMEOUT ||= "600";

const { startServer } = await import("../src/server.js");
await startServer();
