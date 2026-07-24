import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "../src/config.js";
import { runPost } from "../src/bot.js";
import { loadHistory } from "../src/history.js";

const silentLogger = { info() {}, warn() {}, error() {} };

async function fixture(context) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "lyric-bot-"));
  context.after(() => fs.rm(dataDir, { recursive: true, force: true }));
  const config = loadConfig({
    DATA_DIR: dataDir,
    ARTIST_IDS: "7",
    GENIUS_ACCESS_TOKEN: "genius-test-token",
    X_API_KEY: "key",
    X_API_KEY_SECRET: "secret",
    X_ACCESS_TOKEN: "access",
    X_ACCESS_TOKEN_SECRET: "access-secret",
    MIN_LINES: "2",
    MAX_LINES: "2",
  });
  await fs.writeFile(
    config.catalogFile,
    JSON.stringify({
      version: 1,
      syncedAt: new Date().toISOString(),
      artists: [{ id: 7, name: "Example Artist" }],
      songs: [
        {
          id: 42,
          title: "A Small Song",
          fullTitle: "A Small Song by Example Artist",
          artist: { id: 7, name: "Example Artist" },
        },
      ],
    }),
  );
  return config;
}

const lyricsFetcher = async () => ({
  song: {
    id: 42,
    title: "A Small Song",
    fullTitle: "A Small Song by Example Artist",
    artist: { id: 7, name: "Example Artist" },
  },
  lyrics: "[Verse]\nThe morning put its coat on\nThe city answered back.",
});

test("dry runs prepare a post without modifying history", async (context) => {
  const config = await fixture(context);
  const result = await runPost(config, {
    logger: silentLogger,
    lyricsFetcher,
    random: () => 0,
  });
  assert.equal(result.published, false);
  assert.match(result.text, /city answered back/);
  assert.equal((await loadHistory(config.historyFile)).posts.length, 0);
});

test("published posts use X API service and are persisted for deduplication", async (context) => {
  const config = await fixture(context);
  let publishedText;
  let replyRequest;
  const result = await runPost(config, {
    publish: true,
    logger: silentLogger,
    lyricsFetcher,
    publisher: async (_credentials, text) => {
      publishedText = text;
      return { id: "123456" };
    },
    replier: async (_credentials, text, inReplyToId) => {
      replyRequest = { text, inReplyToId };
      return { id: "123457" };
    },
    random: () => 0,
  });

  assert.equal(result.published, true);
  assert.equal(result.xPostId, "123456");
  assert.equal(result.attributionXPostId, "123457");
  assert.equal(publishedText, result.text);
  assert.deepEqual(replyRequest, {
    text: "— A Small Song · Example Artist",
    inReplyToId: "123456",
  });
  assert.equal((await loadHistory(config.historyFile)).posts[0].xPostId, "123456");

  await assert.rejects(
    runPost(config, {
      publish: true,
      logger: silentLogger,
      lyricsFetcher,
      publisher: async () => assert.fail("duplicate should not be published"),
      random: () => 0,
    }),
    /no new coherent snippets/,
  );
});

test("a failed attribution reply records the lyric post and prevents a duplicate retry", async (context) => {
  const config = await fixture(context);

  await assert.rejects(
    runPost(config, {
      publish: true,
      logger: silentLogger,
      lyricsFetcher,
      publisher: async () => ({ id: "main-post" }),
      replier: async () => {
        throw new Error("HTTP 403 | Forbidden");
      },
      random: () => 0,
    }),
    /Published X Post main-post.*attribution reply failed.*already recorded/su,
  );

  const history = await loadHistory(config.historyFile);
  assert.equal(history.posts[0].xPostId, "main-post");

  await assert.rejects(
    runPost(config, {
      publish: true,
      logger: silentLogger,
      lyricsFetcher,
      publisher: async () => assert.fail("recorded lyric should not be republished"),
      replier: async () => assert.fail("no reply should be attempted"),
      random: () => 0,
    }),
    /no new coherent snippets/u,
  );
});

test("publishing validates X credentials before preparing a post", async (context) => {
  const config = await fixture(context);
  config.x.accessSecret = "";
  let fetchedLyrics = false;

  await assert.rejects(
    runPost(config, {
      publish: true,
      logger: silentLogger,
      lyricsFetcher: async () => {
        fetchedLyrics = true;
        return lyricsFetcher();
      },
    }),
    /X_ACCESS_TOKEN_SECRET/,
  );

  assert.equal(fetchedLyrics, false);
});
