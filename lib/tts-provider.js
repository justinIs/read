class TTSProvider {
  constructor() {
    this._onWordBoundaryCallback = null;
    this._onEndCallback = null;
    this._onErrorCallback = null;
  }

  async speak(text, options = {}) {
    throw new Error('speak() must be implemented by subclass');
  }

  pause() {
    throw new Error('pause() must be implemented by subclass');
  }

  resume() {
    throw new Error('resume() must be implemented by subclass');
  }

  stop() {
    throw new Error('stop() must be implemented by subclass');
  }

  onWordBoundary(callback) {
    this._onWordBoundaryCallback = callback;
  }

  onEnd(callback) {
    this._onEndCallback = callback;
  }

  onError(callback) {
    this._onErrorCallback = callback;
  }

  async getVoices() {
    throw new Error('getVoices() must be implemented by subclass');
  }

  // Returns array of { text, start } with positions in the original string
  static splitIntoSentences(text) {
    const results = [];
    const regex = /[^.!?\n]+[.!?]?\s*/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const trimmed = match[0].trim();
      if (trimmed.length > 0) {
        // Find the actual start of the trimmed text within the match
        const leadingSpaces = match[0].indexOf(trimmed);
        results.push({ text: trimmed, start: match.index + leadingSpaces });
      }
    }
    if (results.length === 0 && text.trim()) {
      results.push({ text: text.trim(), start: text.indexOf(text.trim()) });
    }
    return results;
  }
}

if (typeof window !== 'undefined') {
  window.TTSProvider = TTSProvider;
}
