import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const dataRoot = resolve(projectRoot, "data");
export const uploadsRoot = resolve(dataRoot, "uploads");
export const jobsRoot = resolve(dataRoot, "jobs");
const localVoxcpmPython = resolve(projectRoot, "VoxCPM", ".venv", "Scripts", "python.exe");
const localVoxcpmModel = resolve(projectRoot, "VoxCPM", "pretrained_models", "VoxCPM2");
const localSeedvcRoot = resolve(projectRoot, "Seed-VC");
const localSeedvcPython = resolve(localSeedvcRoot, ".venv", "Scripts", "python.exe");

function numberFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

export const config = {
  port: numberFromEnv("PORT", 3000),
  backend: ["seedvc", "soulx", "runpod"].includes(process.env.MODEL_BACKEND) ? process.env.MODEL_BACKEND : "demo",
  maxUploadBytes: 50 * 1024 * 1024,
  minPromptSeconds: 10,
  maxPromptSeconds: 30,
  jobTtlHours: numberFromEnv("JOB_TTL_HOURS", 24),
  audioTools: {
    ffmpegPath: process.env.FFMPEG_PATH || "",
    ffprobePath: process.env.FFPROBE_PATH || "",
  },
  voxcpm: {
    enabled: process.env.VOXCPM_ENABLED === "true"
      || (process.env.VOXCPM_ENABLED !== "false" && existsSync(localVoxcpmPython) && existsSync(localVoxcpmModel)),
    python: process.env.VOXCPM_PYTHON || localVoxcpmPython,
    model: process.env.VOXCPM_MODEL || localVoxcpmModel,
    device: process.env.VOXCPM_DEVICE || "cuda",
  },
  seedvc: {
    root: process.env.SEEDVC_ROOT || localSeedvcRoot,
    python: process.env.SEEDVC_PYTHON || localSeedvcPython,
    steps: numberFromEnv("SEEDVC_STEPS", 50),
    cfg: numberFromEnv("SEEDVC_CFG", 0.7),
  },
  soulx: {
    root: process.env.SOULX_ROOT || "",
    python: process.env.SOULX_PYTHON || "python",
    device: process.env.SOULX_DEVICE || "cuda:0",
    fp16: process.env.SOULX_FP16 !== "false",
    nSteps: numberFromEnv("SOULX_N_STEPS", 32),
    cfg: numberFromEnv("SOULX_CFG", 1.0),
  },
  runpod: {
    endpointId: process.env.RUNPOD_ENDPOINT_ID || "",
    apiKey: process.env.RUNPOD_API_KEY || "",
    baseUrl: process.env.RUNPOD_BASE_URL || "https://api.runpod.ai/v2",
    timeoutSeconds: numberFromEnv("RUNPOD_TIMEOUT_SECONDS", 900),
  },
};

export function publicEngineInfo() {
  const enhanced = config.voxcpm.enabled ? "VoxCPM2 音色增强 + " : "";
  if (config.backend === "seedvc") {
    return {
      id: "seedvc",
      label: `${enhanced}Seed-VC 本地 GPU`,
      ready: existsSync(config.seedvc.python) && existsSync(resolve(config.seedvc.root, "inference.py")),
      note: "音频仅在本机处理，零样本歌声音色转换",
    };
  }
  if (config.backend === "runpod") {
    return {
      id: "runpod",
      label: `${enhanced}SoulX 云端 GPU`,
      ready: Boolean(config.runpod.endpointId && config.runpod.apiKey),
      note: "云端零样本音色转换，最大程度保留本人音色",
    };
  }
  if (config.backend === "soulx") {
    return {
      id: "soulx",
      label: `${enhanced}SoulX-Singer-SVC`,
      ready: Boolean(config.soulx.root),
      note: "真实歌声音色转换后端",
    };
  }
  return {
    id: "demo",
    label: "流程演示引擎",
    ready: true,
    note: "仅验证上传、排队、混音和下载，不会克隆用户音色",
  };
}

export function allowedAudioExtensions() {
  const extensions = [".wav"];
  if (config.audioTools.ffmpegPath && config.audioTools.ffprobePath) {
    extensions.push(".mp3", ".m4a", ".aac", ".flac", ".ogg", ".webm");
  }
  return extensions;
}
