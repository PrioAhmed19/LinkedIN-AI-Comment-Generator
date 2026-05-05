const FALLBACK_MODELS = [
  'gemini-1.5-flash-8b',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
];

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "generateComment") {
    chrome.storage.local.get(['geminiApiKey', 'geminiModel'], async (result) => {
      const apiKey = result.geminiApiKey;
      const preferredModel = result.geminiModel || 'gemini-2.5-flash-lite';

      if (!apiKey) {
        sendResponse({ error: "No API key set. Click the extension icon → enter your Gemini API key." });
        return;
      }

      // Build model list: preferred first, then fallbacks (no duplicates)
      const modelsToTry = [preferredModel, ...FALLBACK_MODELS.filter(m => m !== preferredModel)];

      let lastError = null;

      for (const model of modelsToTry) {
        try {
          console.log(`[AI Comment Generator] Trying model: ${model}`);
          const comment = await callGeminiAPI(request.postAuthor, request.postText, request.existingComments, apiKey, model);
          const usedFallback = model !== preferredModel;
          sendResponse({
            comment,
            model,
            fallback: usedFallback
          });
          return;
        } catch (error) {
          lastError = error;
          const msg = (error.message || '').toLowerCase();
          // Only fallback on quota/rate-limit errors
          if (msg.includes('quota') || msg.includes('resource_exhausted') || msg.includes('429') || msg.includes('rate')) {
            console.warn(`[AI Comment Generator] Model "${model}" quota exhausted, trying next...`);
            continue;
          }
          // For other errors (invalid key, etc.), don't fallback — fail immediately
          break;
        }
      }

      console.error("[AI Comment Generator] All models failed:", lastError);
      sendResponse({
        error: `All models exhausted. Last error: ${lastError?.message || "Unknown error"}. Try again later or check your API key.`
      });
    });

    return true; // Keep the message channel open for async response
  }
});

async function callGeminiAPI(postAuthor, postText, existingComments, apiKey, model) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  // Build a rich context block for the AI
  let contextBlock = '';

  if (postAuthor) {
    contextBlock += `POST AUTHOR: ${postAuthor}\n\n`;
  }

  contextBlock += `POST CONTENT:\n${postText}\n`;

  if (existingComments && existingComments.length > 0) {
    contextBlock += `\n--- EXISTING COMMENTS (${existingComments.length}) ---\n`;
    existingComments.forEach((c, i) => {
      contextBlock += `${i + 1}. ${c.author}: "${c.text}"\n`;
    });
  }

  const prompt = `Role: You are a Senior LinkedIn Ghostwriter and Engagement Strategist. Your goal is to write a "High-Signal" comment that is 100% ready to publish.

Input Context:
${contextBlock}

The Goal:
Draft ONE high-impact comment (max 40 words) that adds unique value. It must sound like an expert contributor, not an AI assistant.

Execution Rules:

NO PLACEHOLDERS: Do not use brackets [ ], parentheses ( ), or "Insert [Topic]" markers. You must commit to a specific detail found in the post.

The "Specific Anchor": Identify one specific noun, data point, or claim from the post. Build the comment around that specific element rather than the "overall theme."

Pattern Interruption: Do not agree with the author’s main point. Instead, pivot to a "second-order effect" (e.g., if they talk about a new tool, talk about the culture shift needed to use it).

The Response Trigger: End with a sharp, low-friction question that the author can answer in one sentence.

Tone & Style:

Punchy & Direct: Use short sentences. Use line breaks for readability.

Human-Centric: Avoid "LinkedIn-speak" (e.g., "Deep dive," "Valuable insights," "Game changer").

Zero Fluff: No "Great post," "Thanks for sharing," or "I totally agree."

Strict Output Constraint:

Output ONLY the comment.

No preamble, no labels, no quotation marks.

If you include a placeholder, the response has failed. If the context is vague, make a logical executive decision and commit to it.`;

  const requestBody = {
    contents: [{
      parts: [{
        text: prompt
      }]
    }],
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 200
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error?.message || `API request failed (${response.status})`);
  }

  const data = await response.json();
  if (data.candidates && data.candidates.length > 0) {
    return data.candidates[0].content.parts[0].text.trim();
  } else {
    throw new Error("Gemini returned no candidates.");
  }
}
