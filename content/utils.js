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
    return document.querySelector("video");
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
    normalizeComparable,
    parseClock,
    sendRuntimeMessage,
    textFrom
  };
})();
