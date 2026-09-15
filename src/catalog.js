import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { dataRoot } from "./config.js";

const catalogPath = resolve(dataRoot, "catalog.json");

function safeAssetPath(assetPath) {
  if (!assetPath || isAbsolute(assetPath)) throw new Error("曲库素材路径必须是 data 目录下的相对路径");
  const absolute = resolve(dataRoot, assetPath);
  const child = relative(dataRoot, absolute);
  if (child.startsWith("..") || isAbsolute(child)) throw new Error("曲库素材路径越界");
  return absolute;
}

export async function loadCatalog() {
  const songs = JSON.parse(await readFile(catalogPath, "utf8"));
  return songs.filter((song) => song.enabled).map((song) => ({
    ...song,
    guideVocalPath: safeAssetPath(song.guideVocal),
    accompanimentPath: safeAssetPath(song.accompaniment),
  }));
}

export function publicSong(song) {
  const { guideVocal, accompaniment, guideVocalPath, accompanimentPath, ...safe } = song;
  return safe;
}

export async function findSong(songId) {
  const songs = await loadCatalog();
  return songs.find((song) => song.id === songId) || null;
}
