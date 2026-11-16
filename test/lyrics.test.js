import test from "node:test";
import assert from "node:assert/strict";
import { extractLyrics, fetchGeniusLyrics } from "../src/lyrics.js";

const url = "https://genius.com/Example-artist-small-song-lyrics";
const html = `<div>Advertisement</div><div id="lyrics-root">
  <div data-lyrics-container="true">[Verse]<br>Morning &amp; evening<br><a>Meet at the river.</a><br><br>Another stanza.</div>
  <div data-lyrics-container="true">[Chorus]<br>A final line.</div>
</div><div>Recommended songs</div>`;
const lyrics = "[Verse]\nMorning & evening\nMeet at the river.\n\nAnother stanza.\n[Chorus]\nA final line.";

test("lyrics extraction preserves section and stanza boundaries and decodes entities", () => {
  assert.equal(extractLyrics(html), lyrics);
});

test("normal lyric pages do not invoke the browser fallback", async () => {
  assert.equal(await fetchGeniusLyrics(url, {
    fetchImpl: async () => new Response(html),
    browserFetch: () => assert.fail("fallback should not run"),
  }), lyrics);
});

test("a Cloudflare 403 falls back once and extracts only lyric containers", async () => {
  let calls = 0;
  const result = await fetchGeniusLyrics(url, {
    fetchImpl: async () => new Response("Challenge", { status: 403, headers: { "cf-mitigated": "challenge" } }),
    browserFetch: async (requestedUrl) => {
      calls += 1;
      assert.equal(requestedUrl, url);
      return html;
    },
  });
  assert.equal(result, lyrics);
  assert.equal(calls, 1);
});

test("HTTP 429 and 404 do not trigger another request", async () => {
  for (const status of [429, 404]) {
    await assert.rejects(fetchGeniusLyrics(url, {
      fetchImpl: async () => new Response("Unavailable", { status }),
      browserFetch: () => assert.fail("fallback should not run"),
    }), new RegExp(`HTTP ${status}`));
  }
});

test("a second challenge is rejected instead of becoming a lyric", async () => {
  await assert.rejects(fetchGeniusLyrics(url, {
    fetchImpl: async () => new Response("Challenge", { status: 403 }),
    browserFetch: async () => "<html><h1>Verify you are human</h1></html>",
  }), /did not contain lyrics/);
});

test("failed fallback and request timeouts propagate to the posting run", async () => {
  await assert.rejects(fetchGeniusLyrics(url, {
    fetchImpl: async () => new Response("Challenge", { status: 403 }),
    browserFetch: async () => { throw new Error("fallback timed out"); },
  }), /fallback timed out/);
  await assert.rejects(fetchGeniusLyrics(url, {
    fetchImpl: async () => { throw new Error("request timed out"); },
    browserFetch: () => assert.fail("fallback should not run"),
  }), /request timed out/);
});

test("non-Genius URLs are rejected before any network request", async () => {
  for (const value of ["http://genius.com/song", "https://example.com/song", "https://genius.com@localhost/song"]) {
    await assert.rejects(fetchGeniusLyrics(value, {
      fetchImpl: () => assert.fail("network request should not run"),
    }), /HTTPS Genius page/);
  }
});
