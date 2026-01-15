// Media storage using chrome.storage.session for persistence across service worker sleep

// ============ LOGGING SYSTEM ============
// Industry-standard logging format for troubleshooting
// Format: [ISO_TIMESTAMP] [LEVEL] [SOURCE] MESSAGE {context}
// Levels: DEBUG < INFO < WARN < ERROR
const MAX_LOGS = 1000;
const LOG_VERSION = '1.0';

// Get session ID for log correlation
const SESSION_ID = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

async function log(level, source, message, context = {}) {
  const entry = {
    v: LOG_VERSION,                           // Log format version
    ts: new Date().toISOString(),             // ISO 8601 timestamp
    sid: SESSION_ID,                          // Session ID for correlation
    lvl: level.toUpperCase(),                 // Log level
    src: source,                              // Source component
    msg: message,                             // Human-readable message
    ctx: context                              // Contextual data (object, not string)
  };

  try {
    const result = await chrome.storage.local.get('extensionLogs');
    const logs = result.extensionLogs || [];
    logs.push(entry);

    // Keep only last MAX_LOGS entries (FIFO)
    while (logs.length > MAX_LOGS) {
      logs.shift();
    }

    await chrome.storage.local.set({ extensionLogs: logs });
  } catch (e) {
    console.error('[LOGGER] Failed to persist log:', e);
  }

  // Console output for DevTools debugging
  const consolePrefix = `[${entry.ts.split('T')[1].split('.')[0]}] [${entry.lvl}] [${source}]`;
  const hasContext = Object.keys(context).length > 0;

  if (level === 'error') {
    console.error(consolePrefix, message, hasContext ? context : '');
  } else if (level === 'warn') {
    console.warn(consolePrefix, message, hasContext ? context : '');
  } else if (level === 'debug') {
    console.debug(consolePrefix, message, hasContext ? context : '');
  } else {
    console.log(consolePrefix, message, hasContext ? context : '');
  }
}

// Convenience functions matching standard log levels
const logger = {
  debug: (source, msg, ctx) => log('debug', source, msg, ctx),
  info: (source, msg, ctx) => log('info', source, msg, ctx),
  warn: (source, msg, ctx) => log('warn', source, msg, ctx),
  error: (source, msg, ctx) => log('error', source, msg, ctx)
};

// ============ END LOGGING SYSTEM ============

// Track pending blob downloads to notify offscreen when complete
const pendingBlobDownloads = new Map();

// Listen for download completion to notify offscreen document
chrome.downloads.onChanged.addListener((delta) => {
  if (delta.state?.current === 'complete' || delta.state?.current === 'interrupted') {
    const blobId = pendingBlobDownloads.get(delta.id);
    if (blobId) {
      pendingBlobDownloads.delete(delta.id);
      // Notify offscreen to revoke blob URL
      chrome.runtime.sendMessage({
        action: 'downloadComplete',
        blobId: blobId,
        success: delta.state.current === 'complete'
      }).catch(() => {
        // Offscreen might be closed already
      });
    }
  }
});

// Offscreen document management
let creatingOffscreen = null;

async function ensureOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL('offscreen.html');

  // Check if already exists
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl]
  });

  if (existingContexts.length > 0) {
    return;
  }

  // Create if not exists (prevent race condition)
  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }

  creatingOffscreen = chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['BLOBS'], // Using BLOBS reason for blob URL creation and downloads
    justification: 'Processing HLS video streams and creating blob URLs for download'
  });

  await creatingOffscreen;
  creatingOffscreen = null;
}

// Store request headers for media URLs (needed for segment downloads)
const mediaHeaders = new Map();

