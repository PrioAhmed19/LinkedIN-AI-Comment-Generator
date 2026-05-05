document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('geminiApiKey');
  const modelSelect = document.getElementById('modelSelect');
  const saveBtn = document.getElementById('saveBtn');
  const testBtn = document.getElementById('testBtn');
  const statusDiv = document.getElementById('status');
  const testResult = document.getElementById('testResult');

  chrome.storage.local.get(['geminiApiKey', 'geminiModel'], (result) => {
    if (result.geminiApiKey) {
      apiKeyInput.value = result.geminiApiKey;
    }
    if (result.geminiModel) {
      modelSelect.value = result.geminiModel;
    }
  });

  saveBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    const model = modelSelect.value;

    chrome.storage.local.set({ geminiApiKey: key, geminiModel: model }, () => {
      statusDiv.style.display = 'block';
      testResult.style.display = 'none';
      setTimeout(() => {
        statusDiv.style.display = 'none';
      }, 3000);
    });
  });

  testBtn.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();
    const model = modelSelect.value;

    if (!key) {
      showTestResult('error', 'Please enter an API key first.');
      return;
    }

    testBtn.disabled = true;
    testBtn.textContent = 'Testing...';
    testResult.style.display = 'none';

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Say "Connection successful!" in exactly those words.' }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 20 }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        const errorMsg = errorData.error?.message || `HTTP ${response.status}`;

        if (errorMsg.includes('quota') || errorMsg.includes('RESOURCE_EXHAUSTED')) {
          showTestResult('error', `Quota exceeded for "${model}". Try a different model or wait for quota reset.\n\nTip: Try "Gemini 1.5 Flash 8B".`);
        } else if (errorMsg.includes('API_KEY_INVALID') || errorMsg.includes('API key not valid')) {
          showTestResult('error', 'API key is invalid. Please check and re-paste it.');
        } else if (errorMsg.includes('not found') || errorMsg.includes('NOT_FOUND')) {
          showTestResult('error', `Model "${model}" not found. Try a different model.`);
        } else {
          showTestResult('error', errorMsg);
        }
      } else {
        const data = await response.json();
        if (data.candidates && data.candidates.length > 0) {
          showTestResult('success', `Connection works. Model "${model}" is ready to use.`);
        } else {
          showTestResult('error', 'API responded but returned no content. Try a different model.');
        }
      }
    } catch (err) {
      showTestResult('error', `Network error: ${err.message}`);
    }

    testBtn.disabled = false;
    testBtn.textContent = 'Test Connection';
  });

  function showTestResult(type, message) {
    testResult.className = type;
    testResult.textContent = message;
    testResult.style.display = 'block';
    statusDiv.style.display = 'none';
  }
});