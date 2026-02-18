class WebSpeechProvider extends TTSProvider {
  constructor() {
    super();
    this._synth = window.speechSynthesis;
    this._currentIndex = 0;
    this._speaking = false;
    this._paused = false;
    this._rate = 1.0;
    this._voice = null;
    this._sentences = []; // Array of { text, start }
  }

  async speak(text, options = {}) {
    this.stop();
    this._rate = options.rate || 1.0;
    this._voice = options.voice || null;
    this._sentences = TTSProvider.splitIntoSentences(text);
    this._currentIndex = options.startSentence || 0;
    this._speaking = true;
    this._paused = false;
    this._speakCurrentSentence();
  }

  _speakCurrentSentence() {
    if (this._currentIndex >= this._sentences.length) {
      this._speaking = false;
      if (this._onEndCallback) this._onEndCallback();
      return;
    }

    const sentenceObj = this._sentences[this._currentIndex];
    const sentenceText = sentenceObj.text;
    const sentenceStart = sentenceObj.start;
    const utterance = new SpeechSynthesisUtterance(sentenceText);
    utterance.rate = this._rate;

    if (this._voice) {
      const voices = this._synth.getVoices();
      const match = voices.find(v => v.name === this._voice);
      if (match) utterance.voice = match;
    }

    // Highlight the current sentence
    if (this._onWordBoundaryCallback) {
      this._onWordBoundaryCallback({
        charIndex: sentenceStart,
        charLength: sentenceText.length,
        sentenceIndex: this._currentIndex
      });
    }

    // Use real word boundaries if the browser provides them
    utterance.onboundary = (event) => {
      if (event.name === 'word' && this._onWordBoundaryCallback) {
        const wordLen = event.charLength || sentenceText.slice(event.charIndex).match(/^\S+/)?.[0]?.length || 1;
        this._onWordBoundaryCallback({
          charIndex: sentenceStart + event.charIndex,
          charLength: wordLen,
          sentenceIndex: this._currentIndex
        });
      }
    };

    utterance.onend = () => {
      if (!this._speaking) return;
      this._currentIndex++;
      this._speakCurrentSentence();
    };

    utterance.onerror = (event) => {
      if (event.error === 'canceled' || event.error === 'interrupted') return;
      if (this._onErrorCallback) this._onErrorCallback(event.error);
    };

    this._synth.speak(utterance);
  }

  pause() {
    if (this._speaking) {
      this._synth.pause();
      this._paused = true;
    }
  }

  resume() {
    if (this._paused) {
      this._synth.resume();
      this._paused = false;
    }
  }

  stop() {
    this._speaking = false;
    this._paused = false;
    this._synth.cancel();
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
      this._synth.cancel();
      this._currentIndex++;
      this._speakCurrentSentence();
    }
  }

  skipBackward() {
    if (this._currentIndex > 0) {
      this._synth.cancel();
      this._currentIndex--;
      this._speakCurrentSentence();
    }
  }

  skipToSentence(index) {
    if (index >= 0 && index < this._sentences.length) {
      this._synth.cancel();
      this._currentIndex = index;
      this._speakCurrentSentence();
    }
  }

  setRate(rate) {
    this._rate = rate;
  }

  async getVoices() {
    return new Promise((resolve) => {
      let voices = this._synth.getVoices();
      if (voices.length > 0) {
        resolve(voices.map(v => ({ name: v.name, lang: v.lang })));
        return;
      }
      this._synth.onvoiceschanged = () => {
        voices = this._synth.getVoices();
        resolve(voices.map(v => ({ name: v.name, lang: v.lang })));
      };
    });
  }
}

if (typeof window !== 'undefined') {
  window.WebSpeechProvider = WebSpeechProvider;
}
