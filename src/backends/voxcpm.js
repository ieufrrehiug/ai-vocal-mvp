import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config, projectRoot } from "../config.js";
import { combineVoiceReferences, normalizePrompt } from "../audio.js";
import { runProcess } from "../process.js";

const bridgePath = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "scripts", "voxcpm_clone.py");

export async function prepareVoxcpmPrompt({ promptPath, outputDir, text, onProgress }) {
  if (!config.voxcpm.enabled) return promptPath;
  await Promise.all([access(config.voxcpm.python), access(config.voxcpm.model)]);
  const outputPath = resolve(outputDir, "voxcpm-cloned-reference.wav");
  const cloneSnippetPath = resolve(outputDir, "voxcpm-reference-snippet.wav");
  const realSnippetPath = resolve(outputDir, "real-voice-reference.wav");
  const combinedPath = resolve(outputDir, "voice-identity-reference.wav");
  onProgress(29, "VoxCPM2 \u6b63\u5728\u63d0\u53d6\u5e76\u589e\u5f3a\u4f60\u7684\u771f\u5b9e\u97f3\u8272");
  const args = [
    bridgePath,
    "--model", config.voxcpm.model,
    "--reference", promptPath,
    "--output", outputPath,
    "--device", config.voxcpm.device,
  ];
  if (text) args.push("--text", text);
  await runProcess(config.voxcpm.python, args, { cwd: projectRoot, env: process.env });
  onProgress(31, "\u6b63\u5728\u5408\u5e76\u539f\u59cb\u58f0\u7eb9\u4e0e VoxCPM2 \u97f3\u8272\u53c2\u8003");
  await Promise.all([
    normalizePrompt(promptPath, realSnippetPath, 18),
    normalizePrompt(outputPath, cloneSnippetPath, 6),
  ]);
  await combineVoiceReferences([realSnippetPath, cloneSnippetPath], combinedPath, 25);
  return combinedPath;
}
