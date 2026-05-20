const LRCLIB_API = "https://lrclib.net/api";
const CACHE_LIMIT = 80;
const lyricsCache = new Map();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "ytml.fetchLyrics") {
    return undefined;
  }

  fetchLyrics(message.track, Boolean(message.force))
    .then((response) => sendResponse(response))
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error && error.message ? error.message : "Lyrics request failed"
      });
    });

  return true;
});

async function fetchLyrics(track, force) {
  const normalizedTrack = normalizeTrack(track);
  if (!normalizedTrack.title || !normalizedTrack.artist) {
    return { ok: false, error: "Missing track title or artist" };
  }

  const cacheKey = [
    normalizedTrack.title,
    normalizedTrack.artist,
    normalizedTrack.album,
    Math.round(normalizedTrack.duration || 0)
  ].join("\n");

  if (!force && lyricsCache.has(cacheKey)) {
    return lyricsCache.get(cacheKey);
  }

  const directQueries = buildDirectQueries(normalizedTrack);
  for (const query of directQueries) {
    const result = await requestGet(query);
    if (result && (result.syncedLyrics || result.plainLyrics)) {
      return cacheResponse(cacheKey, {
        ok: true,
        lyrics: formatLyrics(result),
        match: "direct"
      });
    }
  }

  const searchResults = await requestSearch(normalizedTrack);
  const best = chooseBestSearchResult(searchResults, normalizedTrack);
  if (best && (best.syncedLyrics || best.plainLyrics)) {
    return cacheResponse(cacheKey, {
      ok: true,
      lyrics: formatLyrics(best),
      match: "search"
    });
  }

  return cacheResponse(cacheKey, {
    ok: false,
    error: "No synced lyrics found for this track"
  });
}

function normalizeTrack(track = {}) {
  return {
    title: normalizeSpaces(track.title || ""),
    artist: normalizeSpaces(track.artist || ""),
    album: normalizeSpaces(track.album || ""),
    duration: Number.isFinite(Number(track.duration)) ? Number(track.duration) : 0
  };
}

function buildDirectQueries(track) {
  const titleVariants = unique([
    track.title,
    cleanTitle(track.title),
    removeFeaturing(track.title)
  ]).filter(Boolean);

  const artistVariants = unique([
    track.artist,
    cleanArtist(track.artist),
    firstArtist(track.artist)
  ]).filter(Boolean);

  const queries = [];
  for (const title of titleVariants) {
    for (const artist of artistVariants) {
      const base = {
        track_name: title,
        artist_name: artist
      };
      if (track.album) {
        base.album_name = track.album;
      }
      if (track.duration > 0) {
        queries.push({ ...base, duration: Math.round(track.duration) });
      }
      queries.push(base);
    }
  }

  return uniqueObjects(queries).slice(0, 12);
}

async function requestGet(query) {
  const url = new URL(`${LRCLIB_API}/get`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && String(value).trim()) {
      url.searchParams.set(key, String(value).trim());
    }
  }

  const response = await requestJson(url);
  if (!response.ok && response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`LRCLIB returned ${response.status}`);
  }
  return response.data;
}

async function requestSearch(track) {
  const queries = uniqueObjects([
    {
      track_name: cleanTitle(track.title) || track.title,
      artist_name: cleanArtist(track.artist) || track.artist,
      duration: track.duration > 0 ? Math.round(track.duration) : undefined
    },
    {
      track_name: track.title,
      artist_name: firstArtist(track.artist),
      duration: track.duration > 0 ? Math.round(track.duration) : undefined
    },
    {
      query: `${track.title} ${firstArtist(track.artist) || track.artist}`
    }
  ]);

  const combined = [];
  for (const query of queries) {
    const url = new URL(`${LRCLIB_API}/search`);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && String(value).trim()) {
        url.searchParams.set(key, String(value).trim());
      }
    }

    const response = await requestJson(url);
    if (response.ok && Array.isArray(response.data)) {
      combined.push(...response.data);
    }
  }

  return uniqueObjects(combined);
}

