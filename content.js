(() => {
  const SCAN_INTERVAL_MS = 1300;

  function textFrom(node) {
    return String(node?.innerText || node?.textContent || "").replace(/s+/g, " ").trim();
  }

  function readTrack() {
    const bar = document.querySelector("ytmusic-player-bar");
    const title = textFrom(bar?.querySelector(".title.ytmusic-player-bar"));
    const byline = textFrom(bar?.querySelector(".byline.ytmusic-player-bar"));
    const [artist = "", album = ""] = byline.split("?").map((part) => part.trim());
    const video = document.querySelector("video");

    return {
      title,
      artist,
      album,
      duration: video && Number.isFinite(video.duration) ? video.duration : 0
    };
  }

  function scanTrack() {
    document.documentElement.dataset.ytmlTrack = JSON.stringify(readTrack());
  }

  scanTrack();
  setInterval(scanTrack, SCAN_INTERVAL_MS);
})();
