(() => {
  const SCAN_INTERVAL_MS = 1300;
  const state = { trackKey: "", lines: [], activeIndex: -1, loading: false };
  const elements = {};

  init();

  function init() {
    const root = document.createElement("div");
    root.id = "ytml-root";
    root.innerHTML = `
      <button class="ytml-pill" type="button">LRC Lyrics</button>
      <section class="ytml-panel">
        <header class="ytml-header">
          <div class="ytml-kicker">Animated lyrics</div>
          <div class="ytml-title">YouTube Music</div>
        </header>
        <main class="ytml-lines"></main>
        <footer class="ytml-footer">LRCLIB</footer>
      </section>
    `;
    document.body.appendChild(root);
    elements.root = root;
    elements.panel = root.querySelector(".ytml-panel");
    elements.title = root.querySelector(".ytml-title");
    elements.lines = root.querySelector(".ytml-lines");
    root.querySelector(".ytml-pill").addEventListener("click", () => root.classList.toggle("ytml-open"));
    scanTrack(true);
    setInterval(() => scanTrack(false), SCAN_INTERVAL_MS);
    document.addEventListener("visibilitychange", () => scanTrack(false), true);
    requestAnimationFrame(syncLoop);
  }

  function readTrack() {
    const bar = document.querySelector("ytmusic-player-bar");
    const title = textFrom(bar?.querySelector(".title.ytmusic-player-bar"));
    const byline = textFrom(bar?.querySelector(".byline.ytmusic-player-bar"));
    const [artist = "", album = ""] = byline.split("?").map((part) => part.trim());
    const video = document.querySelector("video");
    return { title, artist, album, duration: video?.duration || 0 };
  }

  function scanTrack(force) {
    const track = readTrack();
    if (!track.title || !track.artist) return;
    const key = [track.title, track.artist, Math.round(track.duration || 0)].join("|");
    elements.title.textContent = track.title;
    if (force || key !== state.trackKey) {
      state.trackKey = key;
      loadLyrics(track);
    }
  }

  async function loadLyrics(track) {
    state.loading = true;
    const response = await chrome.runtime.sendMessage({ type: "ytml.fetchLyrics", track });
    state.lines = buildLines(response?.lyrics, track.duration);
    renderLines(state.lines);
    state.loading = false;
  }

  function buildLines(lyrics, duration) {
    if (!lyrics?.syncedLyrics) return [];
    const lines = [];
    for (const row of lyrics.syncedLyrics.split(/?
/)) {
      const match = row.match(/^[(d+):(d+)(?:[.:](d+))?](.*)$/);
      if (!match || !match[4].trim()) continue;
      lines.push({ time: Number(match[1]) * 60 + Number(match[2]), text: match[4].trim() });
    }
    return lines.map((line, index) => ({ ...line, end: lines[index + 1]?.time || duration || line.time + 4 }));
  }

  function renderLines(lines) {
    elements.lines.textContent = "";
    for (const [index, line] of lines.entries()) {
      const row = document.createElement("div");
      row.className = "ytml-line";
      row.dataset.index = String(index);
      row.textContent = line.text;
      elements.lines.appendChild(row);
    }
  }

  function syncLoop() {
    const video = document.querySelector("video");
    if (video && state.lines.length) {
      const next = state.lines.findLastIndex((line) => line.time <= video.currentTime);
      if (next !== state.activeIndex) updateActiveLine(Math.max(0, next));
    }
    requestAnimationFrame(syncLoop);
  }

  function updateActiveLine(activeIndex) {
    state.activeIndex = activeIndex;
    for (const line of elements.lines.querySelectorAll(".ytml-line")) {
      const index = Number(line.dataset.index);
      line.classList.toggle("is-active", index === activeIndex);
    }
    elements.lines.querySelector(".is-active")?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function textFrom(node) {
    return String(node?.innerText || node?.textContent || "").replace(/s+/g, " ").trim();
  }
})();
