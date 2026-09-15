import { resolve } from "node:path";
import { copyAsGenerated, mixVocalAndAccompaniment } from "../audio.js";

export async function runDemoBackend({ song, outputDir, onProgress }) {
  onProgress(52, "演示引擎正在生成流程占位结果");
  const vocalPath = resolve(outputDir, "generated-vocal.wav");
  const mixPath = resolve(outputDir, "generated-mix.wav");
  await copyAsGenerated(song.guideVocalPath, vocalPath);
  onProgress(76, "正在混入伴奏并写入 AI 标识");
  await mixVocalAndAccompaniment(vocalPath, song.accompanimentPath, mixPath);
  return { vocalPath, mixPath };
}