// Capture request headers for HLS and media requests
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    if (details.tabId < 0) return;

    const url = details.url.toLowerCase();
    // Store headers for m3u8 and ts/mp4 segment requests
    if (url.includes('.m3u8') || url.includes('.ts') || url.includes('.m4s') || url.includes('segment')) {
      const headers = {};
      details.requestHeaders?.forEach(h => {
        const name = h.name.toLowerCase();
        if (name === 'referer' || name === 'cookie' || name === 'authorization' || name === 'origin') {
          headers[h.name] = h.value;
        }
      });

      // Store by base URL (without query params for matching)
      try {
        const urlObj = new URL(details.url);
        const baseUrl = urlObj.origin + urlObj.pathname.substring(0, urlObj.pathname.lastIndexOf('/') + 1);
        mediaHeaders.set(baseUrl, { headers, tabId: details.tabId, timestamp: Date.now() });

        // Also store the page referer for this tab
        const referer = details.requestHeaders?.find(h => h.name.toLowerCase() === 'referer')?.value;
        if (referer) {
          mediaHeaders.set(`tab_${details.tabId}_referer`, referer);
        }
      } catch (e) {
        // Ignore invalid URLs
      }
    }
  },
  { urls: ['<all_urls>'] },
  ['requestHeaders']
);

// Get stored headers for a URL
async function getHeadersForUrl(url, tabId) {
  try {
    const urlObj = new URL(url);
    const baseUrl = urlObj.origin + urlObj.pathname.substring(0, urlObj.pathname.lastIndexOf('/') + 1);

    // Try exact base URL match first
    let stored = mediaHeaders.get(baseUrl);
    if (stored?.headers) {
      return stored.headers;
    }

    // Fall back to tab's referer
    const referer = mediaHeaders.get(`tab_${tabId}_referer`);
    if (referer) {
      return { 'Referer': referer };
    }

    return {};
  } catch {
    return {};
  }
}

// Clean old headers periodically (older than 30 minutes)
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [key, value] of mediaHeaders.entries()) {
    if (typeof value === 'object' && value.timestamp && value.timestamp < cutoff) {
      mediaHeaders.delete(key);
    }
  }
}, 5 * 60 * 1000);

// Supported media types (comprehensive for mainstream sites)
const MEDIA_TYPES = {
  image: ['image/webp', 'image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/svg+xml', 'image/bmp', 'image/ico', 'image/avif'],
  video: [
    'video/mp4', 'video/webm', 'video/ogg', 'video/avi', 'video/mov', 'video/mkv',
    'video/x-flv', 'video/x-m4v', 'video/quicktime', 'video/x-msvideo',
    'video/3gpp', 'video/3gpp2', 'video/x-matroska',
    'application/octet-stream' // Often used for video downloads
  ],
  hls: ['application/vnd.apple.mpegurl', 'application/x-mpegurl', 'audio/mpegurl', 'audio/x-mpegurl'],
  dash: ['application/dash+xml', 'video/vnd.mpeg.dash.mpd']
};

