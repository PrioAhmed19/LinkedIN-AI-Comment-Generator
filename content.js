console.log('[AI Comment Generator] Content script loaded on:', window.location.href);

// ── Toast ───────────────────────────────────────────────────────────────────

function showToast(message, type = 'info') {
  let toast = document.getElementById('ai-gen-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'ai-gen-toast';
    document.body.appendChild(toast);
  }
  toast.className = type;
  toast.textContent = message;
  requestAnimationFrame(() => toast.classList.add('show'));
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 3800);
}

// ── Find post container ─────────────────────────────────────────────────────
// Walk up the DOM from the comment box until we find a post wrapper node

function findPostContainer(commentBox) {
  const CONTAINER_SELECTORS = [
    '[data-urn]',
    '.feed-shared-update-v2',
    '.fie-impression-container',
    '.occludable-update',
    '[data-id]',
    'article',
  ];

  let node = commentBox.parentElement;
  let depth = 0;

  while (node && depth < 30) {
    for (const sel of CONTAINER_SELECTORS) {
      if (node.matches && node.matches(sel)) return node;
    }
    node = node.parentElement;
    depth++;
  }

  // Fallback: first ancestor with substantial text content
  node = commentBox.parentElement;
  depth = 0;
  while (node && depth < 30) {
    if (node.innerText && node.innerText.trim().length > 100) return node;
    node = node.parentElement;
    depth++;
  }

  return null;
}

// ── Scrape post data ────────────────────────────────────────────────────────

function scrapePostData(commentBox) {
  const postContainer = findPostContainer(commentBox);

  let postAuthor       = '';
  let postText         = '';
  let existingComments = [];

  if (!postContainer) {
    console.warn('[AI Comment Generator] Could not find post container.');
    return { postAuthor, postText, existingComments };
  }

  // ── Author ────────────────────────────────────────────────────────────
  const authorSelectors = [
    '.update-components-actor__name span[aria-hidden="true"]',
    '.feed-shared-actor__name span[aria-hidden="true"]',
    '.update-components-actor__title span[dir="ltr"]',
    'a.app-aware-link span.t-bold span[aria-hidden="true"]',
    'span.feed-shared-actor__name',
    '[data-anonymize="person-name"]',
    '.comments-post-meta__name',
  ];
  for (const sel of authorSelectors) {
    const el = postContainer.querySelector(sel);
    if (el && el.innerText.trim()) { postAuthor = el.innerText.trim(); break; }
  }

  // ── Post text — try specific selectors first ──────────────────────────
  const textSelectors = [
    '.feed-shared-update-v2__description .update-components-text',
    '.update-components-text .update-components-text__text-view',
    '.update-components-text span[dir="ltr"]',
    '.feed-shared-update-v2__description span[dir="ltr"]',
    '.feed-shared-text__text-view span[dir="ltr"]',
    '.feed-shared-text span[dir="ltr"]',
    '.break-words span[dir="ltr"]',
    'span[dir="ltr"].break-words',
    'div[data-urn] span[dir="ltr"]',
    '.reader-article-content',
  ];

  for (const sel of textSelectors) {
    const elements = postContainer.querySelectorAll(sel);
    if (elements.length > 0) {
      const lines = [];
      elements.forEach(el => {
        const t = el.innerText.trim();
        if (t && !lines.includes(t)) lines.push(t);
      });
      if (lines.length > 0) {
        postText = lines.join('\n').trim();
        break;
      }
    }
  }

  // ── Fallback: clone the container, strip noise, extract remaining text ─
  if (!postText || postText.length < 20) {
    postText = extractFallbackText(postContainer);
  }

  // Trim to 3000 chars so we don't blow up the API request
  postText = postText.substring(0, 3000).trim();

  console.log('[AI Comment Generator] Post author:', postAuthor);
  console.log('[AI Comment Generator] Post text (' + postText.length + ' chars):', postText.substring(0, 300));

  // ── Existing comments (up to 5) ────────────────────────────────────────
  const commentSelectors = [
    '.comments-comment-item',
    '.comments-comment-entity',
    '.comments-comments-list__comment-item',
    'article[data-id*="comment"]',
  ];
  let commentElements = [];
  for (const sel of commentSelectors) {
    commentElements = postContainer.querySelectorAll(sel);
    if (commentElements.length > 0) break;
  }
  commentElements.forEach((commentEl, index) => {
    if (index >= 5) return;
    let commenterName = '';
    let commentText   = '';
    const nameNode = commentEl.querySelector('span[aria-hidden="true"], a.app-aware-link span[dir="ltr"]');
    if (nameNode) commenterName = nameNode.innerText.trim();
    const textNode = commentEl.querySelector('.comments-comment-item__main-content, .update-components-text, span[dir="ltr"]');
    if (textNode) commentText = textNode.innerText.trim();
    if (commentText) existingComments.push({ author: commenterName || `Commenter ${index + 1}`, text: commentText });
  });

  return { postAuthor, postText, existingComments };
}

// Clone container, strip UI chrome, return plain text
function extractFallbackText(container) {
  const clone = container.cloneNode(true);
  [
    '.comments-comments-list',
    '.feed-shared-social-action-bar',
    '.update-components-actor',
    '.feed-shared-actor',
    'button',
    'svg',
    'img',
    '.feed-shared-social-counts',
    '.social-details-social-counts',
    '.update-components-footer',
    '.comments-comment-box',
    '[class*="reaction"]',
  ].forEach(sel => clone.querySelectorAll(sel).forEach(el => el.remove()));

  return (clone.innerText || clone.textContent || '')
    .trim()
    .replace(/\n{3,}/g, '\n\n');
}

