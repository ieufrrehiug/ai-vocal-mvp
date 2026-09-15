import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { mixVocalAndAccompaniment, normalizePrompt } from "../audio.js";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function decodeAudio(value, name) {
  if (typeof value !== "string" || value.length < 32) {
    throw new Error(`云端没有返回有效的 ${name}`);
  }
  return Buffer.from(value, "base64");
}

async function request(url, options, apiKey) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || body.message || `RunPod 请求失败 (${response.status})`);
  }
  return body;
}

export async function runRunpodBackend({ promptPath, song, outputDir, onProgress }) {
  const { endpointId, apiKey, baseUrl, timeoutSeconds } = config.runpod;
  if (!endpointId || !apiKey) {
    throw new Error("RunPod 尚未配置：需要 RUNPOD_ENDPOINT_ID 和 RUNPOD_API_KEY");
  }

  const songPath = song.guideVocalPath || song.accompanimentPath;
  if (!songPath) throw new Error("没有可供转换的歌曲音频");

  onProgress(34, "正在准备并上传 30 秒音频到云端 GPU");
  await mkdir(outputDir, { recursive: true });
  const targetPath = path.join(outputDir, "target-30s.wav");
  await normalizePrompt(songPath, targetPath, 30);
  const [prompt, target] = await Promise.all([readFile(promptPath), readFile(targetPath)]);
  const root = `${baseUrl.replace(/\/$/, "")}/${endpointId}`;
  const started = await request(`${root}/run`, {
    method: "POST",
    body: JSON.stringify({
      input: {
        prompt_wav_b64: prompt.toString("base64"),
        song_wav_b64: target.toString("base64"),
        max_seconds: 30,
        n_steps: 32,
        cfg: 3,
        target_vocal_only: !song.custom,
      },
    }),
  }, apiKey);
  if (!started.id) throw new Error("RunPod 未返回任务 ID");

  const deadline = Date.now() + timeoutSeconds * 1000;
  let job;
  while (Date.now() < deadline) {
    job = await request(`${root}/status/${started.id}`, { method: "GET" }, apiKey);
    if (job.status === "COMPLETED") break;
    if (["FAILED", "TIMED_OUT", "CANCELLED"].includes(job.status)) {
      throw new Error(job.error || `RunPod 任务${job.status}`);
    }
    await wait(2000);
  }
  if (!job || job.status !== "COMPLETED") throw new Error("RunPod 处理超时");

  const output = job.output || {};
  onProgress(88, "正在下载并保存纯人声与成品混音");
  const vocalPath = path.join(outputDir, "vocal.wav");
  const mixPath = path.join(outputDir, "mix.wav");
  await writeFile(vocalPath, decodeAudio(output.vocal_wav_b64, "纯人声"));
  if (output.mix_wav_b64) {
    await writeFile(mixPath, decodeAudio(output.mix_wav_b64, "成品"));
  } else {
    await mixVocalAndAccompaniment(vocalPath, song.accompanimentPath, mixPath);
  }
  return { vocalPath, mixPath };
}
