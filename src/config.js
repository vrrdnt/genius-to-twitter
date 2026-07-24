import "dotenv/config";
import path from "node:path";

function parseBoolean(value, fallback) {
  if (value === undefined || value === "") return fallback;
  if (/^(1|true|yes|on)$/i.test(value)) return true;
  if (/^(0|false|no|off)$/i.test(value)) return false;
  throw new Error(`Expected a boolean, received ${JSON.stringify(value)}`);
}

function parseInteger(value, fallback, name, { min = 0, max = Infinity } = {}) {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

function parseList(value) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseArtistIds(value) {
  return parseList(value).map((id) => {
    const parsed = Number(id);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      throw new Error(`ARTIST_IDS contains an invalid Genius artist ID: ${id}`);
    }
    return parsed;
  });
}

export function loadConfig(env = process.env) {
  const dataDir = path.resolve(env.DATA_DIR || "data");
  const minLines = parseInteger(env.MIN_LINES, 2, "MIN_LINES", { min: 1, max: 8 });
  const maxLines = parseInteger(env.MAX_LINES, 4, "MAX_LINES", { min: 1, max: 8 });

  if (minLines > maxLines) {
    throw new Error("MIN_LINES cannot be greater than MAX_LINES");
  }

  return {
    artistIds: parseArtistIds(env.ARTIST_IDS),
    geniusAccessToken: env.GENIUS_ACCESS_TOKEN?.trim() || "",
    x: {
      appKey: env.X_API_KEY?.trim() || env.TWITTER_API_KEY?.trim() || "",
      appSecret:
        env.X_API_KEY_SECRET?.trim() || env.TWITTER_API_KEY_SECRET?.trim() || "",
      accessToken:
        env.X_ACCESS_TOKEN?.trim() || env.TWITTER_ACCESS_TOKEN?.trim() || "",
      accessSecret:
        env.X_ACCESS_TOKEN_SECRET?.trim() ||
        env.TWITTER_ACCESS_TOKEN_SECRET?.trim() ||
        "",
    },
    dataDir,
    catalogFile: path.join(dataDir, "catalog.json"),
    historyFile: path.join(dataDir, "history.json"),
    catalogMaxAgeHours: parseInteger(
      env.CATALOG_MAX_AGE_HOURS,
      24,
      "CATALOG_MAX_AGE_HOURS",
      { min: 1, max: 24 * 30 },
    ),
    maxSongAttempts: parseInteger(env.MAX_SONG_ATTEMPTS, 8, "MAX_SONG_ATTEMPTS", {
      min: 1,
      max: 100,
    }),
    historyLimit: parseInteger(env.HISTORY_LIMIT, 200, "HISTORY_LIMIT", {
      min: 1,
      max: 10_000,
    }),
    snippet: {
      minLines,
      maxLines,
      minCharacters: parseInteger(env.MIN_CHARACTERS, 35, "MIN_CHARACTERS", {
        min: 1,
        max: 280,
      }),
      maxPostLength: parseInteger(env.MAX_POST_LENGTH, 280, "MAX_POST_LENGTH", {
        min: 40,
        max: 280,
      }),
      excludedTerms: parseList(env.EXCLUDED_TERMS).map((term) => term.toLowerCase()),
      artistAliases: parseList(env.ARTIST_ALIASES),
    },
    schedule: env.POST_SCHEDULE?.trim() || "0 10,14,18 * * *",
    timezone: env.TIMEZONE?.trim() || "UTC",
    publishEnabled: parseBoolean(env.PUBLISH_ENABLED, false),
    postOnStart: parseBoolean(env.POST_ON_START, false),
  };
}

export function assertGeniusConfig(config) {
  const missing = [];
  if (!config.geniusAccessToken) missing.push("GENIUS_ACCESS_TOKEN");
  if (config.artistIds.length === 0) missing.push("ARTIST_IDS");
  if (missing.length) {
    throw new Error(`Missing required configuration: ${missing.join(", ")}`);
  }
}

export function assertXConfig(config) {
  const required = {
    X_API_KEY: config.x.appKey,
    X_API_KEY_SECRET: config.x.appSecret,
    X_ACCESS_TOKEN: config.x.accessToken,
    X_ACCESS_TOKEN_SECRET: config.x.accessSecret,
  };
  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length) {
    throw new Error(`Publishing requires: ${missing.join(", ")}`);
  }
}