// ── Find comment boxes ──────────────────────────────────────────────────────

function findCommentBoxes() {
  const results = new Set();

  document.querySelectorAll('[contenteditable="true"]').forEach(el => {
    const ph = (
      el.getAttribute('data-placeholder') ||
      el.getAttribute('aria-placeholder') ||
      el.getAttribute('aria-label') || ''
    ).toLowerCase();
    if (ph.includes('comment') || ph.includes('add a') || ph.includes('reply')) {
      results.add(el);
    }
  });

  document.querySelectorAll('div[role="textbox"][contenteditable="true"]').forEach(el => {
    if (el.closest('.comments-comment-box, .comments-comment-texteditor, [class*="comment"]')) {
      results.add(el);
    }
  });

  document.querySelectorAll('[data-placeholder*="comment" i], [aria-placeholder*="comment" i]').forEach(el => {
    if (el.getAttribute('contenteditable') === 'true') results.add(el);
  });

  document.querySelectorAll('.ql-editor[contenteditable="true"]').forEach(el => {
    if (el.closest('[class*="comment"]')) results.add(el);
  });

  document.querySelectorAll('[class*="comment"] [contenteditable="true"]').forEach(el => results.add(el));

  return Array.from(results);
}

// ── Clear + insert text ─────────────────────────────────────────────────────

function clearCommentBox(element) {
  element.focus();
  document.execCommand('selectAll', false, null);
  document.execCommand('delete', false, null);
  if (element.innerText.trim() !== '') {
    const p = element.querySelector('p');
    if (p) p.innerText = '';
    else element.innerText = '';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

function insertTextAtCursor(element, text) {
  element.focus();
  setTimeout(() => {
    clearCommentBox(element);
    setTimeout(() => {
      const placeholder = element.querySelector('p[data-placeholder], p.ql-placeholder');
      if (placeholder) placeholder.textContent = '';

      const success = document.execCommand('insertText', false, text);
      if (!success) {
        const p = element.querySelector('p');
        if (p) p.innerText = text;
        else element.innerText = text;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      }
      element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ' ' }));
    }, 80);
  }, 100);
}

// ── Tone rotation ───────────────────────────────────────────────────────────

const VARIATION_TONES = [
  'insightful and thoughtful',
  'warm and encouraging',
  'curious and question-asking',
  'concise and punchy',
  'enthusiastic and energetic',
  'analytical and data-driven',
];

const clickCountMap = new WeakMap();
function getNextTone(btn) {
  const count = (clickCountMap.get(btn) || 0) + 1;
  clickCountMap.set(btn, count);
  return VARIATION_TONES[(count - 1) % VARIATION_TONES.length];
}

// ── Inject buttons ──────────────────────────────────────────────────────────

function injectButton() {
  const commentBoxes = findCommentBoxes();
  console.log(`[AI Comment Generator] Found ${commentBoxes.length} comment box(es)`);

  commentBoxes.forEach(box => {
    if (box.dataset.aiInjected === 'true') return;

    const wrapper = box.parentElement;
    if (!wrapper) return;
    if (wrapper.parentElement && wrapper.parentElement.querySelector('.ai-comment-btn-wrapper')) return;

    box.dataset.aiInjected = 'true';

    const btn = document.createElement('button');
    btn.className = 'ai-comment-btn';
    btn.innerHTML = '✨ AI Comment';
    btn.type = 'button';

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const { postAuthor, postText, existingComments } = scrapePostData(box);

      if (!postText || postText.length < 10) {
        showToast('⚠️ Could not read post text. Try clicking "See more" to expand the post first.', 'error');
        return;
      }

      const tone = getNextTone(btn);
      const originalHTML = btn.innerHTML;
      btn.innerHTML = '⏳ Generating...';
      btn.classList.add('loading');
      btn.disabled = true;

      chrome.runtime.sendMessage({
        action: 'generateComment',
        postAuthor,
        postText,
        existingComments,
        tone,
        variationSeed: Date.now(),
      }, (response) => {
        btn.innerHTML = originalHTML;
        btn.classList.remove('loading');
        btn.disabled = false;

        if (chrome.runtime.lastError) {
          showToast(chrome.runtime.lastError.message, 'error');
          return;
        }
        if (!response) {
          showToast('Background script did not respond. Reload the extension.', 'error');
          return;
        }
        if (response.error) {
          showToast(response.error, 'error');
          return;
        }
        if (response.comment) {
          insertTextAtCursor(box, response.comment);
          const note = response.fallback ? ` (via ${response.model})` : '';
          showToast(`✅ Comment generated (${tone})` + note, 'success');
        }
      });
    });

    const btnContainer = document.createElement('div');
    btnContainer.className = 'ai-comment-btn-wrapper';
    btnContainer.appendChild(btn);

    if (wrapper.nextSibling) {
      wrapper.parentElement.insertBefore(btnContainer, wrapper.nextSibling);
    } else {
      wrapper.parentElement.appendChild(btnContainer);
    }
  });
}

// ── Observer ────────────────────────────────────────────────────────────────

let debounceTimer = null;
const observer = new MutationObserver(() => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(injectButton, 500);
});

observer.observe(document.body, { childList: true, subtree: true });

setTimeout(injectButton, 1500);
setTimeout(injectButton, 4000);
setTimeout(injectButton, 9000);