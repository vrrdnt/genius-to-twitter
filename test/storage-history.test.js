import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  fingerprint,
  loadHistory,
  recordPublishedPost,
  recentFingerprints,
} from "../src/history.js";

test("history is written atomically, bounded, and reloadable", async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "lyric-history-"));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, "history.json");
  const empty = await loadHistory(file);
  const song = { id: 1, title: "Title", artist: { name: "Artist" } };

  const first = await recordPublishedPost(
    file,
    empty,
    { text: "These are two lines\nThat make one thought.", song, xPostId: "100" },
    1,
  );
  await recordPublishedPost(
    file,
    first,
    { text: "A newer pair of lines\nThat finishes cleanly.", song, xPostId: "101" },
    1,
  );

  const loaded = await loadHistory(file);
  assert.equal(loaded.posts.length, 1);
  assert.equal(loaded.posts[0].xPostId, "101");
  assert.ok(recentFingerprints(loaded).has(fingerprint(loaded.posts[0].text)));
});

test("fingerprints ignore cosmetic case and punctuation differences", () => {
  assert.equal(fingerprint("Hello, WORLD!"), fingerprint("hello world"));
});

test("history recognizes lyric fingerprints from older inline-attribution entries", () => {
  const text = "These are two lyric lines\nThat make one thought.";
  const history = {
    version: 1,
    posts: [
      {
        fingerprint: fingerprint(`${text}\n\n— Title · Artist`),
        text: `${text}\n\n— Title · Artist`,
        songTitle: "Title",
        artistName: "Artist",
      },
    ],
  };

  assert.ok(recentFingerprints(history).has(fingerprint(text)));
});
