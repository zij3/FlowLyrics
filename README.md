# YouTube Music Animated Lyrics

Download the extension ZIP:
[youtube-music-animated-lyrics-0.2.0.zip](https://github.com/zij3/youtube-music-animated-lyrics/raw/main/youtube-music-animated-lyrics-0.2.0.zip)

![YouTube Music Animated Lyrics preview](assets/preview.png)

A Chrome extension for YouTube Music that replaces the native Lyrics tab with animated synced lyrics when LRCLIB has synced LRC lyrics for the current track.

This extension is distributed from GitHub instead of the Chrome Web Store, so it must be installed with Chrome's "Load unpacked" developer-mode flow.

## Install

1. Download the ZIP above.
2. Extract it somewhere you want to keep the extension.
   - Do not delete the extracted folder after installing. Chrome loads the extension from that folder.
3. Open Chrome and go to:
   `chrome://extensions`
4. Enable Developer mode in the top-right corner.
5. Click Load unpacked.
6. Select the extracted folder that contains `manifest.json`.
7. Open or refresh:
   `https://music.youtube.com`

Open the full player and click YouTube Music's Lyrics tab. When synced lyrics are available, the extension replaces the static lyrics pane with animated synced lyrics. If synced lyrics are not available, YouTube Music's own static lyrics stay visible.

## Updating

Chrome will not update this extension automatically because it is not installed from the Chrome Web Store.

To update:

1. Download the latest ZIP from this repository.
2. Extract it over the old folder, or extract it to a new folder.
3. Go to `chrome://extensions`.
4. Click the reload button on the YouTube Music Animated Lyrics extension.
5. Refresh YouTube Music.

## What It Does

- Detects the current YouTube Music track from the player bar and media session.
- Fetches synced LRC lyrics from LRCLIB when available.
- Animates the active lyric line against the real `<video>` playback time.
- Saves a timing offset for synced lyrics with small and large adjustment steps.
- Leaves YouTube Music's static lyrics alone when synced lyrics are not available.

## Repository Layout

- `src/` contains the unpacked Chrome extension source. For local development, load this folder in Chrome.
- `youtube-music-animated-lyrics-<version>.zip` is the downloadable extension package at the repository root.
- `scripts/package-extension.ps1` rebuilds the release ZIP from `src/`.

This keeps the source clean while making the downloadable ZIP the first thing people see.

## Development Install

For local development, load the source folder directly:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select this folder:
   `src`
5. Refresh YouTube Music after code changes.

## Packaging

Run this from the repository root in PowerShell:

```powershell
.\scripts\package-extension.ps1
```

The script reads the version from `src/manifest.json` and writes:

```text
youtube-music-animated-lyrics-<version>.zip
```

Commit that ZIP at the repository root for direct downloads from GitHub.

## Privacy

The extension runs only on `https://music.youtube.com/*`. It reads the current track information from YouTube Music and requests matching lyrics from LRCLIB. It does not require a login, does not collect analytics, and does not send browsing history to a custom server.

## Limitations

- Synced lyrics are only shown when LRCLIB has synced LRC lyrics for the current track.
- Plain or estimated lyrics are not rendered by the extension.
- When synced lyrics are unavailable, YouTube Music's default static lyrics remain visible.
- Since this is installed as an unpacked extension, Chrome may show developer-mode warnings.

This uses LRCLIB's public lyrics API. Some tracks will not have synced lyrics; those tracks keep YouTube Music's default static lyrics view.