const MEDIA_EXTENSIONS = {
  image: ['.webp', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.bmp', '.ico', '.avif'],
  video: ['.mp4', '.webm', '.ogg', '.avi', '.mov', '.mkv', '.m4v', '.flv', '.3gp'],
  hls: ['.m3u8', '.m3u'],
  dash: ['.mpd']
};

// Remove .ts and .m4s from video - they're segments, not standalone videos

// Parameters for image sizing/variants - remove for dedup
const SIZE_PARAMS = ['w', 'h', 'width', 'height', 'size', 'resize', 'quality', 'q', 'dpr', 'format'];

// Normalize URL for deduplication - strips size/format params
function normalizeUrlForDedup(url) {
  try {
    const urlObj = new URL(url);
    SIZE_PARAMS.forEach(param => urlObj.searchParams.delete(param));
    // Remove numeric-only params (often sizes like ?100, ?200x200)
    for (const [key, value] of [...urlObj.searchParams.entries()]) {
      if (/^\d+$/.test(key) || /^\d+x\d+$/.test(key) || /^\d+$/.test(value)) {
        urlObj.searchParams.delete(key);
      }
    }
    // Normalize common image size suffixes in path (e.g., image_100x100.jpg -> image.jpg)
    let pathname = urlObj.pathname;
    pathname = pathname.replace(/_\d+x\d+(\.[a-z]+)$/i, '$1');
    pathname = pathname.replace(/-\d+x\d+(\.[a-z]+)$/i, '$1');
    return urlObj.origin + pathname + (urlObj.search || '');
  } catch {
    return url;
  }
}

// Get media for a tab from storage
async function getTabMedia(tabId) {
  const key = `tab_${tabId}`;
  const result = await chrome.storage.session.get(key);
  return result[key] || {};
}

// Set media for a tab in storage
async function setTabMedia(tabId, mediaMap) {
  const key = `tab_${tabId}`;
  await chrome.storage.session.set({ [key]: mediaMap });
}

// Get media type from URL or content-type
function getMediaType(url, contentType = '') {
  const urlLower = url.toLowerCase();
  const ctLower = contentType.toLowerCase();
  const urlPath = urlLower.split('?')[0];

  // Check URL extension first (most reliable)
  for (const [type, extensions] of Object.entries(MEDIA_EXTENSIONS)) {
    if (extensions.some(ext => urlPath.endsWith(ext))) {
      return type;
    }
  }

  // Check content-type
  for (const [type, mimeTypes] of Object.entries(MEDIA_TYPES)) {
    if (mimeTypes.some(mime => ctLower.includes(mime))) {
      if (type === 'video' && ctLower.includes('application/octet-stream')) {
        // Only treat octet-stream as video if URL has video extension
        if (/\.(mp4|webm|mkv|m4v)(\?|$)/i.test(url)) return 'video';
        continue;
      }
      return type;
    }
  }

  // Additional HLS detection - some servers use unusual content types
  if (ctLower.includes('mpegurl') || ctLower.includes('m3u')) {
    return 'hls';
  }

  // Check for HLS-like URL patterns (playlist in path, etc.)
  if (urlPath.includes('/playlist') || urlPath.includes('/chunklist') || urlPath.includes('/index')) {
    if (ctLower.includes('text/') || ctLower === '' || ctLower.includes('octet-stream')) {
      // Could be HLS - check if response looks like m3u8 (this is a heuristic)
      // For now, we'll catch these in the content script via response parsing
    }
  }

  return null;
}

// Extract filename from URL
function getFilename(url) {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const filename = pathname.split('/').pop() || 'media';
    return filename.split('?')[0];
  } catch {
    return 'media';
  }
}

