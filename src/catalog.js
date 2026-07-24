import { fetchArtistCatalog } from "./genius.js";
import { readJson, writeJsonAtomic } from "./storage.js";

export async function loadCatalog(file) {
  const catalog = await readJson(file);
  if (catalog === null) return null;
  if (catalog.version !== 1 || !Array.isArray(catalog.songs) || !catalog.syncedAt) {
    throw new Error(`Unsupported catalog format in ${file}`);
  }
  return catalog;
}

export function isCatalogFresh(catalog, maxAgeHours, now = Date.now()) {
  if (!catalog) return false;
  const age = now - Date.parse(catalog.syncedAt);
  return Number.isFinite(age) && age >= 0 && age < maxAgeHours * 60 * 60 * 1000;
}

function catalogMatchesArtists(catalog, artistIds) {
  if (!catalog || !Array.isArray(catalog.artists)) return false;
  const cached = catalog.artists.map((artist) => artist.id).sort((a, b) => a - b);
  const configured = [...artistIds].sort((a, b) => a - b);
  return cached.length === configured.length && cached.every((id, index) => id === configured[index]);
}

export async function syncCatalog(config, logger = console) {
  const catalog = await fetchArtistCatalog(
    config.geniusAccessToken,
    config.artistIds,
    logger,
  );
  if (catalog.songs.length === 0) {
    throw new Error("Genius returned no songs for the configured artists");
  }
  await writeJsonAtomic(config.catalogFile, catalog);
  logger.info(`Saved ${catalog.songs.length} songs to ${config.catalogFile}`);
  return catalog;
}

export async function getCatalog(config, { force = false, logger = console } = {}) {
  const existing = await loadCatalog(config.catalogFile);
  if (
    !force &&
    isCatalogFresh(existing, config.catalogMaxAgeHours) &&
    catalogMatchesArtists(existing, config.artistIds)
  ) {
    return existing;
  }
  return syncCatalog(config, logger);
}
