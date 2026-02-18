class OpenAIProvider extends TTSProvider {
  constructor() {
    super();
    this._audio = null;
    this._speaking = false;
    this._paused = false;
    this._rate = 1.0;
    this._voice = 'alloy';
    this._model = 'tts-1';
    this._sentences = []; // Array of { text, start }
    this._currentIndex = 0;
    this._highlightTimer = null;
  }

  async speak(text, options = {}) {
    this.stop();
    this._rate = options.rate || 1.0;
    this._voice = options.voice || 'alloy';
    this._model = options.model || 'tts-1';
    this._sentences = TTSProvider.splitIntoSentences(text);
    this._currentIndex = options.startSentence || 0;
    this._speaking = true;
    this._paused = false;
    await this._speakCurrentSentence();
  }

  async _speakCurrentSentence() {
    if (this._currentIndex >= this._sentences.length) {
      this._speaking = false;
      if (this._onEndCallback) this._onEndCallback();
      return;
    }

    const sentenceObj = this._sentences[this._currentIndex];
    const sentenceText = sentenceObj.text;
    const sentenceStart = sentenceObj.start;

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'openaiTTS',
        text: sentenceText,
        voice: this._voice,
        model: this._model,
        speed: this._rate
      });

      if (response.error) {
        if (this._onErrorCallback) this._onErrorCallback(response.error);
        return;
      }

      const blob = this._base64ToBlob(response.audio, 'audio/mpeg');
      const url = URL.createObjectURL(blob);
      this._audio = new Audio(url);
      this._audio.playbackRate = 1.0;

      this._audio.onloadedmetadata = () => {
        this._startApproximateHighlighting(sentenceText, sentenceStart, this._audio.duration);
      };

      this._audio.onended = () => {
        this._stopHighlighting();
        URL.revokeObjectURL(url);
        if (!this._speaking) return;
        this._currentIndex++;
        this._speakCurrentSentence();
      };

      this._audio.onerror = () => {
        URL.revokeObjectURL(url);
        if (this._onErrorCallback) this._onErrorCallback('Audio playback error');
      };

      await this._audio.play();
    } catch (err) {
      if (this._onErrorCallback) this._onErrorCallback(err.message);
    }
  }

  _startApproximateHighlighting(sentenceText, sentenceStart, duration) {
    const wordPositions = [];
    const regex = /\S+/g;
    let m;
    while ((m = regex.exec(sentenceText)) !== null) {
      wordPositions.push({ start: m.index, length: m[0].length });
    }
    if (wordPositions.length === 0) return;

    const timePerWord = (duration * 1000) / wordPositions.length;
    let wordIndex = 0;

    this._highlightTimer = setInterval(() => {
      if (wordIndex >= wordPositions.length) {
        this._stopHighlighting();
        return;
      }
      if (this._onWordBoundaryCallback) {
        this._onWordBoundaryCallback({
          charIndex: sentenceStart + wordPositions[wordIndex].start,
          charLength: wordPositions[wordIndex].length,
          sentenceIndex: this._currentIndex
        });
      }
      wordIndex++;
    }, timePerWord);
  }

  _stopHighlighting() {
    if (this._highlightTimer) {
      clearInterval(this._highlightTimer);
      this._highlightTimer = null;
    }
  }

  _base64ToBlob(base64, mimeType) {
    const bytes = atob(base64);
    const buffer = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      buffer[i] = bytes.charCodeAt(i);
    }
    return new Blob([buffer], { type: mimeType });
  }

  pause() {
    if (this._audio && this._speaking) {
      this._audio.pause();
      this._paused = true;
      this._stopHighlighting();
    }
  }

  resume() {
    if (this._audio && this._paused) {
      this._audio.play();
      this._paused = false;
      const remaining = this._audio.duration - this._audio.currentTime;
      const sentenceObj = this._sentences[this._currentIndex];
      const sentenceText = sentenceObj.text;
      const sentenceStart = sentenceObj.start;
      const progress = this._audio.currentTime / this._audio.duration;

      const wordPositions = [];
      const regex = /\S+/g;
      let m;
      while ((m = regex.exec(sentenceText)) !== null) {
        wordPositions.push({ start: m.index, length: m[0].length });
      }

      const startWord = Math.floor(progress * wordPositions.length);
      const remainingWords = wordPositions.length - startWord;
      if (remainingWords > 0) {
        const timePerWord = (remaining * 1000) / remainingWords;
        let wordIndex = startWord;
        this._highlightTimer = setInterval(() => {
          if (wordIndex >= wordPositions.length) {
            this._stopHighlighting();
            return;
          }
          if (this._onWordBoundaryCallback) {
            this._onWordBoundaryCallback({
              charIndex: sentenceStart + wordPositions[wordIndex].start,
              charLength: wordPositions[wordIndex].length,
              sentenceIndex: this._currentIndex
            });
          }
          wordIndex++;
        }, timePerWord);
      }
    }
  }

  stop() {
    this._speaking = false;
    this._paused = false;
    this._stopHighlighting();
    if (this._audio) {
      this._audio.pause();
      this._audio = null;
    }
  }

  get currentSentenceIndex() {
    return this._currentIndex;
  }

  get sentenceCount() {
    return this._sentences.length;
  }

  get isPaused() {
    return this._paused;
  }

  get isSpeaking() {
    return this._speaking;
  }

  skipForward() {
    if (this._currentIndex < this._sentences.length - 1) {
      this.stop();
      this._currentIndex++;
      this._speaking = true;
      this._speakCurrentSentence();
    }
  }

  skipBackward() {
    if (this._currentIndex > 0) {
      this.stop();
      this._currentIndex--;
      this._speaking = true;
      this._speakCurrentSentence();
    }
  }

  skipToSentence(index) {
    if (index >= 0 && index < this._sentences.length) {
      this.stop();
      this._currentIndex = index;
      this._speaking = true;
      this._speakCurrentSentence();
    }
  }

  setRate(rate) {
    this._rate = rate;
  }

  async getVoices() {
    return [
      { name: 'alloy', lang: 'en' },
      { name: 'echo', lang: 'en' },
      { name: 'fable', lang: 'en' },
      { name: 'nova', lang: 'en' },
      { name: 'onyx', lang: 'en' },
      { name: 'shimmer', lang: 'en' }
    ];
  }
}

if (typeof window !== 'undefined') {
  window.OpenAIProvider = OpenAIProvider;
}
