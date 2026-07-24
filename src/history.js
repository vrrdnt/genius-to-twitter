import crypto from "node:crypto";
import { readJson, writeJsonAtomic } from "./storage.js";

export function fingerprint(text) {
  const normalized = text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

export async function loadHistory(file) {
  const state = await readJson(file, { version: 1, posts: [] });
  if (state?.version !== 1 || !Array.isArray(state.posts)) {
    throw new Error(`Unsupported history format in ${file}`);
  }
  return state;
}

export function recentFingerprints(history) {
  const fingerprints = new Set();
  for (const post of history.posts) {
    if (post.fingerprint) fingerprints.add(post.fingerprint);
    if (!post.text) continue;

    const attribution =
      post.songTitle && post.artistName
        ? `\n\n\u2014 ${post.songTitle} \u00b7 ${post.artistName}`
        : "";
    const snippet =
      attribution && post.text.endsWith(attribution)
        ? post.text.slice(0, -attribution.length)
        : post.text;
    fingerprints.add(fingerprint(snippet));
  }
  return fingerprints;
}

export async function recordPublishedPost(file, history, post, limit) {
  const entry = {
    fingerprint: post.fingerprint || fingerprint(post.text),
    text: post.text,
    songId: post.song.id,
    songTitle: post.song.title,
    artistName: post.song.artist.name,
    xPostId: post.xPostId,
    postedAt: new Date().toISOString(),
  };
  const next = {
    version: 1,
    posts: [entry, ...history.posts].slice(0, limit),
  };
  await writeJsonAtomic(file, next);
  return next;
}
