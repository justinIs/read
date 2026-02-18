document.addEventListener('DOMContentLoaded', async () => {
  const providerSelect = document.getElementById('providerSelect');
  const webspeechSection = document.getElementById('webspeechSection');
  const openaiSection = document.getElementById('openaiSection');
  const webspeechVoice = document.getElementById('webspeechVoice');
  const apiKey = document.getElementById('apiKey');
  const openaiModel = document.getElementById('openaiModel');
  const openaiVoice = document.getElementById('openaiVoice');
  const defaultSpeed = document.getElementById('defaultSpeed');
  const autoExtract = document.getElementById('autoExtract');
  const saveBtn = document.getElementById('saveBtn');
  const saveStatus = document.getElementById('saveStatus');

  // Load system voices for Web Speech
  function loadWebSpeechVoices() {
    const voices = speechSynthesis.getVoices();
    webspeechVoice.innerHTML = '<option value="">System Default</option>';
    for (const voice of voices) {
      const opt = document.createElement('option');
      opt.value = voice.name;
      opt.textContent = `${voice.name} (${voice.lang})`;
      webspeechVoice.appendChild(opt);
    }
  }

  loadWebSpeechVoices();
  speechSynthesis.onvoiceschanged = loadWebSpeechVoices;

  // Toggle provider sections
  providerSelect.addEventListener('change', () => {
    const isOpenAI = providerSelect.value === 'openai';
    webspeechSection.style.display = isOpenAI ? 'none' : '';
    openaiSection.style.display = isOpenAI ? '' : 'none';
  });

  // Load saved settings
  const saved = await chrome.storage.local.get({
    ttsProvider: 'webspeech',
    voice: '',
    openaiApiKey: '',
    model: 'tts-1',
    speed: '1',
    autoExtract: false
  });

  providerSelect.value = saved.ttsProvider;
  providerSelect.dispatchEvent(new Event('change'));

  if (saved.ttsProvider === 'openai') {
    openaiVoice.value = saved.voice || 'alloy';
  } else {
    // Set Web Speech voice after voices load
    const setWSVoice = () => {
      if (saved.voice) webspeechVoice.value = saved.voice;
    };
    setWSVoice();
    speechSynthesis.onvoiceschanged = () => {
      loadWebSpeechVoices();
      setWSVoice();
    };
  }

  apiKey.value = saved.openaiApiKey;
  openaiModel.value = saved.model;
  defaultSpeed.value = saved.speed;
  autoExtract.checked = saved.autoExtract;

  // Save
  saveBtn.addEventListener('click', async () => {
    const isOpenAI = providerSelect.value === 'openai';
    const voice = isOpenAI ? openaiVoice.value : webspeechVoice.value;

    await chrome.storage.local.set({
      ttsProvider: providerSelect.value,
      voice: voice,
      openaiApiKey: apiKey.value.trim(),
      model: openaiModel.value,
      speed: defaultSpeed.value,
      autoExtract: autoExtract.checked
    });

    saveStatus.textContent = 'Saved!';
    setTimeout(() => { saveStatus.textContent = ''; }, 2000);
  });
});
