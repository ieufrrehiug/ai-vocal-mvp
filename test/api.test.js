import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createApp } from "../src/server.js";
import { dataRoot } from "../src/config.js";

let server;
let baseUrl;
const fixturePath = resolve(dataRoot, "test-voice-12s.wav");

function makeSilentWav(seconds = 12, sampleRate = 44_100) {
  const samples = seconds * sampleRate;
  const dataBytes = samples * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
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
  return buffer;
}

async function waitForJob(id) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await fetch(`${baseUrl}/api/jobs/${id}`);
    const job = await response.json();
    if (job.status === "completed" || job.status === "failed") return job;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error("任务测试超时");
}

before(async () => {
  await import("../scripts/generate-demo-assets.mjs");
  await mkdir(dataRoot, { recursive: true });
  await writeFile(fixturePath, makeSilentWav());
  const result = await createApp();
  await new Promise((resolvePromise) => {
    server = result.app.listen(0, "127.0.0.1", resolvePromise);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolvePromise) => server.close(resolvePromise));
  await rm(fixturePath, { force: true });
});

test("health and catalog expose the active demo engine", async () => {
  const health = await (await fetch(`${baseUrl}/api/health`)).json();
  const songs = await (await fetch(`${baseUrl}/api/songs`)).json();
  assert.equal(health.ok, true);
  assert.equal(health.engine.id, "demo");
  assert.equal(songs.length, 1);
  assert.equal(songs[0].guideVocal, undefined);
});

test("job endpoint requires explicit voice consent", async () => {
  const form = new FormData();
  form.set("songId", "demo-neon-night");
  form.set("consent", "false");
  form.set("voice", new Blob([await readFile(fixturePath)], { type: "audio/wav" }), "voice.wav");
  const response = await fetch(`${baseUrl}/api/jobs`, { method: "POST", body: form });
  assert.equal(response.status, 400);
});

test("job endpoint rejects an oversized pronunciation prompt", async () => {
  const form = new FormData();
  form.set("songId", "demo-neon-night");
  form.set("consent", "true");
  form.set("lyrics", "字".repeat(121));
  form.set("voice", new Blob([await readFile(fixturePath)], { type: "audio/wav" }), "voice.wav");
  const response = await fetch(`${baseUrl}/api/jobs`, { method: "POST", body: form });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /120/);
});

test("accepted job reaches completed and exposes both WAV outputs", async () => {
  const form = new FormData();
  form.set("songId", "demo-neon-night");
  form.set("consent", "true");
  form.set("voice", new Blob([await readFile(fixturePath)], { type: "audio/wav" }), "voice.wav");
  const response = await fetch(`${baseUrl}/api/jobs`, { method: "POST", body: form });
  assert.equal(response.status, 202);
  const created = await response.json();
  const completed = await waitForJob(created.id);
  assert.equal(completed.status, "completed", completed.error);
  assert.match(completed.outputs.mix, /\/files\/mix$/);
  assert.match(completed.outputs.vocal, /\/files\/vocal$/);
  const output = await fetch(`${baseUrl}${completed.outputs.mix}`);
  assert.equal(output.status, 200);
  assert.match(output.headers.get("content-type"), /audio|octet-stream/);
  assert.ok((await output.arrayBuffer()).byteLength > 44);
});

test("local song accepts aligned guide vocal and accompaniment WAV files", async () => {
  const guidePath = resolve(dataRoot, "songs", "demo", "guide-vocal.wav");
  const accompanimentPath = resolve(dataRoot, "songs", "demo", "accompaniment.wav");
  const form = new FormData();
  form.set("songId", "custom-local");
  form.set("customTitle", "本地测试歌曲");
  form.set("consent", "true");
  form.set("voice", new Blob([await readFile(fixturePath)], { type: "audio/wav" }), "voice.wav");
  form.set("guideVocal", new Blob([await readFile(guidePath)], { type: "audio/wav" }), "guide.wav");
  form.set("accompaniment", new Blob([await readFile(accompanimentPath)], { type: "audio/wav" }), "accompaniment.wav");
  const response = await fetch(`${baseUrl}/api/jobs`, { method: "POST", body: form });
  const created = await response.json();
  assert.equal(response.status, 202, created.error);
  const completed = await waitForJob(created.id);
  assert.equal(completed.status, "completed", completed.error);
  assert.equal(completed.songTitle, "本地测试歌曲");
  const output = await fetch(`${baseUrl}${completed.outputs.mix}`);
  assert.equal(output.status, 200);
  assert.ok((await output.arrayBuffer()).byteLength > 44);
});
