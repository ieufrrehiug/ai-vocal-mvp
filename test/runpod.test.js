import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config } from "../src/config.js";
import { runRunpodBackend } from "../src/backends/runpod.js";

function makeSilentWav(sampleRate = 44_100) {
  const dataBytes = sampleRate * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVEfmt ", 8);
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
test("RunPod adapter submits, polls, and saves both outputs", async () => {
  const audio = makeSilentWav();
  let submitted;
  const server = createServer(async (request, response) => {
    if (request.url === "/endpoint/run") {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      submitted = JSON.parse(Buffer.concat(chunks));
      response.end(JSON.stringify({ id: "job-1" }));
      return;
    }
    response.end(JSON.stringify({
      status: "COMPLETED",
      output: {
        vocal_wav_b64: audio.toString("base64"),
        mix_wav_b64: audio.toString("base64"),
      },
    }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const root = await mkdtemp(join(tmpdir(), "runpod-test-"));
  const promptPath = join(root, "prompt.wav");
  const songPath = join(root, "song.wav");
  await Promise.all([writeFile(promptPath, audio), writeFile(songPath, audio)]);

  const previous = { ...config.runpod };
  Object.assign(config.runpod, {
    endpointId: "endpoint",
    apiKey: "secret",
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    timeoutSeconds: 5,
  });
  try {
    const output = await runRunpodBackend({
      promptPath,
      song: { custom: true, guideVocalPath: songPath, accompanimentPath: songPath },
      outputDir: join(root, "output"),
      onProgress() {},
    });
    assert.equal(submitted.input.target_vocal_only, false);
    assert.deepEqual(await readFile(output.vocalPath), audio);
    assert.deepEqual(await readFile(output.mixPath), audio);
  } finally {
    Object.assign(config.runpod, previous);
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
