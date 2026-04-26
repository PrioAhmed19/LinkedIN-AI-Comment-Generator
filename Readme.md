#  LinkedIn AI Comment Generator

A Chrome extension that adds a one-click **✨ AI Comment** button to every LinkedIn comment box — powered by **Google Gemini**. It reads the post content and existing comments, then generates a genuine, professional comment tailored to the conversation.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-brightgreen)
![Gemini AI](https://img.shields.io/badge/Gemini-AI-8E44AD?logo=google&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow)

---

## ✨ Features

- **One-click comment generation** — click the button, get a ready-to-post comment instantly
- **Context-aware** — reads the post text, author name, and up to 10 existing comments so the reply fits the conversation
- **Smart model fallback** — if your selected model hits a quota limit, it automatically retries with the next available model
- **Model selector** — choose from 7 Gemini models (from lightweight free-tier to highest quality)
- **Test connection button** — verify your API key and model are working before you go to LinkedIn
- **Toast notifications** — clean in-page status messages instead of browser alert popups
- **No backend required** — all API calls go directly from your browser to Google's API

---

## 📸 Preview

> The **✨ AI Comment** button appears below every LinkedIn comment box automatically.

---

## 🚀 Installation

### Step 1 — Get the extension files

**Option A — Clone this repo:**
```bash
git clone https://github.com/PrioAhmed/linkedin-ai-comment-generator.git
```

**Option B — Download ZIP:**

Click **Code → Download ZIP** on this page, then unzip it.

### Step 2 — Load into Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Toggle on **Developer mode** (top-right corner)
3. Click **Load unpacked**
4. Select the cloned/unzipped folder

The extension icon will appear in your Chrome toolbar.

### Step 3 — Add your Gemini API key

1. Click the extension icon in the toolbar
2. Paste your **Gemini API key** into the field
3. Choose a model (default: Gemini 2.5 Flash Lite — recommended for free tier)
4. Click **Test Connection** to verify everything works
5. Click **Save**

> **Get a free API key:** [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)

---

## 🎯 How to use

1. Go to [linkedin.com](https://www.linkedin.com) and find any post in your feed
2. Click **Comment** to open the comment box
3. Click the **✨ AI Comment** button that appears below the text box
4. Wait ~2–3 seconds for Gemini to generate a comment
5. Review the text (edit if you like), then click **Post**

---

## 🧠 Available AI Models

| Model | Speed | Quality | Free Quota |
|---|---|---|---|
| Gemini 2.5 Flash Lite  | Fastest | Good | Highest |
| Gemini 2.0 Flash | Fast | Good | High |
| Gemini 2.5 Flash Preview | Fast | Great | Medium |
| Gemini 1.5 Flash | Fast | Good | High |
| Gemini 1.5 Flash 8B | Fastest | OK | Highest |
| Gemini 1.5 Pro | Slower | Great | Low |
| Gemini 2.5 Pro Preview | Slowest | Best | Lowest |

> If a model hits its quota limit, the extension automatically falls back through the list until it finds one that works.

---

## 📁 File Structure

```
linkedin-ai-comment-generator/
├── manifest.json       # Extension config (Manifest V3)
├── background.js       # Service worker — calls Gemini API, handles model fallback
├── content.js          # Injected into LinkedIn — finds comment boxes, adds button
├── styles.css          # Button and toast notification styles
├── options.html        # Settings popup UI
├── options.js          # Settings popup logic (saves API key + model)
├── icon.png            # Extension icon
└── README.md
```

---

## ⚙️ How it works

1. **`content.js`** runs on every LinkedIn page and uses a `MutationObserver` to detect when comment boxes appear (LinkedIn is a Single Page App, so boxes are created dynamically)
2. When a comment box is found, it injects the **✨ AI Comment** button below it
3. On click, it scrapes the post's author, text, and up to 10 existing comments from the DOM
4. It sends this context to **`background.js`** via `chrome.runtime.sendMessage`
5. **`background.js`** builds a prompt and calls the **Gemini REST API** directly
6. The generated comment is inserted into the LinkedIn editor using `execCommand('insertText')`

---

##  Privacy

- Your API key is stored locally in Chrome's `storage.local` — it never leaves your browser except to call Google's Gemini API directly
- No data is sent to any third-party server
- The extension only runs on `*.linkedin.com`

---

##  Development

To make changes and reload:

1. Edit any file in the folder
2. Go to `chrome://extensions/`
3. Click the **refresh icon** on the extension card
4. Reload the LinkedIn tab

To view content script logs: right-click on LinkedIn → **Inspect** → **Console** (filter by `AI Comment Generator`)

To view background worker logs: go to `chrome://extensions/` → click **Service Worker** link on the extension card

---

##  Contributing

Pull requests are welcome! Some ideas for improvements:

- [ ] Support for LinkedIn post replies (nested comments)
- [ ] Tone selector (formal / casual / witty)
- [ ] Comment history / saved presets
- [ ] Support for other languages

---

## 📄 License

MIT License — feel free to use, modify, and distribute.
