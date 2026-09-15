import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { combineVoiceReferences } from "../src/audio.js";
import { decodeWav, encodeWav, highPassAndNormalize } from "../src/wav.js";

test("voice normalization preserves transient shape instead of hard clipping", () => {
  const samples = new Float32Array(44_100);
  samples[100] = 0.9;
  samples[1000] = 0.45;
  const result = highPassAndNormalize(samples, 44_100);
  assert.ok(Math.abs(result[100] / result[1000] - 2) < 0.01);
  assert.ok(Math.max(...result) <= 0.980001);
});

test("voice identity reference keeps the original sample and appends the clone", async () => {
  const root = await mkdtemp(join(tmpdir(), "voice-reference-"));
  const originalPath = join(root, "original.wav");
  const clonePath = join(root, "clone.wav");
  const outputPath = join(root, "combined.wav");
  try {
    await encodeWav(originalPath, new Float32Array(44_100 * 2).fill(0.1), 44_100);
    await encodeWav(clonePath, new Float32Array(44_100).fill(0.2), 44_100);
    await combineVoiceReferences([originalPath, clonePath], outputPath, 2.5);
    const combined = await decodeWav(outputPath);
    assert.equal(combined.duration, 2.5);
    assert.equal(combined.sampleRate, 44_100);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
