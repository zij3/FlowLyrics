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
      title: cleanText(media.title || domTitle || ""),
      artist: cleanText(media.artist || bylineParts[0] || linkedArtists.join(", ")),
      album: cleanText(media.album || bylineParts[1] || ""),
      duration: getDuration(video, bar)
    };
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
    readPlaybackTime,
    readTrack
  };
})();
