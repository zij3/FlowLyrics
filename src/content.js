(() => {
  "use strict";

  const FRESH_TRACK_GUARD_MS = 5000;
  const METADATA_GAP_GRACE_MS = 2500;
  const NATIVE_PANE_HOLD_MS = 5000;
  const PLAYER_TRANSITION_HOLD_MS = 300;
  const STALE_HANDOFF_TIME_SECONDS = 20;
  const SCAN_INTERVAL_MS = 1300;
  const VISUAL_HIGHLIGHT_OFFSET_SECONDS = -1;
  const {
    LyricsOverlay,
    lyricsService,
    offsetController,
    playerPage,
    playbackWatcher,
    trackReader,
    utils
  } = globalThis.YTML;

  const state = {
    activeIndex: -1,
    freshTrackGuardUntil: 0,
    hasSyncedLyrics: false,
    lines: [],
    loading: false,
    lyricsRequestId: 0,
    missingMetadataSince: 0,
    nativePaneHoldUntil: 0,
    offsetSeconds: offsetController.loadOffset(),
    placementQueued: false,
    fullscreenWanted: false,
    playerCloseTimerId: 0,
    playerTransitionHoldUntil: 0,
    playerTransitionTimerId: 0,
    rafId: 0,
    scanQueued: false,
    track: null,
    trackKey: ""
  };

  const overlay = new LyricsOverlay({
    formatOffset: offsetController.formatOffset,
    onFullscreenToggle: handleFullscreenToggle,
    onLineSeek: handleLineSeek,
    onOffsetChange: handleOffsetChange,
    onShown: () => syncToCurrentLyric(true)
  });
  overlay.setOffset(state.offsetSeconds);

  init();

  function init() {
    playerPage.observePlayerPage({
      onCloseRequested: handlePlayerCloseRequested,
      onPlacementRequested: schedulePlacementUpdate,
      onPlayerTransitionRequested: handlePlayerTransition,
      onScanRequested: scheduleScan
    });
    playbackWatcher.observePlayback({
      onPlaybackReady: scheduleScan,
      onTrackBoundary: handleTrackBoundary
    });
    document.addEventListener("fullscreenchange", handleFullscreenChange, true);
    document.addEventListener("fullscreenerror", handleFullscreenError, true);

    scanTrack(true);
    setInterval(() => scanTrack(false), SCAN_INTERVAL_MS);
    state.rafId = requestAnimationFrame(syncLoop);
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

  function schedulePlacementUpdate() {
    if (state.placementQueued) {
      return;
    }

    state.placementQueued = true;
    requestAnimationFrame(() => {
      state.placementQueued = false;
      updatePlacement();
    });
  }

  function scanTrack(force) {
    const video = utils.getVideo();
    const track = trackReader.readTrack();
    overlay.setArtworkUrl(track.artworkUrl);
    updatePlacement();

    if (!force && video?.ended) {
      if (state.trackKey || state.hasSyncedLyrics || state.lines.length) {
        handleTrackBoundary();
      } else if (!isNativePaneHeld()) {
        resetTrack();
      }

      updatePlacement();
      return;
    }

    if (!track.title || !track.artist) {
      if (waitForTransientMetadata()) {
        updatePlacement();
        return;
      }

      resetTrack();
      updatePlacement();
      return;
    }

    state.missingMetadataSince = 0;
    const nextKey = utils.buildTrackKey(track);
    if (!force && nextKey === state.trackKey) {
      return;
    }

    state.track = track;
    state.trackKey = nextKey;
    state.freshTrackGuardUntil = performance.now() + FRESH_TRACK_GUARD_MS;
    state.loading = true;
    holdNativePane();
    clearLyrics();
    updatePlacement();
    loadLyricsForTrack(track, nextKey, ++state.lyricsRequestId);
  }

  async function loadLyricsForTrack(track, requestKey, requestId) {
    let shouldSync = false;
    state.loading = true;
    clearLyrics();
    updatePlacement();

    try {
      const lines = await lyricsService.loadSyncedLines(track, false);
      if (!isCurrentLyricsRequest(requestKey, requestId)) {
        return;
      }

      if (lines.length) {
        state.lines = lines;
        state.hasSyncedLyrics = true;
        state.nativePaneHoldUntil = 0;
        overlay.renderLines(lines);
        shouldSync = true;
      } else {
        state.nativePaneHoldUntil = 0;
      }
    } catch (_error) {
      if (isCurrentLyricsRequest(requestKey, requestId)) {
        state.nativePaneHoldUntil = 0;
        clearLyrics();
      }
    } finally {
      if (isCurrentLyricsRequest(requestKey, requestId)) {
        state.loading = false;
        updatePlacement();
        if (shouldSync) {
          syncToCurrentLyric(true);
        }
      }
    }
  }

  function handleTrackBoundary() {
    state.lyricsRequestId += 1;
    state.freshTrackGuardUntil = performance.now() + FRESH_TRACK_GUARD_MS;
    state.loading = false;
    state.track = null;
    state.trackKey = "";
    holdNativePane();
    clearLyrics();
    updatePlacement();
  }

  function waitForTransientMetadata() {
    const canWait = state.trackKey || state.hasSyncedLyrics || state.loading || isNativePaneHeld();
    if (!canWait) {
      state.missingMetadataSince = 0;
      return false;
    }

    const now = performance.now();
    if (!state.missingMetadataSince) {
      state.missingMetadataSince = now;
    }

    if (now - state.missingMetadataSince > METADATA_GAP_GRACE_MS) {
      state.missingMetadataSince = 0;
      return false;
    }

    holdNativePane(METADATA_GAP_GRACE_MS);
    return true;
  }

  function holdNativePane(duration = NATIVE_PANE_HOLD_MS) {
    state.nativePaneHoldUntil = Math.max(state.nativePaneHoldUntil, performance.now() + duration);
  }

  function isNativePaneHeld() {
    return performance.now() < state.nativePaneHoldUntil;
  }

  function holdPlayerTransition(duration = PLAYER_TRANSITION_HOLD_MS) {
    state.playerTransitionHoldUntil = Math.max(
      state.playerTransitionHoldUntil,
      performance.now() + duration
    );
  }

  function isPlayerTransitionHeld() {
    return performance.now() < state.playerTransitionHoldUntil;
  }

  function handlePlayerTransition() {
    holdPlayerTransition();
    updateNativePaneVisibility(true);
    overlay.hideImmediately();

    if (state.playerTransitionTimerId) {
      clearTimeout(state.playerTransitionTimerId);
    }

    state.playerTransitionTimerId = setTimeout(() => {
      state.playerTransitionTimerId = 0;
      scheduleScan();
      schedulePlacementUpdate();
    }, PLAYER_TRANSITION_HOLD_MS);
  }

  function handlePlayerCloseRequested({ control } = {}) {
    if (state.playerCloseTimerId) {
      return true;
    }

    const closeDelay = overlay.startPlayerCloseFade();
    if (!closeDelay || !control) {
      handlePlayerTransition();
      return false;
    }

    holdPlayerTransition(closeDelay + PLAYER_TRANSITION_HOLD_MS);
    updateNativePaneVisibility(true);

    state.playerCloseTimerId = setTimeout(() => {
      state.playerCloseTimerId = 0;
      if (!playerPage.runNativeCloseAction(control)) {
        handlePlayerTransition();
      }
      scheduleScan();
      schedulePlacementUpdate();
    }, closeDelay);

    return true;
  }

  function isReplacingLyricsPane() {
    return state.loading || isNativePaneHeld() || (state.hasSyncedLyrics && state.lines.length);
  }

  function resetTrack() {
    state.track = null;
    state.trackKey = "";
    state.loading = false;
    state.nativePaneHoldUntil = 0;
    overlay.setArtworkUrl("");
    clearLyrics();
  }

  function isCurrentLyricsRequest(requestKey, requestId) {
    return requestKey === state.trackKey && requestId === state.lyricsRequestId;
  }

  function handleOffsetChange(action) {
    if (action === "reset") {
      state.offsetSeconds = offsetController.saveOffset(0);
    } else if (action === "increase-large") {
      state.offsetSeconds = offsetController.saveOffset(offsetController.adjustOffset(state.offsetSeconds, 1, offsetController.JUMP_SECONDS));
    } else if (action === "decrease-large") {
      state.offsetSeconds = offsetController.saveOffset(offsetController.adjustOffset(state.offsetSeconds, -1, offsetController.JUMP_SECONDS));
    } else if (action === "increase") {
      state.offsetSeconds = offsetController.saveOffset(offsetController.adjustOffset(state.offsetSeconds, 1));
    } else if (action === "decrease") {
      state.offsetSeconds = offsetController.saveOffset(offsetController.adjustOffset(state.offsetSeconds, -1));
    }

    overlay.setOffset(state.offsetSeconds);
    syncToCurrentLyric(true);
  }

  async function handleFullscreenToggle() {
    if (isFullscreenActive()) {
      exitFullscreenMode();
      return;
    }

    const fullscreenTarget = document.documentElement;
    if (!fullscreenTarget?.requestFullscreen) {
      return;
    }

    state.fullscreenWanted = true;
    try {
      await fullscreenTarget.requestFullscreen({ navigationUI: "hide" });
    } catch (_error) {
      state.fullscreenWanted = false;
      overlay.setFullscreenActive(false);
    }

    schedulePlacementUpdate();
  }

  function exitFullscreenMode() {
    state.fullscreenWanted = false;
    overlay.setFullscreenActive(false);

    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }

    schedulePlacementUpdate();
  }

  function handleFullscreenChange() {
    if (!document.fullscreenElement) {
      state.fullscreenWanted = false;
    }

    overlay.setFullscreenActive(isFullscreenActive());
    schedulePlacementUpdate();
  }

  function handleFullscreenError() {
    state.fullscreenWanted = false;
    overlay.setFullscreenActive(false);
    schedulePlacementUpdate();
  }

  function isFullscreenActive() {
    return Boolean(state.fullscreenWanted && document.fullscreenElement);
  }

  function handleLineSeek(index) {
    const line = state.lines[index];
    const video = utils.getVideo();
    if (!line || !video) {
      return;
    }

    const seekTime = clampSeekTime(line.time + state.offsetSeconds, video.duration);
    if (!seekVideo(video, seekTime)) {
      return;
    }

    state.freshTrackGuardUntil = 0;
    syncToCurrentLyric(true);
  }

  function seekVideo(video, time) {
    try {
      video.currentTime = time;
      video.dispatchEvent(new Event("timeupdate", { bubbles: true }));
      return true;
    } catch (_error) {
      return false;
    }
  }

  function clampSeekTime(time, duration) {
    const minimum = Math.max(0, time);
    if (!Number.isFinite(duration) || duration <= 0) {
      return minimum;
    }

    return Math.min(duration, minimum);
  }

  function clearLyrics() {
    state.activeIndex = -1;
    state.hasSyncedLyrics = false;
    state.lines = [];
    overlay.clearLines();
  }

  function syncLoop() {
    syncToCurrentLyric(false);
    state.rafId = requestAnimationFrame(syncLoop);
  }

  function syncToCurrentLyric(forceScroll) {
    const video = utils.getVideo();
    if (!video || video.ended || !state.lines.length) {
      return;
    }

    const nextIndex = findActiveIndex(readOffsetSyncTime(video), state.lines);
    if (forceScroll || nextIndex !== state.activeIndex) {
      state.activeIndex = nextIndex;
      overlay.updateActiveLine(nextIndex, forceScroll);
    }
  }

  function readOffsetSyncTime(video) {
    const visualOffsetSeconds = state.offsetSeconds + VISUAL_HIGHLIGHT_OFFSET_SECONDS;
    return Math.max(0, readSyncTime(video) - visualOffsetSeconds);
  }

  function readSyncTime(video) {
    const playerBarTime = trackReader.readPlaybackTime();
    const hasPlayerBarTime = Number.isFinite(playerBarTime);
    const time = hasPlayerBarTime ? playerBarTime : video.currentTime || 0;

    if (
      !hasPlayerBarTime
      && performance.now() < state.freshTrackGuardUntil
      && time > STALE_HANDOFF_TIME_SECONDS
    ) {
      return 0;
    }

    if (time <= STALE_HANDOFF_TIME_SECONDS) {
      state.freshTrackGuardUntil = 0;
    }

    return time;
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

  function updatePlacement() {
    const playerPageElement = document.querySelector("ytmusic-player-page");
    const playerOpen = playerPage.isPlayerPageOpen(playerPageElement);
    const lyricsSelected = playerPage.isLyricsTabSelected();
    const hostRect = playerPage.getLyricsHostRect(playerPageElement);
    const transitionHeld = isPlayerTransitionHeld();
    const replacingLyricsPane = isReplacingLyricsPane();
    const visible = Boolean(
      !transitionHeld
      && playerOpen
      && lyricsSelected
      && hostRect
      && replacingLyricsPane
    );
    if (!visible && state.fullscreenWanted) {
      exitFullscreenMode();
    }

    const suppressNativePane = Boolean(visible || (transitionHeld && replacingLyricsPane));

    overlay.setLoading(state.loading);
    overlay.setOffsetControlsVisible(state.hasSyncedLyrics && state.lines.length);
    overlay.updatePlacement({
      fullscreenActive: isFullscreenActive(),
      hostRect,
      playerOpen: playerOpen && !transitionHeld,
      visible
    });
    updateNativePaneVisibility(suppressNativePane);
  }

  function updateNativePaneVisibility(hidden) {
    document.documentElement.classList.toggle("ytml-suppress-native-lyrics", Boolean(hidden));
  }
})();
