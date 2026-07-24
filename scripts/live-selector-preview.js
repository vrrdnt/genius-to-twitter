#!/usr/bin/env node
// Live network diagnostic; intentionally separate from the offline test suite.
import "dotenv/config";
import Genius from "genius-lyrics";
import { request } from "undici";
import { buildCandidates, chooseCandidate } from "../src/snippets.js";

const artistIds = (process.env.ARTIST_IDS ?? "")
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isSafeInteger(value) && value > 0);
const configuredAliases = (process.env.ARTIST_ALIASES ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const songsPerArtist = Number(process.env.LIVE_TEST_SONGS || 3);
const redact = process.argv.includes("--redact");

if (artistIds.length === 0) {
  throw new Error("Set ARTIST_IDS before running the live selector test");
}
if (!Number.isInteger(songsPerArtist) || songsPerArtist < 1 || songsPerArtist > 20) {
  throw new Error("LIVE_TEST_SONGS must be an integer from 1 through 20");
}

async function getJson(url) {
  // Keep Genius API and page requests on the same Undici dispatcher.
  const response = await request(url, {
    headers: { "User-Agent": "genius-to-twitter live selector test" },
  });
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`${response.statusCode} from ${url}`);
  }
  return response.body.json();
}

function shortExcerpt(candidate) {
  const words = candidate.lines.join(" ").split(/\s+/u).filter(Boolean);
  return `${words.slice(0, 10).join(" ")}${words.length > 10 ? " …" : ""}`;
}

const client = new Genius.Client();
const results = [];
const artists = [];

for (const artistId of artistIds) {
  const artistPayload = await getJson(`https://genius.com/api/artists/${artistId}`);
  artists.push({ artistId, artist: artistPayload.response.artist });
}

const artistNames = [
  ...artists.map(({ artist }) => artist.name),
  ...configuredAliases,
];

for (const { artistId, artist } of artists) {
  const catalogPayload = await getJson(
    `https://genius.com/api/artists/${artistId}/songs?per_page=20&page=1&sort=popularity`,
  );
  const songs = catalogPayload.response.songs
    .filter((song) => Number(song.primary_artist.id) === artistId)
    .slice(0, songsPerArtist);
  const tested = [];

  for (const rawSong of songs) {
    try {
      const scraped = await client.songs.scrape(rawSong.url);
      const lyrics = scraped.lyrics();
      const song = {
        id: rawSong.id,
        title: rawSong.title,
        fullTitle: rawSong.full_title,
        url: rawSong.url,
        artist: { id: artistId, name: artist.name },
        featuredArtists: (rawSong.featured_artists ?? []).map((featuredArtist) => ({
          id: featuredArtist.id,
          name: featuredArtist.name,
        })),
      };
      const candidates = buildCandidates({
        lyrics,
        song,
        artistNames,
        minLines: 2,
        maxLines: 4,
        minCharacters: 35,
        maxPostLength: 280,
        attributionMode: "reply",
      });
      const selected = chooseCandidate(candidates, new Set(), () => 0);

      tested.push({
        songId: rawSong.id,
        song: rawSong.title,
        url: rawSong.url,
        featuredArtists: song.featuredArtists.map((featuredArtist) => featuredArtist.name),
        candidates: candidates.length,
        selected: selected
          ? {
              section: selected.section,
              score: selected.score,
              repetitionPenalty: selected.repetitionPenalty,
              lines: selected.lines.length,
              characters: selected.text.length,
              lyricWords: selected.lines.join(" ").split(/\s+/u).filter(Boolean).length,
              output: redact ? shortExcerpt(selected) : selected.text,
              attributionReply: redact ? undefined : selected.attributionText,
            }
          : null,
      });
    } catch (error) {
      tested.push({
        songId: rawSong.id,
        song: rawSong.title,
        url: rawSong.url,
        error: error.message,
      });
    }
  }

  results.push({ artistId, artist: artist.name, tested });
}

console.log(JSON.stringify(results, null, 2));
