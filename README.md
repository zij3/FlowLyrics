# YouTube Music Animated Lyrics

A Chrome extension for YouTube Music that replaces the native Lyrics tab with animated synced lyrics when LRCLIB has synced LRC lyrics for the current track.

This extension is distributed as a downloadable ZIP from GitHub. It is not currently published on the Chrome Web Store, so it must be installed with Chrome's "Load unpacked" developer-mode flow.

## What It Does

- Detects the current YouTube Music track from the player bar and media session.
- Fetches synced LRC lyrics from LRCLIB when available.
- Animates the active lyric line against the real `<video>` playback time.
- Saves a timing offset for synced lyrics with small and large adjustment steps.
- Leaves YouTube Music's static lyrics alone when synced lyrics are not available.

## Install From GitHub ZIP

1. Download the extension ZIP from this repository.
   - Recommended: open `dist/youtube-music-animated-lyrics-0.2.0.zip`, then choose Download raw.
   - If a release is available, download the latest release ZIP from the repository's Releases page.
   - You can also use GitHub's Code -> Download ZIP option, then load the extracted repository folder.
2. Extract the ZIP somewhere you want to keep the extension.
   - Do not delete the extracted folder after installing. Chrome loads the extension from that folder.
3. Open Chrome and go to:
   `chrome://extensions`
4. Enable Developer mode in the top-right corner.
5. Click Load unpacked.
6. Select the extracted extension folder that contains `manifest.json`.
7. Open or refresh:
   `https://music.youtube.com`

Open the full player and click YouTube Music's Lyrics tab. When synced lyrics are available, the extension replaces the static lyrics pane with animated synced lyrics. If synced lyrics are not available, YouTube Music's own static lyrics stay visible.

## Updating

Because this is not installed from the Chrome Web Store, Chrome will not update it automatically.

To update:

1. Download the newer ZIP from GitHub.
2. Extract it over the old folder, or extract it to a new folder.
3. Go to `chrome://extensions`.
4. Click the reload button on the YouTube Music Animated Lyrics extension.
5. Refresh YouTube Music.

## Packaging A Release ZIP

For maintainers, create a release ZIP with `manifest.json` at the root of the archive. Do not include `.git`, local screenshots, browser profiles, or temporary files.

From the project root in PowerShell:

```powershell
$version = (Get-Content -Raw manifest.json | ConvertFrom-Json).version
New-Item -ItemType Directory -Force dist
Compress-Archive -Path manifest.json,background.js,content.js,styles.css,README.md,content -DestinationPath "dist\youtube-music-animated-lyrics-$version.zip" -Force
```

Commit the ZIP under `dist/`, or upload it as a GitHub release asset. Users should download that ZIP, extract it, and load the extracted folder in Chrome.

## Privacy

The extension runs only on `https://music.youtube.com/*`. It reads the current track information from YouTube Music and requests matching lyrics from LRCLIB. It does not require a login, does not collect analytics, and does not send browsing history to a custom server.

## Limitations

- Synced lyrics are only shown when LRCLIB has synced LRC lyrics for the current track.
- Plain or estimated lyrics are not rendered by the extension.
- When synced lyrics are unavailable, YouTube Music's default static lyrics remain visible.
- Since this is installed as an unpacked extension, Chrome may show developer-mode warnings.

This uses LRCLIB's public lyrics API. Some tracks will not have synced lyrics; those tracks keep YouTube Music's default static lyrics view.
