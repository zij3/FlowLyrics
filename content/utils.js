(() => {
  "use strict";

  const YTML = globalThis.YTML;

  function sendRuntimeMessage(message) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          const error = chrome.runtime.lastError;
          if (error) {
            reject(new Error(error.message));
            return;
          }
          resolve(response);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function getVideo() {
    return getVideos()
      .map((video) => ({
        video,
        score: scoreVideo(video)
      }))
      .sort((a, b) => b.score - a.score)[0]?.video || null;
  }

  function getVideos() {
    return [...document.querySelectorAll("video")];
  }

  function scoreVideo(video) {
    if (!video || !video.isConnected) {
      return -1;
    }

    const rect = video.getBoundingClientRect();
    const style = getComputedStyle(video);
    const visible = style.display !== "none"
      && style.visibility !== "hidden"
      && rect.width > 0
      && rect.height > 0;

    let score = 0;
    if (video.readyState > 0) score += 20;
    if (Number.isFinite(video.duration) && video.duration > 0) score += 20;
    if (video.currentSrc || video.src) score += 15;
    if (!video.paused) score += 35;
    if (!video.ended) score += 45;
    if (visible) score += 10;

    return score;
  }

  function buildTrackKey(track) {
    return [
      normalizeComparable(track.title),
      normalizeComparable(track.artist),
      Math.round(track.duration || 0)
    ].join("|");
  }

  function textFrom(node) {
    return cleanText(node?.innerText || node?.textContent || "");
  }

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalizeComparable(value) {
    return cleanText(value)
      .toLowerCase()
      .replace(/['"`]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function parseClock(value) {
    const parts = String(value || "")
      .split(":")
      .map((part) => Number(part));

    if (parts.some((part) => !Number.isFinite(part))) {
      return 0;
    }

    return parts.reduce((total, part) => total * 60 + part, 0);
  }

  YTML.utils = {
    buildTrackKey,
    cleanText,
    getVideo,
    getVideos,
    normalizeComparable,
    parseClock,
    sendRuntimeMessage,
    textFrom
  };
})();
