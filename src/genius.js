import Genius from "genius-lyrics";

function createClient(accessToken) {
  return new Genius.Client(accessToken);
}

function serializeSong(song) {
  const featuredArtists = song._raw?.featured_artists ?? [];
  return {
    id: song.id,
    title: song.title,
    fullTitle: song.fullTitle,
    url: song.url,
    artist: {
      id: song.artist.id,
      name: song.artist.name,
    },
    featuredArtists: featuredArtists.map((artist) => ({
      id: artist.id,
      name: artist.name,
    })),
  };
}

export async function fetchArtistCatalog(accessToken, artistIds, logger = console) {
  const client = createClient(accessToken);
  const songsById = new Map();
  const artists = [];

  for (const artistId of artistIds) {
    const artist = await client.artists.get(artistId);
    artists.push({ id: artist.id, name: artist.name });
    logger.info(`Syncing Genius catalog for ${artist.name} (${artist.id})`);

    for (let page = 1; page <= 100; page += 1) {
      const songs = await artist.songs({ page, perPage: 50, sort: "popularity" });
      if (songs.length === 0) break;

      for (const song of songs) {
        if (song.artist.id === artist.id) songsById.set(song.id, serializeSong(song));
      }
      if (songs.length < 50) break;
    }
  }

  return {
    version: 1,
    syncedAt: new Date().toISOString(),
    artists,
    songs: [...songsById.values()],
  };
}

export async function fetchLyrics(accessToken, songId) {
  const client = createClient(accessToken);
  const song = await client.songs.get(songId);
  return {
    song: serializeSong(song),
    lyrics: await song.lyrics(),
  };
}
