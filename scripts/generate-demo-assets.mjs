import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = resolve(projectRoot, "data", "songs", "demo");
const sampleRate = 44_100;
const durationSeconds = 32;

function midiToHz(note) {
  return 440 * 2 ** ((note - 69) / 12);
}

function envelope(position, length, attack = 0.03, release = 0.08) {
  const attackSamples = Math.max(1, Math.floor(length * attack));
  const releaseSamples = Math.max(1, Math.floor(length * release));
  if (position < attackSamples) return position / attackSamples;
  if (position > length - releaseSamples) return (length - position) / releaseSamples;
  return 1;
}

function wavBuffer(samples) {
  const dataBytes = samples.length * 2;
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
  for (let i = 0; i < samples.length; i += 1) {
    const clipped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(clipped * 32_767), 44 + i * 2);
  }
  return buffer;
}

function createGuide() {
  const notes = [60, 62, 64, 67, 64, 62, 60, 57, 60, 62, 64, 69, 67, 64, 62, 60];
  const noteSeconds = 2;
  const total = sampleRate * durationSeconds;
  const output = new Float32Array(total);
  for (let i = 0; i < total; i += 1) {
    const noteIndex = Math.min(notes.length - 1, Math.floor(i / (sampleRate * noteSeconds)));
    const local = i % (sampleRate * noteSeconds);
    const length = sampleRate * noteSeconds;
    const frequency = midiToHz(notes[noteIndex]);
    const time = i / sampleRate;
    const vibrato = noteIndex % 4 === 3 ? 1 + 0.006 * Math.sin(2 * Math.PI * 5.2 * time) : 1;
    const fundamental = Math.sin(2 * Math.PI * frequency * vibrato * time);
    const harmonic = 0.24 * Math.sin(2 * Math.PI * frequency * 2 * time + 0.3);
    output[i] = 0.32 * envelope(local, length) * (fundamental + harmonic);
  }
  return output;
}

function createAccompaniment() {
  const chords = [
    [48, 55, 60],
    [45, 52, 57],
    [41, 48, 53],
    [43, 50, 55],
  ];
  const chordSeconds = 4;
  const total = sampleRate * durationSeconds;
  const output = new Float32Array(total);
  for (let i = 0; i < total; i += 1) {
    const time = i / sampleRate;
    const chord = chords[Math.floor(time / chordSeconds) % chords.length];
    let pad = 0;
    for (const note of chord) {
      const frequency = midiToHz(note);
      pad += Math.sin(2 * Math.PI * frequency * time) + 0.16 * Math.sin(2 * Math.PI * frequency * 2 * time);
    }
    const beatPosition = time % 0.5;
    const kick = beatPosition < 0.08 ? Math.sin(2 * Math.PI * (72 - beatPosition * 500) * time) * Math.exp(-beatPosition * 38) : 0;
    output[i] = 0.095 * pad + 0.18 * kick;
  }
  return output;
}

await mkdir(outputDir, { recursive: true });
const guide = createGuide();
await writeFile(resolve(outputDir, "guide-vocal.wav"), wavBuffer(guide));
await writeFile(resolve(outputDir, "accompaniment.wav"), wavBuffer(createAccompaniment()));
await writeFile(resolve(outputDir, "voice-sample.wav"), wavBuffer(guide.slice(0, sampleRate * 12)));
console.log(`Demo assets written to ${outputDir}`);
