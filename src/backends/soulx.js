import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { mixVocalAndAccompaniment, tagGeneratedAudio } from "../audio.js";
import { runProcess } from "../process.js";

const bridgePath = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "scripts", "soulx_bridge.py");

export async function runSoulxBackend({ song, promptPath, outputDir, onProgress }) {
  if (!config.soulx.root) throw new Error("SOULX_ROOT 未配置，无法启动真实模型");
  await access(resolve(config.soulx.root, "pretrained_models", "SoulX-Singer", "model-svc.pt"));
  const rawVocalPath = resolve(outputDir, "soulx-vocal-raw.wav");
  const vocalPath = resolve(outputDir, "generated-vocal.wav");
  const mixPath = resolve(outputDir, "generated-mix.wav");

  onProgress(34, "正在提取用户音色与原唱 F0");
  const args = [
    bridgePath,
    "--root", config.soulx.root,
    "--prompt", promptPath,
    "--target", song.guideVocalPath,
    "--output", rawVocalPath,
    "--device", config.soulx.device,
    "--n-steps", String(config.soulx.nSteps),
    "--cfg", String(config.soulx.cfg),
  ];
  if (config.soulx.fp16) args.push("--fp16");
  await runProcess(config.soulx.python, args, {
    cwd: config.soulx.root,
    env: { ...process.env, PYTHONPATH: config.soulx.root },
  });

  onProgress(78, "正在标准化 AI 人声并自动混音");
  await tagGeneratedAudio(rawVocalPath, vocalPath);
  await mixVocalAndAccompaniment(vocalPath, song.accompanimentPath, mixPath);
  return { vocalPath, mixPath };
}