// Extract thumbnail URL from HLS stream URL (for video hosters like VOE)
function getThumbnailFromHlsUrl(hlsUrl) {
  try {
    // VOE pattern: edgeon-bandwidth.com CDN URLs contain video ID
    // Example: https://cdn-xxx.edgeon-bandwidth.com/engine/hls2/01/14818/k9hw1jdhim62_,n,.urlset/index
    const voeMatch = hlsUrl.match(/edgeon-bandwidth\.com\/.*?\/([a-z0-9]{10,})_/i);
    if (voeMatch) {
      return `https://preview.voe.sx/preview/${voeMatch[1]}.webp`;
    }

    // Vidoza pattern
    const vidozaMatch = hlsUrl.match(/vidoza\.net.*?\/([a-z0-9]+)\//i);
    if (vidozaMatch) {
      return `https://vidoza.net/images/${vidozaMatch[1]}.jpg`;
    }

    // Streamtape pattern
    const streamtapeMatch = hlsUrl.match(/streamtape\..*?\/([a-z0-9]+)\//i);
    if (streamtapeMatch) {
      return `https://thumb.tapecontent.net/${streamtapeMatch[1]}.jpg`;
    }

    return null;
  } catch {
    return null;
  }
}

// Add media item to store (avoiding duplicates, preferring larger files)
async function addMedia(tabId, mediaItem) {
  const store = await getTabMedia(tabId);
  const normalizedUrl = normalizeUrlForDedup(mediaItem.url);

  // Check if we already have this media (by normalized URL)
  let existingKey = null;
  let existingItem = null;

  for (const [key, item] of Object.entries(store)) {
    if (normalizeUrlForDedup(key) === normalizedUrl) {
      existingKey = key;
      existingItem = item;
      break;
    }
  }

  if (existingItem) {
    // Merge strategy: prefer larger size, but always preserve important properties
    const newSize = mediaItem.size || 0;
    const existingSize = existingItem.size || 0;

    // Create merged item - start with whichever has larger size
    let merged;
    if (newSize > existingSize) {
      merged = { ...mediaItem };
      // Preserve thumbnail from existing if new doesn't have one
      if (existingItem.thumbnail && !mediaItem.thumbnail) {
        merged.thumbnail = existingItem.thumbnail;
      }
    } else {
      merged = { ...existingItem };
      // Copy thumbnail from new if existing doesn't have one
      if (mediaItem.thumbnail && !existingItem.thumbnail) {
        merged.thumbnail = mediaItem.thumbnail;
      }
      // Also update timestamp to show it was recently seen
      merged.timestamp = mediaItem.timestamp || merged.timestamp;
    }

    // Update store with merged item
    delete store[existingKey];
    store[merged.url] = merged;
    await setTabMedia(tabId, store);
  } else {
    // New media, add it
    store[mediaItem.url] = mediaItem;
    await setTabMedia(tabId, store);
  }
}

// Check if URL is a stream segment (should not be stored - useless on its own)
function isStreamSegment(url) {
  const urlLower = url.toLowerCase().split('?')[0];
  // Only filter by extension - .ts and .m4s are segment files
  return urlLower.endsWith('.ts') || urlLower.endsWith('.m4s');
}

// Listen for web requests to detect media
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.tabId < 0) return;

    // Skip HLS/DASH segments - they're useless without the playlist
    if (isStreamSegment(details.url)) {
      return;
    }

    const contentType = details.responseHeaders?.find(
      h => h.name.toLowerCase() === 'content-type'
    )?.value || '';

    const contentLength = details.responseHeaders?.find(
      h => h.name.toLowerCase() === 'content-length'
    )?.value;

    const mediaType = getMediaType(details.url, contentType);

    if (mediaType) {
      // Get the page URL for this tab to associate with the media
      chrome.tabs.get(details.tabId, (tab) => {
        if (chrome.runtime.lastError || !tab) return;

        const mediaItem = {
          url: details.url,
          type: mediaType,
          filename: getFilename(details.url),
          size: contentLength ? parseInt(contentLength, 10) : null,
          contentType: contentType,
          timestamp: Date.now(),
          pageUrl: tab.url,
          pageTitle: tab.title
        };

        // For HLS streams, try to extract thumbnail from the CDN URL
        if (mediaType === 'hls' || details.url.includes('.m3u8')) {
          const thumbnail = getThumbnailFromHlsUrl(details.url);
          if (thumbnail) {
            mediaItem.thumbnail = thumbnail;
            logger.debug('background', 'HLS thumbnail extracted', {
              hlsUrl: details.url.slice(0, 80),
              thumbnail: thumbnail
            });
          }
        }

        addMedia(details.tabId, mediaItem);
      });
    }
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders']
);

// Clean up when tab is closed
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const key = `tab_${tabId}`;
  await chrome.storage.session.remove(key);
});

