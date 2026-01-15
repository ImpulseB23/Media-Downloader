// Content script for DOM scanning and bridging inject.js messages

// Inject the main world script to capture page network requests
function injectMainWorldScript() {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('inject.js');
  script.onload = function() {
    this.remove();
  };
  (document.head || document.documentElement).appendChild(script);
}

// Listen for messages from inject.js (main world)
window.addEventListener('message', (event) => {
  if (event.source !== window) return;

  if (event.data?.type === 'MEDIA_DOWNLOADER_FOUND') {
    chrome.runtime.sendMessage({
      action: 'addMedia',
      media: event.data.media
    }).catch(() => {});
  }
});

// Track already found URLs to avoid duplicates
const foundUrls = new Set();

// Track current URL for SPA navigation detection
let currentUrl = window.location.href;

const MEDIA_EXTENSIONS = {
  image: ['.webp', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.bmp', '.ico', '.avif'],
  video: ['.mp4', '.webm', '.ogg', '.avi', '.mov', '.mkv', '.m4v', '.flv', '.3gp'],
  hls: ['.m3u8', '.m3u'],
  dash: ['.mpd']
};

// Normalize URL for deduplication
function normalizeUrlForDedup(url) {
  try {
    const urlObj = new URL(url);
    // Remove common size parameters
    ['w', 'h', 'width', 'height', 'size', 'quality', 'q'].forEach(p => urlObj.searchParams.delete(p));
    return urlObj.origin + urlObj.pathname;
  } catch {
    return url;
  }
}

// Check if URL is already found (using normalized comparison)
function isUrlDuplicate(url) {
  const normalized = normalizeUrlForDedup(url);
  if (foundUrls.has(normalized)) {
    return true;
  }
  foundUrls.add(normalized);
  return false;
}

// Get media type from URL
function getMediaType(url) {
  const urlLower = url.toLowerCase().split('?')[0];

  for (const [type, extensions] of Object.entries(MEDIA_EXTENSIONS)) {
    if (extensions.some(ext => urlLower.endsWith(ext))) {
      return type;
    }
  }

  return null;
}

// Extract filename from URL
function getFilename(url) {
  try {
    const urlObj = new URL(url, window.location.href);
    const pathname = urlObj.pathname;
    const filename = pathname.split('/').pop() || 'media';
    return filename.split('?')[0];
  } catch {
    return 'media';
  }
}

// Resolve relative URL to absolute
function resolveUrl(url) {
  try {
    return new URL(url, window.location.href).href;
  } catch {
    return null;
  }
}

// Scan DOM for media elements
// Check if element is visible (has dimensions and not hidden)
function isVisible(el) {
  if (!el) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

// Minimum size for images to be considered content (not icons/tracking pixels)
const MIN_IMAGE_SIZE = 80;  // 80x80 pixels minimum

// Check if element is in viewport (visible on screen)
// Simple check: ANY part of the element overlapping with viewport counts
function isInViewport(el) {
  if (!el) return false;
  const rect = el.getBoundingClientRect();

  // Check if any part of the element overlaps with the viewport
  // No percentage requirements - if even 1px is visible, it counts
  return rect.bottom > 0 &&
         rect.top < window.innerHeight &&
         rect.right > 0 &&
         rect.left < window.innerWidth;
}

// Check if URL is likely junk (tracking pixel, icon, etc.)
function isJunkUrl(url) {
  if (!url) return true;
  if (url.startsWith('data:')) return true;

  const urlLower = url.toLowerCase();
  // Common tracking/junk patterns
  const junkPatterns = [
    '/pixel', '/beacon', '/track', '/analytics', '/1x1', 'spacer',
    '/icon/', '/emoji/', '/badge/', 'favicon',
    'facebook.com/tr', 'google-analytics', 'doubleclick',
    '.ico', 'base64,', 'transparent.', 'blank.'
  ];

  return junkPatterns.some(p => urlLower.includes(p));
}

// Extract image URL from various sources
function extractImageUrl(el) {
  // Direct src
  if (el.src && !el.src.startsWith('data:')) return el.src;

  // Lazy loading attributes
  const lazyAttrs = ['data-src', 'data-lazy-src', 'data-original', 'data-srcset', 'data-lazy'];
  for (const attr of lazyAttrs) {
    const val = el.getAttribute(attr);
    if (val && !val.startsWith('data:')) {
      // Handle srcset format (take first/largest)
      const firstUrl = val.split(',')[0].trim().split(' ')[0];
      return firstUrl;
    }
  }

  // Srcset - get largest image
  if (el.srcset) {
    const sources = el.srcset.split(',').map(s => s.trim());
    // Sort by size descriptor (e.g., "2x" or "800w") and get largest
    const sorted = sources.sort((a, b) => {
      const aSize = parseInt(a.match(/(\d+)[wx]/)?.[1] || '0');
      const bSize = parseInt(b.match(/(\d+)[wx]/)?.[1] || '0');
      return bSize - aSize;
    });
    if (sorted.length > 0) {
      return sorted[0].split(' ')[0];
    }
  }

  return null;
}

// Extract background image URL from element style
function extractBgImage(el) {
  const style = window.getComputedStyle(el);
  const bg = style.backgroundImage;
  if (bg && bg !== 'none') {
    const match = bg.match(/url\(["']?(.+?)["']?\)/);
    if (match && match[1] && !match[1].startsWith('data:')) {
      return match[1];
    }
  }
  return null;
}

// Scan DOM for media
// viewportOnly: if true, only return images visible in viewport (for display)
// if false, return all images (for download all)
function scanDOM(viewportOnly = true) {
  const mediaList = [];

  // Scan <img> elements
  document.querySelectorAll('img').forEach(img => {
    // For viewport-only mode, check if image is on screen
    if (viewportOnly && !isInViewport(img)) return;

    // Get image dimensions
    const rect = img.getBoundingClientRect();
    const width = Math.round(rect.width) || img.naturalWidth || 0;
    const height = Math.round(rect.height) || img.naturalHeight || 0;

    // Skip small images (likely icons/thumbnails)
    if (width < MIN_IMAGE_SIZE || height < MIN_IMAGE_SIZE) return;

    const url = extractImageUrl(img);
    if (url && !isJunkUrl(url)) {
      const resolved = resolveUrl(url);
      if (resolved && !isUrlDuplicate(resolved)) {
        mediaList.push({
          url: resolved,
          type: 'image',
          filename: getFilename(resolved),
          size: null,
          width: width,
          height: height,
          timestamp: Date.now()
        });
      }
    }
  });

  // Scan <picture> elements
  document.querySelectorAll('picture').forEach(picture => {
    if (viewportOnly && !isInViewport(picture)) return;

    const rect = picture.getBoundingClientRect();
    const width = Math.round(rect.width) || 0;
    const height = Math.round(rect.height) || 0;

    if (width < MIN_IMAGE_SIZE || height < MIN_IMAGE_SIZE) return;

    const source = picture.querySelector('source[srcset]');
    if (source?.srcset) {
      const url = source.srcset.split(',')[0].trim().split(' ')[0];
      if (isJunkUrl(url)) return;
      const resolved = resolveUrl(url);
      if (resolved && !isUrlDuplicate(resolved)) {
        mediaList.push({
          url: resolved,
          type: 'image',
          filename: getFilename(resolved),
          size: null,
          width: width,
          height: height,
          timestamp: Date.now()
        });
      }
    }
  });

  // Scan elements with background images
  document.querySelectorAll('[style*="background"], [class*="background"], [class*="cover"], [class*="thumbnail"], [class*="poster"]').forEach(el => {
    if (viewportOnly && !isInViewport(el)) return;
    if (!isVisible(el)) return;

    const rect = el.getBoundingClientRect();
    const width = Math.round(rect.width) || 0;
    const height = Math.round(rect.height) || 0;

    if (width < MIN_IMAGE_SIZE || height < MIN_IMAGE_SIZE) return;

    const bgUrl = extractBgImage(el);
    if (bgUrl && !isJunkUrl(bgUrl)) {
      const resolved = resolveUrl(bgUrl);
      if (resolved && !isUrlDuplicate(resolved)) {
        mediaList.push({
          url: resolved,
          type: 'image',
          filename: getFilename(resolved),
          size: null,
          width: width,
          height: height,
          timestamp: Date.now()
        });
      }
    }
  });

  // Scan <video> elements (always include - they're important)
  document.querySelectorAll('video').forEach(video => {
    const src = video.src || video.dataset.src;
    if (src) {
      const url = resolveUrl(src);
      if (url && !isUrlDuplicate(url)) {
        mediaList.push({ url, type: getMediaType(url) || 'video', filename: getFilename(url), size: null, timestamp: Date.now() });
      }
    }
    video.querySelectorAll('source').forEach(source => {
      if (source.src) {
        const url = resolveUrl(source.src);
        if (url && !isUrlDuplicate(url)) {
          mediaList.push({ url, type: getMediaType(url) || 'video', filename: getFilename(url), size: null, timestamp: Date.now() });
        }
      }
    });
  });

  return mediaList;
}

// Fresh scan for popup display - uses local dedup set instead of global foundUrls
// This ensures we get current viewport contents, not filtered by previous scans
function scanDOMFresh(viewportOnly = true) {
  const mediaList = [];
  const localFoundUrls = new Set();  // Local dedup - doesn't affect global state

  function isLocalDuplicate(url) {
    const normalized = normalizeUrlForDedup(url);
    if (localFoundUrls.has(normalized)) return true;
    localFoundUrls.add(normalized);
    return false;
  }

  // Scan <img> elements
  document.querySelectorAll('img').forEach(img => {
    if (viewportOnly && !isInViewport(img)) return;

    const rect = img.getBoundingClientRect();
    const width = Math.round(rect.width) || img.naturalWidth || 0;
    const height = Math.round(rect.height) || img.naturalHeight || 0;

    if (width < MIN_IMAGE_SIZE || height < MIN_IMAGE_SIZE) return;

    const url = extractImageUrl(img);
    if (url && !isJunkUrl(url)) {
      const resolved = resolveUrl(url);
      if (resolved && !isLocalDuplicate(resolved)) {
        mediaList.push({
          url: resolved,
          type: 'image',
          filename: getFilename(resolved),
          size: null,
          width: width,
          height: height,
          timestamp: Date.now()
        });
      }
    }
  });

  // Scan <picture> elements
  document.querySelectorAll('picture').forEach(picture => {
    if (viewportOnly && !isInViewport(picture)) return;

    const rect = picture.getBoundingClientRect();
    const width = Math.round(rect.width) || 0;
    const height = Math.round(rect.height) || 0;

    if (width < MIN_IMAGE_SIZE || height < MIN_IMAGE_SIZE) return;

    const source = picture.querySelector('source[srcset]');
    if (source?.srcset) {
      const url = source.srcset.split(',')[0].trim().split(' ')[0];
      if (isJunkUrl(url)) return;
      const resolved = resolveUrl(url);
      if (resolved && !isLocalDuplicate(resolved)) {
        mediaList.push({
          url: resolved,
          type: 'image',
          filename: getFilename(resolved),
          size: null,
          width: width,
          height: height,
          timestamp: Date.now()
        });
      }
    }
  });

  // Scan elements with background images
  document.querySelectorAll('[style*="background"], [class*="background"], [class*="cover"], [class*="thumbnail"], [class*="poster"]').forEach(el => {
    if (viewportOnly && !isInViewport(el)) return;
    if (!isVisible(el)) return;

    const rect = el.getBoundingClientRect();
    const width = Math.round(rect.width) || 0;
    const height = Math.round(rect.height) || 0;

    if (width < MIN_IMAGE_SIZE || height < MIN_IMAGE_SIZE) return;

    const bgUrl = extractBgImage(el);
    if (bgUrl && !isJunkUrl(bgUrl)) {
      const resolved = resolveUrl(bgUrl);
      if (resolved && !isLocalDuplicate(resolved)) {
        mediaList.push({
          url: resolved,
          type: 'image',
          filename: getFilename(resolved),
          size: null,
          width: width,
          height: height,
          timestamp: Date.now()
        });
      }
    }
  });

  // Scan <video> elements (always include)
  document.querySelectorAll('video').forEach(video => {
    const src = video.src || video.dataset.src;
    if (src) {
      const url = resolveUrl(src);
      if (url && !isLocalDuplicate(url)) {
        mediaList.push({ url, type: getMediaType(url) || 'video', filename: getFilename(url), size: null, timestamp: Date.now() });
      }
    }
    video.querySelectorAll('source').forEach(source => {
      if (source.src) {
        const url = resolveUrl(source.src);
        if (url && !isLocalDuplicate(url)) {
          mediaList.push({ url, type: getMediaType(url) || 'video', filename: getFilename(url), size: null, timestamp: Date.now() });
        }
      }
    });
  });

  return mediaList;
}

// MutationObserver to detect dynamically added media
function observeDOM() {
  const observer = new MutationObserver((mutations) => {
    let hasNewMedia = false;

    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.tagName === 'IMG' || node.tagName === 'VIDEO' || node.tagName === 'AUDIO') {
            hasNewMedia = true;
          }
          if (node.querySelectorAll) {
            const mediaElements = node.querySelectorAll('img, video, audio, source');
            if (mediaElements.length > 0) {
              hasNewMedia = true;
            }
          }
        }
      });
    });

    if (hasNewMedia) {
      // Debounce scanning
      clearTimeout(window._mediaScanTimeout);
      window._mediaScanTimeout = setTimeout(() => {
        const newMedia = scanDOM();
        if (newMedia.length > 0) {
          chrome.runtime.sendMessage({
            action: 'addMediaBatch',
            mediaList: newMedia
          });
        }
      }, 500);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Get YouTube video ID from URL
function getYouTubeVideoId(url) {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

// Find thumbnail for a specific video element by traversing DOM
function findThumbnailForVideo(videoEl) {
  if (!videoEl) return null;

  // 1. Check video's poster attribute first
  if (videoEl.poster && !videoEl.poster.includes('data:')) {
    return videoEl.poster;
  }

  // 2. Traverse up to find the player container
  // Common player container patterns
  const containerSelectors = [
    'div[class*="player"]',
    'div[class*="video"]',
    'div[class*="media"]',
    '.player',
    '.video-container',
    '.video-wrapper',
    '.jw-wrapper',        // JW Player
    '.plyr',              // Plyr
    '.vjs-poster',        // Video.js
    '.flowplayer',        // Flowplayer
    '.mejs__container',   // MediaElement.js
    '[data-player]',
    '[data-video]'
  ];

  let container = null;
  for (const selector of containerSelectors) {
    container = videoEl.closest(selector);
    if (container) break;
  }

  // Fallback to parent elements (up to 5 levels)
  if (!container) {
    container = videoEl.parentElement;
    for (let i = 0; i < 5 && container; i++) {
      // Stop if we find a likely container
      const classes = container.className?.toLowerCase() || '';
      if (classes.includes('player') || classes.includes('video') || classes.includes('media')) {
        break;
      }
      container = container.parentElement;
    }
  }

  if (!container) container = videoEl.parentElement;

  // 3. Look for images within the container
  if (container) {
    // Check for poster/thumbnail specific elements first
    const posterSelectors = [
      'img[class*="poster"]',
      'img[class*="thumbnail"]',
      'img[class*="cover"]',
      'img[class*="preview"]',
      '.poster img',
      '.thumbnail img',
      '.cover img',
      '.preview img',
      '[class*="poster"] img',
      '[class*="thumbnail"] img'
    ];

    for (const selector of posterSelectors) {
      const img = container.querySelector(selector);
      if (img) {
        const src = img.src || img.dataset.src || img.dataset.lazySrc;
        if (src && !src.includes('data:')) {
          return src;
        }
      }
    }

    // Check for background-image on container or children
    const bgElements = [container, ...container.querySelectorAll('[style*="background"]')];
    for (const el of bgElements) {
      const bgImage = window.getComputedStyle(el).backgroundImage;
      if (bgImage && bgImage !== 'none') {
        const match = bgImage.match(/url\(["']?(.+?)["']?\)/);
        if (match?.[1] && !match[1].includes('data:')) {
          return match[1];
        }
      }
    }

    // Look for any reasonably sized image in the container
    const images = container.querySelectorAll('img');
    for (const img of images) {
      const rect = img.getBoundingClientRect();
      // Must be reasonably sized (not an icon)
      if ((rect.width >= 100 || img.naturalWidth >= 100) && img.src && !img.src.includes('data:')) {
        // Skip obvious non-thumbnails
        const srcLower = img.src.toLowerCase();
        if (!srcLower.includes('logo') && !srcLower.includes('icon') && !srcLower.includes('button')) {
          return img.src;
        }
      }
    }
  }

  return null;
}

// Find thumbnail near an iframe (for embedded video players)
function findThumbnailForIframe(iframe) {
  if (!iframe) return null;

  // Look for container around the iframe
  const containerSelectors = [
    'div[class*="player"]',
    'div[class*="video"]',
    'div[class*="stream"]',
    'div[class*="embed"]',
    '.player-container',
    '.video-container',
    '[class*="wrapper"]'
  ];

  let container = null;
  for (const selector of containerSelectors) {
    container = iframe.closest(selector);
    if (container) break;
  }

  // Fallback to parent elements
  if (!container) {
    container = iframe.parentElement;
    for (let i = 0; i < 5 && container; i++) {
      const classes = container.className?.toLowerCase() || '';
      if (classes.includes('player') || classes.includes('video') || classes.includes('stream')) {
        break;
      }
      container = container.parentElement;
    }
  }

  if (!container) container = iframe.parentElement?.parentElement || iframe.parentElement;

  if (container) {
    // Look for images with poster/thumbnail keywords
    const posterSelectors = [
      'img[class*="poster"]',
      'img[class*="thumbnail"]',
      'img[class*="cover"]',
      'img[class*="preview"]',
      '.poster img',
      '.thumbnail img',
      '.cover img'
    ];

    for (const selector of posterSelectors) {
      const img = container.querySelector(selector);
      if (img) {
        const src = img.src || img.dataset.src || img.dataset.lazySrc;
        if (src && !src.includes('data:')) {
          return src;
        }
      }
    }

    // Check background images
    const bgElements = container.querySelectorAll('[style*="background"]');
    for (const el of bgElements) {
      const bgImage = window.getComputedStyle(el).backgroundImage;
      if (bgImage && bgImage !== 'none') {
        const match = bgImage.match(/url\(["']?(.+?)["']?\)/);
        if (match?.[1] && !match[1].includes('data:')) {
          return match[1];
        }
      }
    }

    // Look for large images near the iframe
    const images = container.querySelectorAll('img');
    for (const img of images) {
      const rect = img.getBoundingClientRect();
      if ((rect.width >= 150 || img.naturalWidth >= 150) && img.src && !img.src.includes('data:')) {
        const srcLower = img.src.toLowerCase();
        if (!srcLower.includes('logo') && !srcLower.includes('icon') && !srcLower.includes('ad')) {
          return img.src;
        }
      }
    }
  }

  return null;
}

// Get video thumbnails - maps video URLs to their thumbnails
function getVideoThumbnail() {
  const result = { default: null, videos: {}, debug: [] };

  // YouTube thumbnail (special case - use API)
  const host = window.location.hostname;
  if (host.includes('youtube.com') || host.includes('youtu.be')) {
    const videoId = getYouTubeVideoId(window.location.href);
    if (videoId) {
      result.default = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
      result.debug.push('YouTube detected, using API thumbnail');
      return result;
    }
  }

  // Find ALL video elements and map them to thumbnails
  const videoElements = document.querySelectorAll('video');
  result.debug.push(`Found ${videoElements.length} video elements`);

  videoElements.forEach(videoEl => {
    const videoSrc = videoEl.src || videoEl.querySelector('source')?.src;
    if (videoSrc) {
      const thumbnail = findThumbnailForVideo(videoEl);
      if (thumbnail) {
        result.videos[videoSrc] = thumbnail;
        result.debug.push(`Video element thumbnail found: ${thumbnail.substring(0, 80)}...`);
        if (!result.default) {
          result.default = thumbnail;
        }
      }
    }
  });

  // If we found video-specific thumbnails, we're done
  if (Object.keys(result.videos).length > 0 && result.default) {
    result.debug.push('Using video element thumbnail');
    return result;
  }

  // Look for iframes that might be video players
  const iframes = document.querySelectorAll('iframe');
  result.debug.push(`Found ${iframes.length} iframes`);

  for (const iframe of iframes) {
    const src = iframe.src?.toLowerCase() || '';
    // Check if iframe looks like a video player
    if (src.includes('player') || src.includes('video') || src.includes('embed') ||
        src.includes('stream') || src.includes('voe.') || src.includes('vidoza') ||
        src.includes('streamtape') || src.includes('dood') || iframe.width > 400) {
      result.debug.push(`Checking video iframe: ${src.substring(0, 60)}...`);
      const thumbnail = findThumbnailForIframe(iframe);
      if (thumbnail) {
        result.default = thumbnail;
        result.debug.push(`Iframe thumbnail found: ${thumbnail.substring(0, 80)}...`);
        break;
      } else {
        result.debug.push('No thumbnail found near iframe');
      }
    }
  }

  if (result.default) {
    return result;
  }

  // Look for series/show poster images FIRST (before og:image which is often generic)
  // Common on streaming sites like s.to, bs.to, etc.
  const posterSelectors = [
    // Specific streaming site selectors
    '.seriesCoverBox img',
    '.series-cover img',
    '.serie-cover img',
    '.show-cover img',
    '.movie-cover img',
    '.episode-cover img',
    // Generic poster/cover selectors
    '.poster img',
    '.cover img',
    '.thumb img',
    '.thumbnail img',
    // Class contains patterns
    'img[class*="serie"]',
    'img[class*="show"]',
    'img[class*="movie"]',
    'img[class*="poster"]',
    'img[class*="cover"]',
    // Container contains patterns
    '[class*="serie"] img',
    '[class*="cover"] img',
    '[class*="poster"] img',
    // Data attribute patterns (lazy loaded)
    'img[data-src*="cover"]',
    'img[data-src*="poster"]',
    // Common content containers
    '.content-left img',
    '.sidebar img:first-of-type',
    'aside img:first-of-type'
  ];

  for (const selector of posterSelectors) {
    const img = document.querySelector(selector);
    if (img) {
      const src = img.src || img.dataset.src;
      if (src && !src.includes('data:')) {
        result.default = src;
        result.debug.push(`Using poster selector "${selector}": ${src.substring(0, 80)}...`);
        return result;
      }
    }
  }

  // Try og:image meta tag - but only if it's not a generic site image
  const ogImage = document.querySelector('meta[property="og:image"]');
  if (ogImage?.content) {
    const ogUrl = ogImage.content.toLowerCase();
    // Skip generic site images (facebook.jpg, logo, etc.)
    if (!ogUrl.includes('facebook') && !ogUrl.includes('logo') &&
        !ogUrl.includes('default') && !ogUrl.includes('placeholder')) {
      result.default = ogImage.content;
      result.debug.push(`Using og:image: ${ogImage.content.substring(0, 80)}...`);
      return result;
    } else {
      result.debug.push(`Skipped generic og:image: ${ogImage.content.substring(0, 50)}...`);
    }
  }

  // Try twitter:image meta tag
  const twitterImage = document.querySelector('meta[name="twitter:image"], meta[property="twitter:image"]');
  if (twitterImage?.content) {
    const twUrl = twitterImage.content.toLowerCase();
    if (!twUrl.includes('facebook') && !twUrl.includes('logo') &&
        !twUrl.includes('default') && !twUrl.includes('placeholder')) {
      result.default = twitterImage.content;
      result.debug.push(`Using twitter:image: ${twitterImage.content.substring(0, 80)}...`);
      return result;
    }
  }

  // Last resort: find the largest image on the page that could be a poster
  // Prioritize images with video-like aspect ratios
  let bestImage = null;
  let bestScore = 0;
  const largeImages = document.querySelectorAll('img');

  for (const img of largeImages) {
    const rect = img.getBoundingClientRect();
    if (rect.width < 200 || rect.height < 100) continue;

    const src = img.src || img.dataset.src;
    if (!src || src.includes('data:')) continue;

    const srcLower = src.toLowerCase();
    if (srcLower.includes('logo') || srcLower.includes('banner') ||
        srcLower.includes('ad') || srcLower.includes('icon') ||
        srcLower.includes('avatar') || srcLower.includes('profile')) {
      continue;
    }

    // Score based on size and aspect ratio
    let score = rect.width * rect.height;
    const ratio = rect.width / rect.height;
    if (ratio >= 1.5 && ratio <= 2.0) {
      score *= 2; // Video-like aspect ratio bonus
    }
    if (srcLower.includes('thumb') || srcLower.includes('poster') || srcLower.includes('cover')) {
      score *= 3; // Keyword bonus
    }

    if (score > bestScore) {
      bestScore = score;
      bestImage = src;
    }
  }

  if (bestImage) {
    result.default = bestImage;
    result.debug.push(`Using best scored image: ${bestImage.substring(0, 80)}...`);
  } else {
    result.debug.push('No suitable thumbnail found');
  }

  return result;
}

// Listen for scan requests from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'scanPage') {
    // For popup display, we need FRESH results of what's currently visible
    // Don't use the global foundUrls - that's for preventing duplicate sends to background
    const viewportOnly = message.viewportOnly !== false;
    const media = scanDOMFresh(viewportOnly);
    sendResponse({ media });
    return true;
  }

  if (message.action === 'scanAllMedia') {
    // Scan ALL media on page (for download all) - fresh results
    const media = scanDOMFresh(false);
    sendResponse({ media });
    return true;
  }

  if (message.action === 'clearAndRescan') {
    // Clear URL cache and rescan page - used by refresh button
    foundUrls.clear();
    currentUrl = window.location.href;
    const media = scanDOM(message.viewportOnly !== false);
    // Send to background
    if (media.length > 0) {
      chrome.runtime.sendMessage({ action: 'addMediaBatch', mediaList: media }).catch(() => {});
    }
    sendResponse({ success: true, mediaCount: media.length });
    return true;
  }

  if (message.action === 'getThumbnail') {
    const thumbnail = getVideoThumbnail();
    sendResponse({ thumbnail });
    return true;
  }

  return false;
});

// Handle URL change - clear and rescan
function handleUrlChange(newUrl) {
  if (newUrl === currentUrl) return;
  console.log('[MediaDownloader] URL changed:', currentUrl, '->', newUrl);
  currentUrl = newUrl;
  foundUrls.clear();
  window.postMessage({ type: 'MEDIA_DOWNLOADER_CLEAR' }, '*');
  chrome.runtime.sendMessage({ action: 'clearTabMedia' }).catch(() => {});

  clearTimeout(window._urlChangeScanTimeout);
  window._urlChangeScanTimeout = setTimeout(() => {
    const newMedia = scanDOM();
    if (newMedia.length > 0) {
      chrome.runtime.sendMessage({ action: 'addMediaBatch', mediaList: newMedia }).catch(() => {});
    }
  }, 1000);
}

// Set up SPA navigation detection
function setupSPADetection() {
  // Listen for popstate (browser back/forward)
  window.addEventListener('popstate', () => {
    handleUrlChange(window.location.href);
  });

  // Listen for URL changes from inject.js (pushState/replaceState)
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.type === 'MEDIA_DOWNLOADER_URL_CHANGE') {
      handleUrlChange(event.data.url);
    }
  });

  // Also poll URL changes as fallback (some sites modify URL in unusual ways)
  let lastCheckedUrl = window.location.href;
  setInterval(() => {
    const newUrl = window.location.href;
    if (newUrl !== lastCheckedUrl) {
      lastCheckedUrl = newUrl;
      handleUrlChange(newUrl);
    }
  }, 1000);
}

// Initialize
function init() {
  setupSPADetection();
  try { injectMainWorldScript(); } catch {}

  const initialMedia = scanDOM();
  if (initialMedia.length > 0) {
    chrome.runtime.sendMessage({ action: 'addMediaBatch', mediaList: initialMedia }).catch(() => {});
  }

  if (document.body) {
    observeDOM();
  } else {
    document.addEventListener('DOMContentLoaded', () => observeDOM());
  }
}

init();
