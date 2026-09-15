import { readFile, writeFile } from "node:fs/promises";

function findChunk(buffer, id) {
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (chunkId === id) return { offset: offset + 8, size };
    offset += 8 + size + (size % 2);
  }
  return null;
}

export async function decodeWav(path) {
  const buffer = await readFile(path);
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("文件不是有效的 WAV 音频");
  }
  const fmt = findChunk(buffer, "fmt ");
  const data = findChunk(buffer, "data");
  if (!fmt || !data || fmt.size < 16) throw new Error("WAV 缺少 fmt 或 data 数据块");
  const format = buffer.readUInt16LE(fmt.offset);
  const channels = buffer.readUInt16LE(fmt.offset + 2);
  const sampleRate = buffer.readUInt32LE(fmt.offset + 4);
  const bits = buffer.readUInt16LE(fmt.offset + 14);
  if (![1, 3].includes(format) || ![16, 24, 32].includes(bits) || channels < 1 || channels > 8) {
    throw new Error("当前本地模式仅支持 PCM/Float WAV；配置 FFmpeg 后可支持更多格式");
  }
  const bytes = bits / 8;
  const frames = Math.floor(data.size / bytes / channels);
  const mono = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      const offset = data.offset + (frame * channels + channel) * bytes;
      if (format === 3 && bits === 32) sum += buffer.readFloatLE(offset);
      else if (bits === 16) sum += buffer.readInt16LE(offset) / 32_768;
      else if (bits === 24) sum += buffer.readIntLE(offset, 3) / 8_388_608;
      else sum += buffer.readInt32LE(offset) / 2_147_483_648;
    }
    mono[frame] = sum / channels;
  }
  return { samples: mono, sampleRate, duration: frames / sampleRate };
}

export function resample(samples, fromRate, toRate) {
  if (fromRate === toRate) return samples;
  const outputLength = Math.max(1, Math.floor(samples.length * toRate / fromRate));
  const output = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i += 1) {
    const source = i * fromRate / toRate;
    const left = Math.floor(source);
    const right = Math.min(samples.length - 1, left + 1);
    const fraction = source - left;
    output[i] = samples[left] * (1 - fraction) + samples[right] * fraction;
  }
  return output;
}

export function highPassAndNormalize(samples, sampleRate) {
  const output = new Float32Array(samples.length);
  const rc = 1 / (2 * Math.PI * 70);
  const dt = 1 / sampleRate;
  const alpha = rc / (rc + dt);
  let previousInput = 0;
  let previousOutput = 0;
  let energy = 0;
  let peak = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const value = alpha * (previousOutput + samples[i] - previousInput);
    output[i] = value;
    energy += value * value;
    peak = Math.max(peak, Math.abs(value));
    previousInput = samples[i];
    previousOutput = value;
  }
  const rms = Math.sqrt(energy / Math.max(1, output.length));
  const desiredGain = rms > 0.00001 ? Math.min(8, 0.1 / rms) : 1;
  const gain = peak > 0 ? Math.min(desiredGain, 0.98 / peak) : 1;
  for (let i = 0; i < output.length; i += 1) output[i] *= gain;
  return output;
}

function infoChunk(comment) {
  const text = Buffer.from(`${comment}\0`, "utf8");
  const padded = text.length + (text.length % 2);
  const chunk = Buffer.alloc(20 + padded);
  chunk.write("LIST", 0);
  chunk.writeUInt32LE(12 + padded, 4);
  chunk.write("INFO", 8);
  chunk.write("ICMT", 12);
  chunk.writeUInt32LE(text.length, 16);
  text.copy(chunk, 20);
  return chunk;
}

export async function encodeWav(path, samples, sampleRate = 44_100, comment = "AI-generated or AI-assisted audio") {
  const dataBytes = samples.length * 2;
  const metadata = infoChunk(comment);
  const buffer = Buffer.alloc(44 + dataBytes + metadata.length);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataBytes + metadata.length, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < samples.length; i += 1) {
    const clipped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(clipped * 32_767), 44 + i * 2);
  }
  metadata.copy(buffer, 44 + dataBytes);
  await writeFile(path, buffer);
}
