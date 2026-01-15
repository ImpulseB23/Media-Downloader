// Injected into the main world to capture page network requests
(function() {
  if (window.__mediaDownloaderInjected) return;
  window.__mediaDownloaderInjected = true;

  const MEDIA_EXT = /\.(mp4|webm|m3u8|mpd|mov|mkv|avi)(\?|$)/i;
  const VIDEO_URL_PATTERN = /https?:\/\/[^\s"'<>]+\.(mp4|webm|m3u8|mpd)(\?[^\s"'<>]*)?/gi;
  const reportedUrls = new Set();

  // Listen for clear message from content script (URL change)
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.type === 'MEDIA_DOWNLOADER_CLEAR') {
      reportedUrls.clear();
    }
  });

  // Intercept pushState/replaceState for SPA navigation detection
  const originalPushState = history.pushState;
  history.pushState = function(...args) {
    const result = originalPushState.apply(this, args);
    window.postMessage({ type: 'MEDIA_DOWNLOADER_URL_CHANGE', url: window.location.href }, '*');
    return result;
  };

  const originalReplaceState = history.replaceState;
  history.replaceState = function(...args) {
    const result = originalReplaceState.apply(this, args);
    window.postMessage({ type: 'MEDIA_DOWNLOADER_URL_CHANGE', url: window.location.href }, '*');
    return result;
  };

  function getMediaType(url) {
    if (!url) return null;
    const lower = url.toLowerCase();
    if (lower.includes('.m3u8')) return 'hls';
    if (lower.includes('.mpd')) return 'dash';
    if (MEDIA_EXT.test(lower)) return 'video';
    return null;
  }

  function resolveUrl(url) {
    if (!url || url.startsWith('blob:') || url.startsWith('data:')) return null;
    try { return new URL(url, window.location.href).href; } catch { return null; }
  }

  // Check if URL is a stream segment (useless on its own)
  function isSegment(url) {
    const path = url.toLowerCase().split('?')[0];
    // Only filter by extension - .ts and .m4s are segment files
    return path.endsWith('.ts') || path.endsWith('.m4s');
  }

  function reportMedia(url) {
    const resolved = resolveUrl(url);
    if (!resolved || reportedUrls.has(resolved)) return;
    // Skip HLS/DASH segments - they're useless without the playlist
    if (isSegment(resolved)) return;
    const type = getMediaType(resolved);
    if (!type) return;
    reportedUrls.add(resolved);
    window.postMessage({
      type: 'MEDIA_DOWNLOADER_FOUND',
      media: { url: resolved, type, filename: resolved.split('/').pop()?.split('?')[0] || 'media', size: null, timestamp: Date.now() }
    }, '*');
  }

  // Extract video URLs from text (JSON responses, scripts, etc.)
  function extractVideoUrls(text) {
    if (!text || text.length < 20 || text.length > 500000) return;
    VIDEO_URL_PATTERN.lastIndex = 0;
    let match;
    while ((match = VIDEO_URL_PATTERN.exec(text)) !== null) {
      let url = match[0].replace(/\\u002F/gi, '/').replace(/\\\//g, '/').replace(/['"\\,;\s]+$/, '');
      reportMedia(url);
    }
  }

  // Intercept Fetch
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const response = await originalFetch.apply(this, args);
    try {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
      if (url) reportMedia(url);
      // Parse JSON/text responses for video URLs
      const ct = response.headers?.get('content-type') || '';
      if (ct.includes('json') || ct.includes('text')) {
        response.clone().text().then(extractVideoUrls).catch(() => {});
      }
    } catch {}
    return response;
  };

  // Intercept XHR
  const originalXHROpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._mdUrl = url;
    return originalXHROpen.apply(this, [method, url, ...rest]);
  };

  const originalXHRSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function(...args) {
    this.addEventListener('load', () => {
      if (this._mdUrl) reportMedia(this._mdUrl);
      // Parse response for video URLs
      const ct = this.getResponseHeader('content-type') || '';
      if (ct.includes('json') || ct.includes('text')) {
        extractVideoUrls(this.responseText);
      }
    });
    return originalXHRSend.apply(this, args);
  };

  // Watch for video/audio src changes
  const srcDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
  if (srcDesc?.set) {
    Object.defineProperty(HTMLMediaElement.prototype, 'src', {
      get: srcDesc.get,
      set: function(v) { if (v) reportMedia(v); return srcDesc.set.call(this, v); },
      configurable: true
    });
  }

  // Watch for source elements
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      m.addedNodes.forEach((n) => {
        if (n.nodeType === 1) {
          if (n.tagName === 'SOURCE' && n.src) reportMedia(n.src);
          if (n.tagName === 'VIDEO' || n.tagName === 'AUDIO') {
            if (n.src) reportMedia(n.src);
            n.querySelectorAll('source').forEach(s => s.src && reportMedia(s.src));
          }
        }
      });
    });
  });

  if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  else document.addEventListener('DOMContentLoaded', () => observer.observe(document.body, { childList: true, subtree: true }));

  // Scan existing
  document.querySelectorAll('video, audio').forEach(el => {
    if (el.src) reportMedia(el.src);
    el.querySelectorAll('source').forEach(s => s.src && reportMedia(s.src));
  });

  window.postMessage({ type: 'MEDIA_DOWNLOADER_READY' }, '*');
})();
