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
  toast._timer = setTimeout(() => {
    toast.classList.remove('show');
  }, 3800);
}

// ── Scrape post data ────────────────────────────────────────────────────────

function scrapePostData(anchorElement) {
  const postContainer = anchorElement.closest('[data-urn]')
    || anchorElement.closest('.feed-shared-update-v2')
    || anchorElement.closest('.fie-impression-container')
    || anchorElement.closest('article')
    || anchorElement.closest('[data-id]');

  let postAuthor = '';
  let postText = '';
  let existingComments = [];

  if (postContainer) {
    const authorSelectors = [
      '.update-components-actor__name span[aria-hidden="true"]',
      '.feed-shared-actor__name span[aria-hidden="true"]',
      '.update-components-actor__title span[dir="ltr"]',
      'a.app-aware-link span.t-bold span[aria-hidden="true"]',
      'span.feed-shared-actor__name',
    ];
    for (const sel of authorSelectors) {
      const el = postContainer.querySelector(sel);
      if (el && el.innerText.trim()) { postAuthor = el.innerText.trim(); break; }
    }

    const textSelectors = [
      '.update-components-text',
      '.feed-shared-update-v2__description',
      '.feed-shared-text__text-view',
      '.break-words span[dir="ltr"]',
      'span[dir="ltr"].break-words',
    ];
    for (const sel of textSelectors) {
      const el = postContainer.querySelector(sel);
      if (el && el.innerText.trim()) { postText = el.innerText.trim(); break; }
    }

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
      if (index >= 10) return;
      let commenterName = '';
      let commentText = '';
      const nameNode = commentEl.querySelector('span[aria-hidden="true"], a.app-aware-link span[dir="ltr"]');
      if (nameNode) commenterName = nameNode.innerText.trim();
      const textNode = commentEl.querySelector('.comments-comment-item__main-content, .update-components-text, span[dir="ltr"]');
      if (textNode) commentText = textNode.innerText.trim();
      if (commentText) existingComments.push({ author: commenterName || `Commenter ${index + 1}`, text: commentText });
    });
  }

  return { postAuthor, postText, existingComments };
}

// ── Find comment boxes ──────────────────────────────────────────────────────

function findCommentBoxes() {
  const results = new Set();

  document.querySelectorAll('[contenteditable="true"]').forEach(el => {
    const placeholder = el.getAttribute('data-placeholder') || el.getAttribute('aria-placeholder') || el.getAttribute('aria-label') || '';
    if (placeholder.toLowerCase().includes('comment') || placeholder.toLowerCase().includes('add a')) {
      results.add(el);
    }
  });

  document.querySelectorAll('div[role="textbox"][contenteditable="true"]').forEach(el => {
    const parent = el.closest('.comments-comment-box, .comments-comment-texteditor, [class*="comment"]');
    if (parent) results.add(el);
  });

  document.querySelectorAll('[data-placeholder*="comment" i], [aria-placeholder*="comment" i], [placeholder*="comment" i]').forEach(el => {
    if (el.getAttribute('contenteditable') === 'true' || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') results.add(el);
  });

  document.querySelectorAll('.ql-editor[contenteditable="true"]').forEach(el => {
    const parent = el.closest('[class*="comment"]');
    if (parent) results.add(el);
  });

  document.querySelectorAll('[class*="comment"] [contenteditable="true"]').forEach(el => results.add(el));

  return Array.from(results);
}

// ── Insert generated text ───────────────────────────────────────────────────

function insertTextAtCursor(element, text) {
  element.focus();
  setTimeout(() => {
    const placeholder = element.querySelector('p[data-placeholder], p.ql-placeholder');
    if (placeholder) placeholder.textContent = '';

    const success = document.execCommand('insertText', false, text);

    if (!success) {
      const p = element.querySelector('p');
      if (p) { p.innerText = text; }
      else   { element.innerText = text; }
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }

    element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ' ' }));
  }, 100);
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
    btn.innerHTML = 'AI Comment';
    btn.type = 'button';

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const { postAuthor, postText, existingComments } = scrapePostData(box);

      const originalHTML = btn.innerHTML;
      btn.innerHTML = 'Generating...';
      btn.classList.add('loading');
      btn.disabled = true;

      chrome.runtime.sendMessage({
        action: 'generateComment',
        postAuthor,
        postText: postText || 'No post text could be scraped.',
        existingComments
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
          showToast('Comment generated' + note, 'success');
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