async function requestJson(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 9000);

  try {
    const response = await fetch(url.toString(), {
      headers: {
        "Accept": "application/json"
      },
      signal: controller.signal
    });

    let data = null;
    try {
      data = await response.json();
    } catch (_error) {
      data = null;
    }

    return {
      ok: response.ok,
      status: response.status,
      data
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function chooseBestSearchResult(results, track) {
  if (!Array.isArray(results) || results.length === 0) {
    return null;
  }

  return results
    .map((result) => ({
      result,
      score: scoreResult(result, track)
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.result || null;
}

function scoreResult(result, track) {
  const resultTitle = normalizeComparable(result.trackName || result.track_name || result.name || "");
  const resultArtist = normalizeComparable(result.artistName || result.artist_name || "");
  const wantedTitle = normalizeComparable(cleanTitle(track.title) || track.title);
  const wantedArtist = normalizeComparable(cleanArtist(track.artist) || track.artist);
  const wantedFirstArtist = normalizeComparable(firstArtist(track.artist));

  let score = 0;
  if (result.syncedLyrics) score += 100;
  if (result.plainLyrics) score += 15;

  if (resultTitle === wantedTitle) score += 45;
  else if (resultTitle.includes(wantedTitle) || wantedTitle.includes(resultTitle)) score += 22;

  if (resultArtist === wantedArtist) score += 32;
  else if (wantedFirstArtist && resultArtist.includes(wantedFirstArtist)) score += 20;

  if (track.duration > 0 && Number.isFinite(Number(result.duration))) {
    const distance = Math.abs(Number(result.duration) - track.duration);
    score += Math.max(0, 24 - distance * 3);
  }

  return score;
}

function formatLyrics(result) {
  return {
    id: result.id,
    trackName: result.trackName || result.track_name || "",
    artistName: result.artistName || result.artist_name || "",
    albumName: result.albumName || result.album_name || "",
    duration: result.duration || 0,
    syncedLyrics: result.syncedLyrics || result.synced_lyrics || "",
    plainLyrics: result.plainLyrics || result.plain_lyrics || "",
    source: "LRCLIB"
  };
}

function cacheResponse(key, response) {
  lyricsCache.set(key, response);
  if (lyricsCache.size > CACHE_LIMIT) {
    lyricsCache.delete(lyricsCache.keys().next().value);
  }
  return response;
}

function cleanTitle(value) {
  return normalizeSpaces(value)
    .replace(/\s*[\[(](?:official\s*)?(?:music\s*)?(?:video|audio|lyrics?|lyric\s*video|visualizer|remaster(?:ed)?|hd|4k|explicit).*?[\])]/gi, "")
    .replace(/\s*-\s*(?:official\s*)?(?:music\s*)?(?:video|audio|lyrics?|visualizer).*$/i, "")
    .trim();
}

function removeFeaturing(value) {
  return cleanTitle(value)
    .replace(/\s*[\[(](?:feat\.?|ft\.?|featuring)\s+.*?[\])]/gi, "")
    .replace(/\s+(?:feat\.?|ft\.?|featuring)\s+.*$/i, "")
    .trim();
}

function cleanArtist(value) {
  return normalizeSpaces(value)
    .replace(/\s+VEVO$/i, "")
    .replace(/\s+-\s+Topic$/i, "")
    .trim();
}

function firstArtist(value) {
  return cleanArtist(value)
    .split(/\s*(?:,|&|\bfeat\.?\b|\bft\.?\b|\bfeaturing\b)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean)[0] || "";
}

function normalizeSpaces(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeComparable(value) {
  return normalizeSpaces(value)
    .toLowerCase()
    .replace(/['"`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function unique(values) {
  return [...new Set(values.map((value) => normalizeSpaces(value)).filter(Boolean))];
}

function uniqueObjects(values) {
  const seen = new Set();
  const uniqueValues = [];
  for (const value of values) {
    const compact = Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined && entryValue !== null && String(entryValue).trim())
        .map(([key, entryValue]) => [key, String(entryValue).trim()])
    );
    const key = JSON.stringify(compact);
    if (!seen.has(key)) {
      seen.add(key);
      uniqueValues.push(compact);
    }
  }
  return uniqueValues;
}
