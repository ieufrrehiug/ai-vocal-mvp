import { extname } from "node:path";
import { config } from "./config.js";
import { runProcess } from "./process.js";
import { decodeWav, encodeWav, highPassAndNormalize, resample } from "./wav.js";

function hasExternalTools() {
  return Boolean(config.audioTools.ffmpegPath && config.audioTools.ffprobePath);
}

export async function probeAudio(inputPath) {
  if (extname(inputPath).toLowerCase() === ".wav") {
    const { duration } = await decodeWav(inputPath);
    return { duration };
  }
  if (!hasExternalTools()) throw new Error("当前环境只开放 WAV；配置 FFmpeg/FFprobe 后可上传 MP3、M4A 等格式");
  const { stdout } = await runProcess(config.audioTools.ffprobePath, [
    "-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "json", inputPath,
  ]);
  const info = JSON.parse(stdout);
  const duration = Number(info.format?.duration);
  if (!info.streams?.some((stream) => stream.codec_type === "audio") || !Number.isFinite(duration)) throw new Error("无法识别有效的音频轨道");
  return { duration };
}

export async function normalizePrompt(inputPath, outputPath, maxSeconds = 30) {
  if (extname(inputPath).toLowerCase() !== ".wav") {
    await runProcess(config.audioTools.ffmpegPath, [
      "-y", "-v", "error", "-i", inputPath, "-t", String(maxSeconds), "-ac", "1", "-ar", "44100",
      "-af", "highpass=f=70,lowpass=f=14000,loudnorm=I=-20:TP=-2:LRA=9", outputPath,
    ]);
    return;
  }
  const decoded = await decodeWav(inputPath);
  const resampled = resample(decoded.samples, decoded.sampleRate, 44_100);
  const trimmed = resampled.slice(0, Math.floor(maxSeconds * 44_100));
  await encodeWav(outputPath, highPassAndNormalize(trimmed, 44_100), 44_100, "User-provided voice reference");
}

export async function combineVoiceReferences(inputPaths, outputPath, maxSeconds = 30) {
  const sampleRate = 44_100;
  const gap = new Float32Array(Math.floor(sampleRate * 0.15));
  const chunks = [];
  for (const inputPath of inputPaths) {
    const decoded = await decodeWav(inputPath);
    const samples = resample(decoded.samples, decoded.sampleRate, sampleRate);
    chunks.push(highPassAndNormalize(samples, sampleRate));
  }
  const length = chunks.reduce((total, samples) => total + samples.length, 0)
    + gap.length * Math.max(0, chunks.length - 1);
  const combined = new Float32Array(length);
  let offset = 0;
  for (const [index, samples] of chunks.entries()) {
    combined.set(samples, offset);
    offset += samples.length;
    if (index < chunks.length - 1) offset += gap.length;
  }
  await encodeWav(outputPath, combined.slice(0, sampleRate * maxSeconds), sampleRate, "User voice plus AI-assisted identity reference");
}


export async function tagGeneratedAudio(inputPath, outputPath) {
  const decoded = await decodeWav(inputPath);
  await encodeWav(outputPath, resample(decoded.samples, decoded.sampleRate, 44_100));
}

export async function mixVocalAndAccompaniment(vocalPath, accompanimentPath, outputPath) {
  const vocal = await decodeWav(vocalPath);
  const accompaniment = await decodeWav(accompanimentPath);
  const vocalSamples = resample(vocal.samples, vocal.sampleRate, 44_100);
  const accompanimentSamples = resample(accompaniment.samples, accompaniment.sampleRate, 44_100);
  const length = Math.min(vocalSamples.length, accompanimentSamples.length);
  const mixed = new Float32Array(length);
  let peak = 0;
  for (let i = 0; i < length; i += 1) {
    mixed[i] = vocalSamples[i] * 1.05 + accompanimentSamples[i] * 0.82;
    peak = Math.max(peak, Math.abs(mixed[i]));
  }
  const gain = peak > 0.95 ? 0.95 / peak : 1;
  if (gain !== 1) for (let i = 0; i < length; i += 1) mixed[i] *= gain;
  await encodeWav(outputPath, mixed, 44_100);
}

export async function copyAsGenerated(inputPath, outputPath) {
  await tagGeneratedAudio(inputPath, outputPath);
}
