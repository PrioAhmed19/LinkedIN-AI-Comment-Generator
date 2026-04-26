// ============================================================
// LinkedIn AI Comment Generator — Background Service Worker
// Receives post + comments context and calls Gemini API
// With automatic model fallback on quota errors
// ============================================================

// Fallback model order — tries these if the selected model hits quota
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

  const prompt = `You are an expert LinkedIn engagement assistant. Your job is to write a single, authentic comment that the user can post on a LinkedIn post.

CONTEXT:
${contextBlock}

INSTRUCTIONS:
- Read the post content carefully and understand the topic.
- Review the existing comments to understand the conversation so far.
- Write a comment that adds genuine value — an insight, a personal take, a follow-up question, or an agreement with a reason.
- Sound natural and human. Never sound robotic or generic.
- Keep it concise: 1-3 sentences (max ~50 words).
- Do NOT repeat what other commenters already said.
- Do NOT use hashtags, emojis, or cliché LinkedIn phrases like "Great post!" or "Couldn't agree more!".
- Do NOT add any prefix like "Here's a comment:" — output ONLY the comment text itself.`;

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
