(() => {
  const STRIP_SELECTORS = [
    'nav', 'header', 'footer', 'aside',
    '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]', '[role="complementary"]',
    '.ad', '.ads', '.advertisement', '[class*="sidebar"]',
    'script', 'style', 'noscript', 'iframe', 'svg',
    '[aria-hidden="true"]'
  ];

  function extractMainText() {
    const candidates = [
      document.querySelector('article'),
      document.querySelector('main'),
      document.querySelector('[role="main"]'),
      findLargestTextBlock()
    ];

    const container = candidates.find(el => el !== null);
    if (!container) {
      return [document.body.innerText.trim()];
    }

    const clone = container.cloneNode(true);
    clone.querySelectorAll(STRIP_SELECTORS.join(',')).forEach(el => el.remove());

    const paragraphs = [];
    const walker = document.createTreeWalker(clone, NodeFilter.SHOW_ELEMENT, {
      acceptNode(node) {
        const tag = node.tagName.toLowerCase();
        if (['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'td', 'th', 'dt', 'dd', 'figcaption'].includes(tag)) {
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_SKIP;
      }
    });

    let node;
    while ((node = walker.nextNode())) {
      const text = node.innerText.trim();
      if (text.length > 0) {
        paragraphs.push(text);
      }
    }

    if (paragraphs.length === 0) {
      const fallback = clone.innerText.trim();
      if (fallback) return [fallback];
    }

    return paragraphs;
  }

  function findLargestTextBlock() {
    const divs = document.querySelectorAll('div, section');
    let best = null;
    let bestScore = 0;

    for (const div of divs) {
      const pCount = div.querySelectorAll('p').length;
      const textLen = div.innerText.trim().length;
      const score = pCount * 100 + textLen;
      if (score > bestScore) {
        bestScore = score;
        best = div;
      }
    }

    return best;
  }

  function getSelectedText() {
    return window.getSelection().toString().trim();
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'extractText') {
      const paragraphs = extractMainText();
      sendResponse({ text: paragraphs.join('\n\n') });
    } else if (message.action === 'getSelectedText') {
      const text = getSelectedText();
      sendResponse({ text });
    }
    return true;
  });
})();
