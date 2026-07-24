import { getCatalog, syncCatalog } from "./catalog.js";
import { fetchLyrics } from "./genius.js";
import {
  loadHistory,
  recentFingerprints,
  recordPublishedPost,
} from "./history.js";
import { buildCandidates, chooseCandidate } from "./snippets.js";
import { publishToX } from "./x.js";
import { assertGeniusConfig, assertXConfig } from "./config.js";

function shuffled(items, random = Math.random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

export async function runCatalogSync(config, logger = console) {
  assertGeniusConfig(config);
  return syncCatalog(config, logger);
}

export async function preparePost(
  config,
  {
    logger = console,
    random = Math.random,
    lyricsFetcher = fetchLyrics,
  } = {},
) {
  assertGeniusConfig(config);
  const catalog = await getCatalog(config, { logger });
  const history = await loadHistory(config.historyFile);
  const recent = recentFingerprints(history);
  const artistNames = [
    ...catalog.artists.map((artist) => artist.name),
    ...config.snippet.artistAliases,
  ];
  const songs = shuffled(catalog.songs, random).slice(0, config.maxSongAttempts);
  const failures = [];

  for (const catalogSong of songs) {
    try {
      const { song, lyrics } = await lyricsFetcher(
        config.geniusAccessToken,
        catalogSong.id,
      );
      const candidates = buildCandidates({
        lyrics,
        song,
        artistNames,
        ...config.snippet,
      });
      const candidate = chooseCandidate(candidates, recent, random);
      if (candidate) return { candidate, history };
      failures.push(`${catalogSong.title}: no new coherent snippets`);
    } catch (error) {
      failures.push(`${catalogSong.title}: ${error.message}`);
      logger.warn(`Skipping ${catalogSong.title}: ${error.message}`);
    }
  }

  throw new Error(
    `Could not prepare a post after ${songs.length} song attempts. ${failures.join("; ")}`,
  );
}

export async function runPost(
  config,
  {
    publish = false,
    logger = console,
    random = Math.random,
    lyricsFetcher = fetchLyrics,
    publisher = publishToX,
  } = {},
) {
  if (publish) assertXConfig(config);

  const { candidate, history } = await preparePost(config, {
    logger,
    random,
    lyricsFetcher,
  });

  if (!publish) {
    logger.info(`Dry run (${candidate.section}, score ${candidate.score}):\n\n${candidate.text}`);
    return { published: false, ...candidate };
  }

  const xPost = await publisher(config.x, candidate.text);
  await recordPublishedPost(
    config.historyFile,
    history,
    {
      fingerprint: candidate.fingerprint,
      text: candidate.text,
      song: candidate.song,
      xPostId: xPost.id,
    },
    config.historyLimit,
  );
  logger.info(`Published X Post ${xPost.id}: ${candidate.song.fullTitle}`);
  return { published: true, xPostId: xPost.id, ...candidate };
}
