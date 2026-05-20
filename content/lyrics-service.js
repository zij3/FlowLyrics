(() => {
  "use strict";

  const { sendRuntimeMessage } = globalThis.YTML.utils;

  async function loadSyncedLines(track, force) {
    if (!track.title || !track.artist) {
      return [];
    }

    const response = await sendRuntimeMessage({
      type: "ytml.fetchLyrics",
      track: {
        title: track.title,
        artist: track.artist,
        album: track.album,
        duration: track.duration
      },
      force: Boolean(force)
    });

    if (!response || !response.ok || !response.lyrics) {
      return [];
    }

    return buildLines(response.lyrics, track.duration);
  }

  function buildLines(lyrics, duration) {
    if (!lyrics.syncedLyrics) {
      return [];
    }

    return parseLrc(lyrics.syncedLyrics, duration || lyrics.duration || 0);
  }

  function parseLrc(lrc, duration) {
    const timestampPattern = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?]/g;
    const parsed = [];

    for (const rawLine of String(lrc).split(/\r?\n/)) {
      const timestamps = [...rawLine.matchAll(timestampPattern)];
      const lineText = rawLine.replace(timestampPattern, "").trim();
      if (!timestamps.length || !lineText) {
        continue;
      }

      for (const match of timestamps) {
        const minutes = Number(match[1]);
        const seconds = Number(match[2]);
        const fraction = match[3] ? Number(`0.${match[3].padEnd(3, "0").slice(0, 3)}`) : 0;
        parsed.push({
          time: minutes * 60 + seconds + fraction,
          text: lineText,
          estimated: false
        });
      }
    }

    parsed.sort((a, b) => a.time - b.time);
    for (let index = 0; index < parsed.length; index += 1) {
      const next = parsed[index + 1];
      parsed[index].end = next
        ? Math.max(next.time, parsed[index].time + 1.5)
        : Math.max(duration || 0, parsed[index].time + 4);
    }

    return parsed;
  }

  globalThis.YTML.lyricsService = {
    buildLines,
    loadSyncedLines,
    parseLrc
  };
})();
