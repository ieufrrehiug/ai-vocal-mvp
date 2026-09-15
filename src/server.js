import express from "express";
import multer from "multer";
import { mkdir, rm } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { allowedAudioExtensions, config, projectRoot, publicEngineInfo, uploadsRoot, jobsRoot } from "./config.js";
import { findSong, loadCatalog, publicSong } from "./catalog.js";
import { JobManager } from "./jobs.js";

export async function createApp() {
  await mkdir(uploadsRoot, { recursive: true });
  await mkdir(jobsRoot, { recursive: true });
  const manager = new JobManager();
  manager.startCleanupTimer();

  const upload = multer({
    storage: multer.diskStorage({
      destination: uploadsRoot,
      filename: (_request, file, callback) => callback(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`),
    }),
    limits: { fileSize: config.maxUploadBytes, files: 3 },
    fileFilter: (_request, file, callback) => {
      const extension = extname(file.originalname).toLowerCase();
      callback(null, allowedAudioExtensions().includes(extension));
    },
  });

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));
  app.use(express.static(resolve(projectRoot, "public"), { extensions: ["html"] }));

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true, engine: publicEngineInfo() });
  });

  app.get("/api/config", (_request, response) => {
    response.json({
      engine: publicEngineInfo(),
      upload: {
        minSeconds: config.minPromptSeconds,
        maxSeconds: config.maxPromptSeconds,
        maxMegabytes: config.maxUploadBytes / 1024 / 1024,
        extensions: allowedAudioExtensions(),
      },
      retentionHours: config.jobTtlHours,
    });
  });

  app.get("/api/songs", async (_request, response, next) => {
    try {
      response.json((await loadCatalog()).map(publicSong));
    } catch (error) {
      next(error);
    }
  });

  const jobUpload = upload.fields([
    { name: "voice", maxCount: 1 },
    { name: "guideVocal", maxCount: 1 },
    { name: "accompaniment", maxCount: 1 },
  ]);

  app.post("/api/jobs", jobUpload, async (request, response, next) => {
    const files = request.files || {};
    const voiceFile = files.voice?.[0];
    const guideVocalFile = files.guideVocal?.[0];
    const accompanimentFile = files.accompaniment?.[0];
    const uploadedPaths = [voiceFile, guideVocalFile, accompanimentFile].filter(Boolean).map((file) => file.path);
    const removeUploads = () => Promise.all(uploadedPaths.map((path) => rm(path, { force: true }).catch(() => {})));
    try {
      if (!voiceFile) {
        await removeUploads();
        return response.status(400).json({ error: "请选择支持的声音样本" });
      }
      if (request.body.consent !== "true") {
        await removeUploads();
        return response.status(400).json({ error: "需要确认声音授权与 AI 生成说明" });
      }
      const lyrics = String(request.body.lyrics || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
      if (lyrics.length > 120) {
        await removeUploads();
        return response.status(400).json({ error: "歌词或发音提示不能超过 120 字" });
      }
      let song;
      if (request.body.songId === "custom-local") {
        const title = String(request.body.customTitle || "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 60);
        if (!title || !guideVocalFile || !accompanimentFile) {
          await removeUploads();
          return response.status(400).json({ error: "本地歌曲需要名称、原唱人声和伴奏两个 WAV 文件" });
        }
        song = {
          id: `custom-${randomUUID()}`,
          title,
          artist: "本地授权素材",
          guideVocalPath: guideVocalFile.path,
          accompanimentPath: accompanimentFile.path,
          custom: true,
        };
      } else {
        song = await findSong(request.body.songId);
      }
      if (!song) {
        await removeUploads();
        return response.status(404).json({ error: "歌曲不存在或尚未开放" });
      }
      const job = await manager.create({
        song,
        uploadPath: voiceFile.path,
        originalName: voiceFile.originalname,
        lyrics,
        temporaryPaths: uploadedPaths,
      });
      response.status(202).json(job);
    } catch (error) {
      await removeUploads();
      next(error);
    }
  });

  app.get("/api/jobs/:id", (request, response) => {
    const job = manager.get(request.params.id);
    if (!job) return response.status(404).json({ error: "任务不存在或已过期" });
    response.json(job);
  });

  app.get("/api/jobs/:id/files/:kind", (request, response) => {
    const output = manager.output(request.params.id, request.params.kind);
    if (!output) return response.status(404).json({ error: "文件尚未生成或已过期" });
    const download = request.query.download === "1";
    if (download) response.download(output.path, output.name);
    else response.sendFile(output.path);
  });

  app.use((error, _request, response, _next) => {
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      return response.status(413).json({ error: "音频文件不能超过 50MB" });
    }
    console.error(error);
    response.status(500).json({ error: error instanceof Error ? error.message : "服务器内部错误" });
  });

  return { app, manager };
}

export async function startServer() {
  const { app } = await createApp();
  return app.listen(config.port, "127.0.0.1", () => {
    console.log(`AI 修歌 MVP 已启动：http://127.0.0.1:${config.port}`);
    console.log(`模型后端：${publicEngineInfo().label}`);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await startServer();
}