// Clear media when page navigates (refresh = new visit)
chrome.webNavigation.onCommitted.addListener(async (details) => {
  // Only for main frame, not iframes
  if (details.frameId === 0) {
    // Clear stored media for this tab on navigation
    await setTabMedia(details.tabId, {});
    logDebug('Tab media cleared on navigation', { tabId: details.tabId, url: details.url?.slice(0, 50) });
  }
}, { url: [{ schemes: ['http', 'https'] }] });

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getMedia') {
    getTabMedia(message.tabId).then(store => {
      sendResponse({ media: Object.values(store) });
    });
    return true;
  }

  if (message.action === 'addMedia') {
    const tabId = sender.tab?.id || message.tabId;
    if (tabId) {
      addMedia(tabId, message.media).then(() => sendResponse({ success: true }));
    } else {
      sendResponse({ success: false });
    }
    return true;
  }

  if (message.action === 'addMediaBatch') {
    const tabId = sender.tab?.id || message.tabId;
    if (tabId && message.mediaList) {
      Promise.all(message.mediaList.map(media => addMedia(tabId, media)))
        .then(() => sendResponse({ success: true }));
    } else {
      sendResponse({ success: false });
    }
    return true;
  }

  if (message.action === 'clearTabMedia') {
    const tabId = sender.tab?.id || message.tabId;
    if (tabId) {
      setTabMedia(tabId, {}).then(() => sendResponse({ success: true }));
    } else {
      sendResponse({ success: false });
    }
    return true;
  }

  if (message.action === 'flushLogs') {
    // Clear all logs
    debugLogs = [];
    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'downloadMedia') {
    chrome.downloads.download({
      url: message.url,
      filename: message.filename || undefined,
      saveAs: message.saveAs || false
    }, (downloadId) => {
      sendResponse({ success: true, downloadId });
    });
    return true;
  }

  if (message.action === 'downloadBlob') {
    // For HLS merged content - receive as data URL
    chrome.downloads.download({
      url: message.dataUrl,
      filename: message.filename || 'video.ts',
      saveAs: false
    }, (downloadId) => {
      sendResponse({ success: true, downloadId });
    });
    return true;
  }

  // HLS download via offscreen document
  if (message.action === 'startHLSDownload') {
    // Ignore if this came from offscreen (prevent loops)
    if (sender.url?.includes('offscreen.html')) {
      return false;
    }

    const tabId = message.tabId;
    logger.info('background', 'Starting HLS download', { url: message.url?.slice(0, 100), filename: message.filename, tabId });

    getHeadersForUrl(message.url, tabId).then(headers => {
      ensureOffscreenDocument().then(() => {
        logger.debug('background', 'Offscreen ready, forwarding download request');
        // Use unique action name for offscreen to prevent popup from receiving it
        chrome.runtime.sendMessage({
          action: 'offscreen_startHLSDownload',  // Unique action for offscreen only
          url: message.url,
          filename: message.filename,
          headers: headers
        }).then(response => {
          logger.info('background', 'HLS download started', { downloadId: response?.downloadId });
          sendResponse(response);
        }).catch(err => {
          logger.error('background', 'HLS download failed to start', { error: err.message });
          sendResponse({ error: err.message });
        });
      });
    });
    return true;
  }

  // Direct download via offscreen document (for sites that block direct downloads)
  if (message.action === 'startDirectDownload') {
    const tabId = message.tabId;
    getHeadersForUrl(message.url, tabId).then(headers => {
      ensureOffscreenDocument().then(() => {
        // Use unique action name for offscreen to prevent popup from receiving it
        chrome.runtime.sendMessage({
          action: 'offscreen_startDirectDownload',
          url: message.url,
          filename: message.filename,
          headers: headers,
          pageUrl: message.pageUrl
        }).then(response => {
          sendResponse(response);
        }).catch(err => {
          sendResponse({ error: err.message });
        });
      });
    });
    return true;
  }

  // Cancel download
  if (message.action === 'cancelHLSDownload') {
    ensureOffscreenDocument().then(() => {
      chrome.runtime.sendMessage({
        action: 'cancelHLSDownload',
        downloadId: message.downloadId
      }).then(response => {
        sendResponse(response);
      }).catch(err => {
        sendResponse({ error: err.message });
      });
    });
    return true;
  }

  // Get headers for a URL (used by offscreen document)
  if (message.action === 'getHeaders') {
    getHeadersForUrl(message.url, message.tabId).then(headers => {
      sendResponse({ headers });
    });
    return true;
  }

  // Download from offscreen document
  if (message.action === 'downloadFromOffscreen') {
    chrome.downloads.download({
      url: message.url,
      filename: message.filename || 'video.mp4',
      saveAs: false
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        console.error('Download failed:', chrome.runtime.lastError.message);
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
        return;
      }
      // Track this download to notify offscreen when complete
      if (downloadId && message.blobId) {
        pendingBlobDownloads.set(downloadId, message.blobId);
      }
      sendResponse({ success: true, downloadId });
    });
    return true;
  }

  // Forward HLS progress to popup
  if (message.action === 'hlsProgress') {
    // Just forward to any open popup
    return false;
  }

  // Get logs for export
  if (message.action === 'getLogs') {
    chrome.storage.local.get('extensionLogs').then(result => {
      sendResponse({ logs: result.extensionLogs || [] });
    });
    return true;
  }

  // Clear logs
  if (message.action === 'clearLogs') {
    chrome.storage.local.set({ extensionLogs: [] }).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  // Log from other contexts (popup, content script)
  if (message.action === 'log') {
    log(message.level || 'info', message.source || 'unknown', message.message, message.data);
    return false;
  }

  return false;
});

