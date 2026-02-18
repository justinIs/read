chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'openaiTTS') {
    handleOpenAITTS(message).then(sendResponse);
    return true; // Keep message channel open for async response
  }
});

async function handleOpenAITTS({ text, voice, model, speed }) {
  try {
    const { openaiApiKey } = await chrome.storage.local.get('openaiApiKey');
    if (!openaiApiKey) {
      return { error: 'No API key configured. Add your OpenAI API key in Settings.' };
    }

    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model || 'tts-1',
        input: text,
        voice: voice || 'alloy',
        speed: speed || 1.0,
        response_format: 'mp3'
      })
    });

    if (!response.ok) {
      const errBody = await response.text();
      let errMsg = `API error (${response.status})`;
      try {
        const parsed = JSON.parse(errBody);
        errMsg = parsed.error?.message || errMsg;
      } catch {}
      return { error: errMsg };
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64 = arrayBufferToBase64(arrayBuffer);
    return { audio: base64 };
  } catch (err) {
    return { error: err.message };
  }
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Register settings page as options page
chrome.runtime.onInstalled?.addListener(() => {
  // Extension installed/updated
});
