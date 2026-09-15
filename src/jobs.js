import { mkdir, rm, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { config, jobsRoot } from "./config.js";
import { normalizePrompt, probeAudio } from "./audio.js";
import { runDemoBackend } from "./backends/demo.js";
import { runSeedvcBackend } from "./backends/seedvc.js";
import { runSoulxBackend } from "./backends/soulx.js";
import { runRunpodBackend } from "./backends/runpod.js";
import { prepareVoxcpmPrompt } from "./backends/voxcpm.js";

const terminalStatuses = new Set(["completed", "failed"]);

export class JobManager {
  constructor() {
    this.jobs = new Map();
    this.queue = [];
    this.running = false;
  }

  async create({ song, uploadPath, originalName, lyrics = "", temporaryPaths = [uploadPath] }) {
    const id = randomUUID();
    const outputDir = resolve(jobsRoot, id);
    await mkdir(outputDir, { recursive: true });
    const job = {
      id,
      song,
      uploadPath,
      originalName,
      lyrics,
      temporaryPaths,
      outputDir,
      status: "queued",
      progress: 8,
      message: "任务已进入单卡队列",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      outputs: null,
      error: null,
      backend: config.backend,
    };
    this.jobs.set(id, job);
    this.queue.push(id);
    void this.drain();
    return this.publicJob(job);
  }

  publicJob(job) {
    return {
      id: job.id,
      songId: job.song.id,
      songTitle: job.song.title,
      status: job.status,
      progress: job.progress,
      message: job.message,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      backend: job.backend,
      error: job.error,
      outputs: job.outputs ? {
        vocal: `/api/jobs/${job.id}/files/vocal`,
        mix: `/api/jobs/${job.id}/files/mix`,
      } : null,
    };
  }

  get(id) {
    const job = this.jobs.get(id);
    return job ? this.publicJob(job) : null;
  }

  output(id, kind) {
    const job = this.jobs.get(id);
    if (!job || job.status !== "completed") return null;
    if (kind !== "vocal" && kind !== "mix") return null;
    return { path: job.outputs[`${kind}Path`], name: `${job.song.id}-${kind}.wav` };
  }

  update(job, progress, message) {
    job.progress = progress;
    job.message = message;
    job.updatedAt = new Date().toISOString();
  }

  async drain() {
    if (this.running) return;
    this.running = true;
    while (this.queue.length) {
      const id = this.queue.shift();
      const job = this.jobs.get(id);
      if (!job || terminalStatuses.has(job.status)) continue;
      await this.process(job);
    }
    this.running = false;
  }

  async process(job) {
    job.status = "processing";
    try {
      this.update(job, 15, "正在验证声音长度和音频格式");
      const { duration } = await probeAudio(job.uploadPath);
      if (duration < config.minPromptSeconds || duration > config.maxPromptSeconds + 0.5) {
        throw new Error(`声音样本需为 ${config.minPromptSeconds}–${config.maxPromptSeconds} 秒，当前约 ${duration.toFixed(1)} 秒`);
      }

      if (job.song.custom) {
        this.update(job, 20, "正在检查本地歌曲双音轨是否对齐");
        const [guide, accompaniment] = await Promise.all([
          probeAudio(job.song.guideVocalPath),
          probeAudio(job.song.accompanimentPath),
        ]);
        if (guide.duration < 5 || guide.duration > 600 || accompaniment.duration < 5 || accompaniment.duration > 600) {
          throw new Error("本地歌曲需为 5–600 秒");
        }
        if (Math.abs(guide.duration - accompaniment.duration) > 0.75) {
          throw new Error(`原唱人声与伴奏时长需一致，当前相差 ${Math.abs(guide.duration - accompaniment.duration).toFixed(1)} 秒`);
        }
      }

      const promptPath = resolve(job.outputDir, "prompt-normalized.wav");
      this.update(job, 24, "正在降噪、归一化并转换为 44.1kHz 单声道");
      await normalizePrompt(job.uploadPath, promptPath, config.maxPromptSeconds);
      const modelPromptPath = config.backend === "demo" ? promptPath : await prepareVoxcpmPrompt({
        promptPath,
        outputDir: job.outputDir,
        text: job.lyrics,
        onProgress: (progress, message) => this.update(job, progress, message),
      });
      const runBackend = config.backend === "seedvc" ? runSeedvcBackend
        : config.backend === "soulx" ? runSoulxBackend
        : config.backend === "runpod" ? runRunpodBackend
          : runDemoBackend;
      const outputs = await runBackend({
        song: job.song,
        promptPath: modelPromptPath,
        outputDir: job.outputDir,
        onProgress: (progress, message) => this.update(job, progress, message),
      });
      job.outputs = outputs;
      job.status = "completed";
      this.update(job, 100, config.backend === "demo" ? "流程演示已完成（未进行真实音色克隆）" : "你的副歌试听已生成");
    } catch (error) {
      job.status = "failed";
      job.error = error instanceof Error ? error.message : String(error);
      this.update(job, 100, "生成失败，请检查声音样本或后端配置");
    } finally {
      await Promise.all(job.temporaryPaths.map((path) => rm(path, { force: true }).catch(() => {})));
    }
  }

  startCleanupTimer() {
    const timer = setInterval(() => void this.cleanup(), 60 * 60 * 1000);
    timer.unref();
  }

  async cleanup() {
    const cutoff = Date.now() - config.jobTtlHours * 60 * 60 * 1000;
    for (const [id, job] of this.jobs) {
      if (!terminalStatuses.has(job.status)) continue;
      const info = await stat(job.outputDir).catch(() => null);
      if (info && info.mtimeMs < cutoff) {
        await rm(job.outputDir, { recursive: true, force: true });
        this.jobs.delete(id);
      }
    }
  }
}
