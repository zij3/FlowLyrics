(() => {
  const SCAN_INTERVAL_MS = 1300;

  const state = {
    visible: false,
    trackKey: "",
    track: null,
    lines: [],
    activeIndex: -1,
    hasSyncedLyrics: false,
    loading: false,
    lastPlacement: "",
    scanQueued: false,
    rafId: 0
  };

  const elements = {};

  init();

  function init() {
    createInterface();
    observePage();
    scanTrack(true);
    setInterval(() => scanTrack(false), SCAN_INTERVAL_MS);
    state.rafId = requestAnimationFrame(syncLoop);
  }

  function createInterface() {
    const root = document.createElement("div");
    root.id = "ytml-root";
    root.innerHTML = `
      <section class="ytml-panel" aria-live="polite">
        <main class="ytml-body">
          <div class="ytml-lines" role="list"></div>
        </main>
      </section>
    `;

    (document.body || document.documentElement).appendChild(root);

    elements.root = root;
    elements.panel = root.querySelector(".ytml-panel");
    elements.lines = root.querySelector(".ytml-lines");
  }

  function setPanelVisible(visible) {
    const wasVisible = state.visible;
    state.visible = Boolean(visible);
    elements.root.classList.toggle("ytml-visible", state.visible);
    document.documentElement.classList.toggle("ytml-replacing-lyrics", state.visible);

    if (state.visible && !wasVisible) {
      syncToCurrentLyric(true);
    }
  }

  function observePage() {
    document.addEventListener("visibilitychange", () => scheduleScan(), true);
    document.addEventListener("click", () => scheduleScan(), true);
    window.addEventListener("resize", () => scheduleScan(), true);
  }

  function scheduleScan() {
    if (state.scanQueued) {
      return;
    }

    state.scanQueued = true;
    requestAnimationFrame(() => {
      state.scanQueued = false;
      scanTrack(false);
      updatePlacement();
    });
  }

  function scanTrack(force) {
    const track = readTrack();
    updatePlacement();

    if (!track.title || !track.artist) {
      state.hasSyncedLyrics = false;
      state.lines = [];
      elements.lines.textContent = "";
      updatePlacement();
      return;
    }

    const nextKey = buildTrackKey(track);

    if (force || nextKey !== state.trackKey) {
      state.trackKey = nextKey;
      state.track = track;
      state.activeIndex = -1;
      state.hasSyncedLyrics = false;
      state.lines = [];
      elements.lines.textContent = "";
      updatePlacement();
      loadLyrics(track, false);
    }
  }

  function readTrack() {
    const media = readMediaSession();
    const bar = document.querySelector("ytmusic-player-bar");
    const video = getVideo();

    const domTitle = textFrom(bar?.querySelector(".title.ytmusic-player-bar"))
      || textFrom(bar?.querySelector("yt-formatted-string.title"));
    const byline = textFrom(bar?.querySelector(".byline.ytmusic-player-bar"))
      || textFrom(bar?.querySelector(".subtitle.ytmusic-player-bar"));
    const bylineParts = byline.split("•").map((part) => part.trim()).filter(Boolean);
    const linkedArtists = [...(bar?.querySelectorAll(".byline.ytmusic-player-bar a") || [])]
      .map(textFrom)
      .filter(Boolean);

    const title = cleanText(domTitle || media.title || "");
    const artist = cleanText(media.artist || bylineParts[0] || linkedArtists.join(", "));
    const album = cleanText(media.album || bylineParts[1] || "");
    const duration = getDuration(video, bar);

    return {
      title,
      artist,
      album,
      duration
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

  async function loadLyrics(track, force) {
    if (!track.title || !track.artist) {
      return;
    }

    const requestKey = buildTrackKey(track);
    state.loading = true;
    state.lines = [];
    state.activeIndex = -1;
    state.hasSyncedLyrics = false;
    elements.lines.textContent = "";
    updatePlacement();

    try {
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

      if (requestKey !== state.trackKey) {
        state.loading = false;
        updatePlacement();
        return;
      }

      if (!response || !response.ok || !response.lyrics) {
        state.loading = false;
        updatePlacement();
        return;
      }

      const lines = buildLines(response.lyrics, track.duration);
      if (!lines.length) {
        state.loading = false;
        updatePlacement();
        return;
      }

      state.lines = lines;
      state.hasSyncedLyrics = true;
      renderLines(lines);
      state.loading = false;
      updatePlacement();
    } catch (error) {
      state.hasSyncedLyrics = false;
      state.loading = false;
      updatePlacement();
    }
  }

  function buildLines(lyrics, duration) {
    if (lyrics.syncedLyrics) {
      const parsed = parseLrc(lyrics.syncedLyrics, duration || lyrics.duration || 0);
      if (parsed.length) {
        return parsed;
      }
    }

    return [];
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
      parsed[index].end = next ? Math.max(next.time, parsed[index].time + 1.5) : Math.max(duration || 0, parsed[index].time + 4);
    }
    return parsed;
  }

  function renderLines(lines) {
    elements.lines.textContent = "";

    const fragment = document.createDocumentFragment();
    for (const [index, line] of lines.entries()) {
      const row = document.createElement("div");
      row.className = "ytml-line";
      row.dataset.index = String(index);
      row.setAttribute("role", "listitem");

      const span = document.createElement("span");
      span.textContent = line.text || "...";
      row.appendChild(span);
      fragment.appendChild(row);
    }

    elements.lines.appendChild(fragment);
  }

  function syncLoop() {
    syncToCurrentLyric(false);

    state.rafId = requestAnimationFrame(syncLoop);
  }

  function syncToCurrentLyric(forceScroll) {
    const video = getVideo();
    if (!video || !state.lines.length) {
      return;
    }

    const nextIndex = findActiveIndex(video.currentTime || 0, state.lines);
    if (forceScroll || nextIndex !== state.activeIndex) {
      state.activeIndex = nextIndex;
      updateActiveLine(nextIndex, forceScroll);
    }
  }

  function findActiveIndex(time, lines) {
    let low = 0;
    let high = lines.length - 1;
    let answer = 0;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (lines[mid].time <= time) {
        answer = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    return answer;
  }

  function updateActiveLine(activeIndex, forceScroll) {
    for (const lineElement of elements.lines.querySelectorAll(".ytml-line")) {
      const index = Number(lineElement.dataset.index);
      lineElement.classList.toggle("is-active", index === activeIndex);
      lineElement.classList.toggle("is-past", index < activeIndex);
      lineElement.classList.toggle("is-future", index > activeIndex);
    }

    const activeElement = elements.lines.querySelector(`.ytml-line[data-index="${activeIndex}"]`);
    if (activeElement) {
      scrollLyricListTo(activeElement, forceScroll);
    }
  }

  function scrollLyricListTo(activeElement, instant) {
    const targetTop = activeElement.offsetTop
      - (elements.lines.clientHeight / 2)
      + (activeElement.offsetHeight / 2);

    elements.lines.scrollTo({
      top: Math.max(0, targetTop),
      behavior: instant ? "auto" : "smooth"
    });
  }

  function updatePlacement() {
    const playerPage = document.querySelector("ytmusic-player-page");
    const playerRect = playerPage?.getBoundingClientRect();
    const playerOpen = playerPage
      && getComputedStyle(playerPage).visibility !== "hidden"
      && playerRect
      && playerRect.top < window.innerHeight - 120
      && playerRect.bottom > 120;

    const lyricsSelected = isLyricsTabSelected();
    const hostRect = getLyricsHostRect(playerPage);
    const visible = Boolean(playerOpen && lyricsSelected && hostRect && state.hasSyncedLyrics && state.lines.length);

    if (visible) {
      const placement = [
        Math.round(hostRect.left),
        Math.round(hostRect.top),
        Math.round(hostRect.width),
        Math.round(hostRect.height)
      ].join(":");

      if (placement !== state.lastPlacement) {
        state.lastPlacement = placement;
        elements.root.style.setProperty("--ytml-left", `${hostRect.left}px`);
        elements.root.style.setProperty("--ytml-top", `${hostRect.top}px`);
        elements.root.style.setProperty("--ytml-width", `${hostRect.width}px`);
        elements.root.style.setProperty("--ytml-height", `${hostRect.height}px`);
      }
    } else if (state.lastPlacement) {
      state.lastPlacement = "";
    }

    elements.root.classList.toggle("ytml-player-open", Boolean(playerOpen));
    elements.root.classList.toggle("ytml-loading", state.loading);
    setPanelVisible(visible);
  }

  function getLyricsHostRect(playerPage) {
    const host = playerPage?.querySelector("ytmusic-tab-renderer");
    const rect = host?.getBoundingClientRect();
    if (rect && rect.width > 220 && rect.height > 220) {
      return rect;
    }

    const tabs = [...document.querySelectorAll("tp-yt-paper-tab")];
    const lyricsTab = tabs.find((tab) => /lyrics/i.test(textFrom(tab)));
    const tabRect = lyricsTab?.getBoundingClientRect();
    if (!playerPage || !playerPage.getBoundingClientRect || !tabRect) {
      return null;
    }

    const pageRect = playerPage.getBoundingClientRect();
    const left = Math.max(pageRect.left, tabRect.left - tabRect.width);
    const top = Math.min(pageRect.bottom - 240, tabRect.bottom + 8);
    const right = Math.min(pageRect.right, tabRect.right + tabRect.width);
    const bottom = Math.min(pageRect.bottom, window.innerHeight - 84);

    return {
      left,
      top,
      width: Math.max(280, right - left),
      height: Math.max(260, bottom - top)
    };
  }

  function isLyricsTabSelected() {
    return [...document.querySelectorAll("tp-yt-paper-tab")]
      .some((tab) => tab.getAttribute("aria-selected") === "true" && /lyrics/i.test(textFrom(tab)));
  }

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

})();
