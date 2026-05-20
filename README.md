# YouTube Music Animated Lyrics

An unpacked Chrome extension that adds a mobile-style animated lyric panel to YouTube Music.

## What It Does

- Detects the current YouTube Music track from the player bar and media session.
- Fetches synced LRC lyrics from LRCLIB when available.
- Animates the active lyric line against the real `<video>` playback time.
- Saves a timing offset for synced lyrics with small and large adjustment steps.
- Leaves YouTube Music's static lyrics alone when synced lyrics are not available.

## Install

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose Load unpacked.
4. Select this folder:
   `C:\Projects\youtube-music-animated-lyrics`
5. Open or refresh `https://music.youtube.com`.

Open the full player and click YouTube Music's `Lyrics` tab. When synced lyrics are available, the extension replaces the static lyrics pane with animated synced lyrics. If synced lyrics are not available, YouTube Music's own static lyrics stay visible.

## Notes

This uses LRCLIB's public lyrics API. Some tracks will not have synced lyrics; those tracks keep YouTube Music's default static lyrics view.
