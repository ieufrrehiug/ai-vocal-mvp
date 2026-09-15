import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { mixVocalAndAccompaniment, tagGeneratedAudio } from "../audio.js";
import { runProcess } from "../process.js";

const bridgePath = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "scripts", "seedvc_bridge.py");

export async function runSeedvcBackend({ song, promptPath, outputDir, onProgress }) {
  await Promise.all([
    access(config.seedvc.python),
    access(resolve(config.seedvc.root, "inference.py")),
  ]);
  const rawVocalPath = resolve(outputDir, "seedvc-vocal-raw.wav");
  const vocalPath = resolve(outputDir, "generated-vocal.wav");
  const separatedAccompaniment = resolve(outputDir, "seedvc-accompaniment.wav");
  const mixPath = resolve(outputDir, "generated-mix.wav");
  const args = [
    bridgePath,
    "--root", config.seedvc.root,
    "--source", song.guideVocalPath,
    "--reference", promptPath,
    "--output", rawVocalPath,
    "--steps", String(config.seedvc.steps),
    "--cfg", String(config.seedvc.cfg),
  ];
  if (song.custom) args.push("--separate", "--accompaniment-output", separatedAccompaniment);
  onProgress(34, song.custom ? "正在本地分离原唱与伴奏" : "正在提取原唱旋律与用户音色");
  await runProcess(config.seedvc.python, args, {
    cwd: config.seedvc.root,
    env: { ...process.env, PYTHONPATH: config.seedvc.root },
  });
  onProgress(82, "正在本地混音并生成试听文件");
  await tagGeneratedAudio(rawVocalPath, vocalPath);
  await mixVocalAndAccompaniment(vocalPath, song.custom ? separatedAccompaniment : song.accompanimentPath, mixPath);
  return { vocalPath, mixPath };
}
