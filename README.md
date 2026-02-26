# Read Aloud

A Chrome extension that reads webpage text aloud with live text highlighting.

It supports two TTS providers:
- **Web Speech API** (free, uses system/browser voices)
- **OpenAI TTS** (`tts-1` / `tts-1-hd` with selectable voices)

## Features

- Extract main page text or read selected text
- Paste custom text directly into the popup
- Playback controls: play/pause, stop, skip sentence back/forward
- Adjustable playback speed
- Recent text history
- Settings page for provider, voice, and defaults

## Setup

### 1. Clone the project

```bash
git clone <your-repo-url>
cd read
```

### 2. Load extension in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this project folder (`read`)

The extension icon should appear in Chrome.

### 3. (Optional) Configure OpenAI TTS

1. Open the extension popup
2. Click the **Settings** button
3. Change provider to **OpenAI TTS**
4. Paste your OpenAI API key (`sk-...`)
5. Choose model/voice and click **Save**

If you keep **Web Speech API**, no API key is required.

## Usage

1. Open any webpage
2. Click the extension icon
3. Choose one:
   - **Extract Page Text**
   - **Use Selected Text**
   - Paste text into the input box
4. Press **Play**

## Project Structure

- `manifest.json` - Extension manifest (MV3)
- `popup/` - Main popup UI and playback logic
- `settings/` - Options page
- `background/` - Service worker (OpenAI TTS API call)
- `content/` - Content script injection
- `lib/` - TTS provider abstractions and implementations

## Notes

- OpenAI usage may incur API costs.
- API key is stored in `chrome.storage.local`.
