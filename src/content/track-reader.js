(() => {
  "use strict";

  const { cleanText, getVideo, parseClock, textFrom } = globalThis.YTML.utils;

  function readTrack() {
    const media = readMediaSession();
    const bar = document.querySelector("ytmusic-player-bar");
    const video = getVideo();

    const domTitle = textFrom(bar?.querySelector(".title.ytmusic-player-bar"))
      || textFrom(bar?.querySelector("yt-formatted-string.title"));
    const byline = textFrom(bar?.querySelector(".byline.ytmusic-player-bar"))
      || textFrom(bar?.querySelector(".subtitle.ytmusic-player-bar"));
    const bylineParts = byline.split(/\s*(?:\u2022|\u00b7)\s*/).map((part) => part.trim()).filter(Boolean);
    const linkedArtists = [...(bar?.querySelectorAll(".byline.ytmusic-player-bar a") || [])]
      .map(textFrom)
      .filter(Boolean);

    return {
      artworkUrl: readArtworkUrl(bar),
      title: cleanText(media.title || domTitle || ""),
      artist: cleanText(media.artist || bylineParts[0] || linkedArtists.join(", ")),
      album: cleanText(media.album || bylineParts[1] || ""),
      duration: getDuration(video, bar)
    };
  }

  function readArtworkUrl(bar = document.querySelector("ytmusic-player-bar")) {
    const imageCandidates = [
      ...document.querySelectorAll("ytmusic-player-page img[src]"),
      ...(bar?.querySelectorAll("img[src]") || [])
    ];
    const bestCandidate = imageCandidates
      .map((image) => ({
        image,
        score: scoreArtworkImage(image)
      }))
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score)[0];

    return bestCandidate
      ? normalizeArtworkUrl(bestCandidate.image.currentSrc || bestCandidate.image.src)
      : "";
  }

  function scoreArtworkImage(image) {
    const url = image.currentSrc || image.src || "";
    if (!url || !/ytimg\.com|googleusercontent\.com/i.test(url)) {
      return 0;
    }

    const rect = image.getBoundingClientRect();
    if (!rect || rect.width < 32 || rect.height < 32) {
      return 0;
    }

    let score = rect.width + rect.height;
    if (Math.abs(rect.width - rect.height) < Math.max(rect.width, rect.height) * 0.18) {
      score += 120;
    }
    if (image.closest("ytmusic-player-page")) {
      score += 80;
    }
    if (image.closest("ytmusic-player-bar")) {
      score += 30;
    }

    return score;
  }

  function normalizeArtworkUrl(url) {
    return String(url || "")
      .replace(/=w\d+-h\d+(?:-[^/?#]+)?/i, "=w1200-h1200-l90-rj")
      .replace(/=s\d+(?:-[^/?#]+)?/i, "=s1200");
  }

  function readMediaSession() {
    const metadata = navigator.mediaSession && navigator.mediaSession.metadata;

    return {
      title: metadata?.title || "",
      artist: metadata?.artist || "",
      album: metadata?.album || ""
    };
  }

  function getDuration(video, bar) {
    if (video && Number.isFinite(video.duration) && video.duration > 0) {
      return video.duration;
    }

    const timeText = textFrom(bar?.querySelector(".time-info"));
    const match = timeText.match(/\/\s*([0-9:]+)/);
    return match ? parseClock(match[1]) : 0;
  }

  function readPlaybackTime() {
    const bar = document.querySelector("ytmusic-player-bar");
    const timeText = textFrom(bar?.querySelector(".time-info"));
    const match = timeText.match(/^\s*([0-9:]+)\s*(?:\/|$)/);
    return match ? parseClock(match[1]) : null;
  }

  globalThis.YTML.trackReader = {
    readArtworkUrl,
    readPlaybackTime,
    readTrack
  };
})();
