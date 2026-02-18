document.addEventListener('DOMContentLoaded', async () => {
  const extractBtn = document.getElementById('extractBtn');
  const selectedBtn = document.getElementById('selectedBtn');
  const inputText = document.getElementById('inputText');
  const displayArea = document.getElementById('displayArea');
  const playBtn = document.getElementById('playBtn');
  const playIcon = document.getElementById('playIcon');
  const pauseIcon = document.getElementById('pauseIcon');
  const stopBtn = document.getElementById('stopBtn');
  const skipBackBtn = document.getElementById('skipBackBtn');
  const skipFwdBtn = document.getElementById('skipFwdBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const speedSelect = document.getElementById('speedSelect');
  const statusBar = document.getElementById('statusBar');

  let provider = null;
  let currentText = '';
  let isPlaying = false;
  let cachedSelection = '';
  let currentTab = null;
  let historySavedForCurrentText = false;

  const progressFill = document.getElementById('progressFill');

  const historyToggle = document.getElementById('historyToggle');
  const historyArrow = historyToggle.querySelector('.history-arrow');
  const historyCount = document.getElementById('historyCount');
  const historyList = document.getElementById('historyList');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');

  // Helper: run a function in the active tab (all frames, return longest result)
  async function runInTab(func) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    console.log('[ReadAloud] active tab:', tab?.id, tab?.url);
    if (!tab?.id) throw new Error('No active tab');
    currentTab = tab;
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func
    });
    console.log('[ReadAloud] executeScript results:', results.length, 'frames');
    // Return the longest non-empty result across all frames
    let best = '';
    for (const r of results) {
      const val = r.result || '';
      console.log('[ReadAloud] frame', r.frameId, 'result length:', val.length);
      if (val.length > best.length) best = val;
    }
    return best;
  }

  // Capture selection immediately before it can be lost
  try {
    cachedSelection = await runInTab(() => {
      const sel = window.getSelection();
      return sel ? sel.toString().trim() : '';
    });
    console.log('[ReadAloud] cached selection length:', cachedSelection.length);
  } catch (e) {
    console.error('[ReadAloud] selection capture failed:', e);
    cachedSelection = '';
  }

  async function loadSettings() {
    const result = await chrome.storage.local.get({
      ttsProvider: 'webspeech',
      voice: '',
      speed: '1',
      model: 'tts-1',
      autoExtract: false
    });
    speedSelect.value = result.speed;
    return result;
  }

  async function initProvider(settings) {
    if (settings.ttsProvider === 'openai') {
      provider = new OpenAIProvider();
    } else {
      provider = new WebSpeechProvider();
    }

    provider.onWordBoundary((event) => {
      highlightWord(event.charIndex, event.charLength, event.sentenceIndex);
    });

    provider.onEnd(() => {
      stopPlayback();
      progressFill.style.width = '100%';
      setStatus('Finished');
    });

    provider.onError((error) => {
      stopPlayback();
      setStatus('Error: ' + error);
    });
  }

  const settings = await loadSettings();
  await initProvider(settings);

  if (settings.autoExtract) {
    extractBtn.click();
  }

  // --- Text extraction ---

  extractBtn.addEventListener('click', async () => {
    setStatus('Extracting text...');
    console.log('[ReadAloud] Extract button clicked');
    try {
      const text = await runInTab(() => {
        const STRIP = [
          'nav', 'header', 'footer', 'aside',
          '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
          '[role="complementary"]', '.ad', '.ads', '.advertisement',
          '[class*="sidebar"]', 'script', 'style', 'noscript', 'iframe', 'svg',
          '[aria-hidden="true"]'
        ];

        // Find best container
        let container =
          document.querySelector('article') ||
          document.querySelector('main') ||
          document.querySelector('[role="main"]');

        if (!container) {
          // Heuristic: find div/section with most <p> children
          let best = null;
          let bestScore = 0;
          for (const el of document.querySelectorAll('div, section')) {
            const score = el.querySelectorAll('p').length * 100 + el.innerText.trim().length;
            if (score > bestScore) {
              bestScore = score;
              best = el;
            }
          }
          container = best;
        }

        if (!container) {
          return document.body.innerText.trim();
        }

        const clone = container.cloneNode(true);
        try { clone.querySelectorAll(STRIP.join(',')).forEach(el => el.remove()); } catch {}

        const textTags = ['p','h1','h2','h3','h4','h5','h6','li','blockquote','td','th','dt','dd','figcaption'];
        const paragraphs = [];
        for (const el of clone.querySelectorAll(textTags.join(','))) {
          const t = el.innerText.trim();
          if (t) paragraphs.push(t);
        }

        return paragraphs.length > 0 ? paragraphs.join('\n\n') : clone.innerText.trim();
      });

      console.log('[ReadAloud] extracted text length:', text?.length, 'preview:', text?.slice(0, 100));
      if (text) {
        currentText = text;
        inputText.value = currentText;
        renderText(currentText);
        setStatus('Text extracted (' + currentText.split(/\s+/).length + ' words)');
        enablePlayback();
        historySavedForCurrentText = true;
        saveToHistory(currentTab?.title || '', currentTab?.url || '', currentText);
      } else {
        setStatus('No text found on page');
      }
    } catch (err) {
      console.error('[ReadAloud] extract error:', err);
      setStatus('Could not extract text: ' + err.message);
    }
  });

  selectedBtn.addEventListener('click', async () => {
    console.log('[ReadAloud] Selected text button clicked, cached:', cachedSelection.length);
    // Try live selection first, fall back to cached
    let text = cachedSelection;
    try {
      const live = await runInTab(() => {
        const sel = window.getSelection();
        return sel ? sel.toString().trim() : '';
      });
      console.log('[ReadAloud] live selection length:', live?.length);
      if (live) text = live;
    } catch (e) {
      console.error('[ReadAloud] live selection error:', e);
    }

    if (text) {
      currentText = text;
      inputText.value = currentText;
      renderText(currentText);
      setStatus('Selected text loaded (' + currentText.split(/\s+/).length + ' words)');
      enablePlayback();
      historySavedForCurrentText = true;
      saveToHistory(currentTab?.title || '', currentTab?.url || '', currentText);
    } else {
      setStatus('No text selected. Highlight text on the page first.');
    }
  });

  inputText.addEventListener('input', () => {
    currentText = inputText.value.trim();
    historySavedForCurrentText = false;
    if (currentText) {
      renderText(currentText);
      enablePlayback();
      setStatus('Ready');
    } else {
      displayArea.innerHTML = '<p class="placeholder-text">Text will appear here during playback...</p>';
      disablePlayback();
      setStatus('');
    }
  });

  // --- Playback ---

  playBtn.addEventListener('click', async () => {
    if (!currentText) return;

    if (provider.isPaused) {
      provider.resume();
      showPauseButton();
      isPlaying = true;
      setStatus('Playing...');
      return;
    }

    if (provider.isSpeaking) {
      provider.pause();
      showPlayButton();
      isPlaying = false;
      setStatus('Paused');
      return;
    }

    // Start fresh playback
    const speed = parseFloat(speedSelect.value);
    const playbackSettings = await chrome.storage.local.get({
      voice: '',
      model: 'tts-1',
      ttsProvider: 'webspeech'
    });

    // Re-init provider if settings changed
    if ((playbackSettings.ttsProvider === 'openai' && provider instanceof WebSpeechProvider) ||
        (playbackSettings.ttsProvider !== 'openai' && provider instanceof OpenAIProvider)) {
      await initProvider(playbackSettings);
    }

    renderText(currentText);
    showPauseButton();
    isPlaying = true;
    enableTransportControls();
    setStatus('Playing...');

    // Save pasted text to history (Extract/Selected already save on load)
    if (!historySavedForCurrentText) {
      historySavedForCurrentText = true;
      saveToHistory(currentText.slice(0, 50), '', currentText);
    }

    await provider.speak(currentText, {
      rate: speed,
      voice: playbackSettings.voice,
      model: playbackSettings.model
    });
  });

  stopBtn.addEventListener('click', () => {
    stopPlayback();
    setStatus('Stopped');
  });

  skipBackBtn.addEventListener('click', () => {
    if (provider && provider.isSpeaking) {
      provider.skipBackward();
      setStatus('Skipped back');
    }
  });

  skipFwdBtn.addEventListener('click', () => {
    if (provider && provider.isSpeaking) {
      provider.skipForward();
      setStatus('Skipped forward');
    }
  });

  speedSelect.addEventListener('change', () => {
    const speed = parseFloat(speedSelect.value);
    if (provider) {
      provider.setRate(speed);
    }
    chrome.storage.local.set({ speed: speedSelect.value });
  });

  settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage?.() ||
      window.open(chrome.runtime.getURL('settings/settings.html'));
  });

  // --- Display & Highlighting ---

  function renderText(text) {
    const sentences = TTSProvider.splitIntoSentences(text);
    let html = '<span class="text-content">';
    let lastEnd = 0;
    for (let i = 0; i < sentences.length; i++) {
      const s = sentences[i];
      // Preserve whitespace/newlines between sentences
      if (s.start > lastEnd) {
        html += escapeHtml(text.slice(lastEnd, s.start));
      }
      html += '<span class="sentence" data-sentence="' + i + '">' + escapeHtml(s.text) + '</span>';
      lastEnd = s.start + s.text.length;
    }
    if (lastEnd < text.length) {
      html += escapeHtml(text.slice(lastEnd));
    }
    html += '</span>';
    displayArea.innerHTML = html;
  }

  displayArea.addEventListener('click', async (e) => {
    const sentenceEl = e.target.closest('.sentence');
    if (!sentenceEl || !currentText) return;
    const index = parseInt(sentenceEl.dataset.sentence, 10);
    if (isNaN(index)) return;

    if (provider.isSpeaking || provider.isPaused) {
      // Jump to the clicked sentence during playback
      if (provider.isPaused) {
        provider.resume();
        showPauseButton();
        isPlaying = true;
      }
      provider.skipToSentence(index);
      setStatus('Playing...');
    } else {
      // Start playback from the clicked sentence
      const speed = parseFloat(speedSelect.value);
      const playbackSettings = await chrome.storage.local.get({
        voice: '',
        model: 'tts-1',
        ttsProvider: 'webspeech'
      });
      if ((playbackSettings.ttsProvider === 'openai' && provider instanceof WebSpeechProvider) ||
          (playbackSettings.ttsProvider !== 'openai' && provider instanceof OpenAIProvider)) {
        await initProvider(playbackSettings);
      }
      renderText(currentText);
      showPauseButton();
      isPlaying = true;
      enableTransportControls();
      setStatus('Playing...');

      if (!historySavedForCurrentText) {
        historySavedForCurrentText = true;
        saveToHistory(currentText.slice(0, 50), '', currentText);
      }

      await provider.speak(currentText, {
        rate: speed,
        voice: playbackSettings.voice,
        model: playbackSettings.model,
        startSentence: index
      });
    }
  });

  function highlightWord(charIndex, charLength, sentenceIndex) {
    if (!currentText) return;

    const sentences = TTSProvider.splitIntoSentences(currentText);
    let html = '<span class="text-content">';
    let lastEnd = 0;
    for (let i = 0; i < sentences.length; i++) {
      const s = sentences[i];
      if (s.start > lastEnd) {
        html += escapeHtml(currentText.slice(lastEnd, s.start));
      }
      const sText = s.text;
      const sStart = s.start;
      const sEnd = sStart + sText.length;
      const cls = i === sentenceIndex ? 'sentence sentence-active' : 'sentence';

      // Check if the highlighted word falls within this sentence
      if (charIndex >= sStart && charIndex < sEnd) {
        const localStart = charIndex - sStart;
        const localEnd = localStart + charLength;
        const before = escapeHtml(sText.slice(0, localStart));
        const word = escapeHtml(sText.slice(localStart, localEnd));
        const after = escapeHtml(sText.slice(localEnd));
        html += '<span class="' + cls + '" data-sentence="' + i + '">' +
          before + '<span class="word-highlight">' + word + '</span>' + after +
          '</span>';
      } else {
        html += '<span class="' + cls + '" data-sentence="' + i + '">' + escapeHtml(sText) + '</span>';
      }
      lastEnd = sEnd;
    }
    if (lastEnd < currentText.length) {
      html += escapeHtml(currentText.slice(lastEnd));
    }
    html += '</span>';
    displayArea.innerHTML = html;

    // Update progress bar
    const progress = currentText.length > 0
      ? Math.min(100, ((charIndex + charLength) / currentText.length) * 100)
      : 0;
    progressFill.style.width = progress + '%';

    const highlight = displayArea.querySelector('.word-highlight');
    if (highlight) {
      highlight.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function buildCharMap(plain, escaped) {
    const map = [];
    let ei = 0;
    for (let pi = 0; pi < plain.length; pi++) {
      map[pi] = ei;
      const ch = plain[pi];
      if (ch === '&') ei += 5; // &amp;
      else if (ch === '<') ei += 4; // &lt;
      else if (ch === '>') ei += 4; // &gt;
      else if (ch === '"') ei += 6; // &quot;
      else ei += 1;
    }
    map[plain.length] = ei;
    return map;
  }

  function escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // --- UI State ---

  function enablePlayback() {
    playBtn.disabled = false;
  }

  function disablePlayback() {
    playBtn.disabled = true;
    stopBtn.disabled = true;
    skipBackBtn.disabled = true;
    skipFwdBtn.disabled = true;
  }

  function enableTransportControls() {
    stopBtn.disabled = false;
    skipBackBtn.disabled = false;
    skipFwdBtn.disabled = false;
  }

  function showPlayButton() {
    playIcon.style.display = '';
    pauseIcon.style.display = 'none';
  }

  function showPauseButton() {
    playIcon.style.display = 'none';
    pauseIcon.style.display = '';
  }

  function stopPlayback() {
    if (provider) provider.stop();
    isPlaying = false;
    showPlayButton();
    disablePlayback();
    progressFill.style.width = '0%';
    if (currentText) {
      playBtn.disabled = false;
      renderText(currentText);
    }
  }

  function setStatus(msg) {
    statusBar.textContent = msg;
  }

  // --- History ---

  async function saveToHistory(title, url, text) {
    if (!text) return;
    const { history = [] } = await chrome.storage.local.get('history');
    // Deduplicate by url+text (skip if identical entry already at top)
    const dominated = history.findIndex(h => h.url === url && h.text === text);
    if (dominated !== -1) history.splice(dominated, 1);
    history.unshift({ id: Date.now(), title, url, text, timestamp: Date.now() });
    await chrome.storage.local.set({ history });
    renderHistory(history);
  }

  async function loadHistory() {
    const { history = [] } = await chrome.storage.local.get('history');
    renderHistory(history);
  }

  async function deleteHistoryItem(id) {
    const { history = [] } = await chrome.storage.local.get('history');
    const updated = history.filter(h => h.id !== id);
    await chrome.storage.local.set({ history: updated });
    renderHistory(updated);
  }

  async function clearHistory() {
    await chrome.storage.local.set({ history: [] });
    renderHistory([]);
  }

  function renderHistory(history) {
    historyCount.textContent = history.length;
    clearHistoryBtn.style.display = history.length ? '' : 'none';
    historyList.innerHTML = '';
    for (const item of history) {
      const el = document.createElement('div');
      el.className = 'history-item';
      const displayTitle = item.title || item.text.slice(0, 50) + (item.text.length > 50 ? '...' : '');
      const hostname = item.url ? new URL(item.url).hostname : 'pasted text';
      el.innerHTML =
        '<div class="history-item-info">' +
          '<div class="history-item-title">' + escapeHtml(displayTitle) + '</div>' +
          '<div class="history-item-meta">' + escapeHtml(hostname) + ' · ' + relativeTime(item.timestamp) + '</div>' +
        '</div>' +
        '<button class="history-delete" title="Remove">&times;</button>';
      el.querySelector('.history-item-info').addEventListener('click', () => {
        currentText = item.text;
        inputText.value = currentText;
        renderText(currentText);
        enablePlayback();
        setStatus('Loaded from history');
      });
      el.querySelector('.history-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteHistoryItem(item.id);
      });
      historyList.appendChild(el);
    }
  }

  function relativeTime(ts) {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    return Math.floor(diff / 86400) + 'd ago';
  }

  historyToggle.addEventListener('click', () => {
    const open = historyList.style.display === 'none';
    historyList.style.display = open ? '' : 'none';
    historyArrow.classList.toggle('open', open);
  });

  clearHistoryBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    clearHistory();
  });

  loadHistory();
});
