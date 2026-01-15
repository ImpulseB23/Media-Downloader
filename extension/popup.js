// Popup script for Media Downloader
// VERSION: 2026-01-15-v2 (thumbnail fix)
console.log('[MediaDownloader] Popup v2 loaded');

let allMedia = [];
let currentFilter = 'all';
let pageTitle = '';
let pageUrl = '';
let currentTabId = null;
let selectedUrls = new Set(); // Track selected media URLs
let isDownloading = false; // Track if a download is in progress

// Default settings
const DEFAULT_SETTINGS = {
  autoRefresh: true,
  zipDownloads: true,
  skipSmallImages: true,
  sortOrder: 'largest',      // 'newest', 'largest', 'type', 'name'
  saveAs: false,             // Prompt for save location
  useTitle: false,           // Include page title in filenames
  cleanNames: true,          // Clean up filenames
  minSize: 80,               // Minimum image size in pixels
  hideDupes: true            // Hide duplicate images
};

let settings = { ...DEFAULT_SETTINGS };

// Platform icons for restriction notices (white versions)
const PLATFORM_ICONS = {
  'YouTube': `<svg width="16" height="16" viewBox="0 0 24 24" fill="#ffffff"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,
  'Instagram': `<svg width="16" height="16" viewBox="0 0 24 24" fill="#ffffff"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>`,
  'TikTok': `<svg width="16" height="16" viewBox="0 0 24 24" fill="#ffffff"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/></svg>`,
  'Dailymotion': `<svg width="16" height="16" viewBox="0 0 24 24" fill="#ffffff"><path d="M12.036 0C5.384 0 0 5.384 0 12.036c0 6.651 5.384 12.035 12.036 12.035 6.651 0 12.035-5.384 12.035-12.035C24.071 5.384 18.687 0 12.036 0zm3.458 14.676c-.865 1.476-2.342 2.292-4.215 2.292-2.573 0-4.465-1.916-4.465-4.565 0-2.573 1.816-4.565 4.315-4.565 1.923 0 3.4.816 4.265 2.342l.15.25v-2.342c0-.2.15-.35.35-.35h1.966c.2 0 .35.15.35.35v8.478c0 .2-.15.35-.35.35h-1.966c-.2 0-.35-.15-.35-.35v-.24l-.05-.1-.05-.1zm-4.065.476c1.316 0 2.342-1.026 2.342-2.442 0-1.366-.976-2.392-2.292-2.392-1.316 0-2.342 1.026-2.342 2.442 0 1.366.976 2.392 2.292 2.392z"/></svg>`,
  'VK': `<svg width="16" height="16" viewBox="0 0 24 24" fill="#ffffff"><path d="M15.684 0H8.316C1.592 0 0 1.592 0 8.316v7.368C0 22.408 1.592 24 8.316 24h7.368C22.408 24 24 22.408 24 15.684V8.316C24 1.592 22.391 0 15.684 0z"/></svg>`,
  'Twitter': `<svg width="16" height="16" viewBox="0 0 24 24" fill="#ffffff"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
  'Facebook': `<svg width="16" height="16" viewBox="0 0 24 24" fill="#ffffff"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`
};

// Load settings from storage
async function loadSettings() {
  try {
    const result = await chrome.storage.local.get('mediaDownloaderSettings');
    if (result.mediaDownloaderSettings) {
      settings = { ...DEFAULT_SETTINGS, ...result.mediaDownloaderSettings };
    }
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
  applySettingsToUI();
}

// Save settings to storage
async function saveSettings() {
  try {
    await chrome.storage.local.set({ mediaDownloaderSettings: settings });
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
}

// Apply settings to UI toggles
function applySettingsToUI() {
  // Display settings
  const autoRefreshEl = document.getElementById('setting-auto-refresh');
  const sortOrderEl = document.getElementById('setting-sort-order');

  // Download settings
  const zipDownloadsEl = document.getElementById('setting-zip-downloads');
  const saveAsEl = document.getElementById('setting-save-as');

  // Filename settings
  const useTitleEl = document.getElementById('setting-use-title');
  const cleanNamesEl = document.getElementById('setting-clean-names');

  // Filtering settings
  const skipSmallEl = document.getElementById('setting-skip-small');
  const minSizeEl = document.getElementById('setting-min-size');
  const minSizeValueEl = document.getElementById('min-size-value');
  const hideDupesEl = document.getElementById('setting-hide-dupes');

  // Apply values
  if (autoRefreshEl) autoRefreshEl.checked = settings.autoRefresh;
  if (sortOrderEl) sortOrderEl.value = settings.sortOrder;
  if (zipDownloadsEl) zipDownloadsEl.checked = settings.zipDownloads;
  if (saveAsEl) saveAsEl.checked = settings.saveAs;
  if (useTitleEl) useTitleEl.checked = settings.useTitle;
  if (cleanNamesEl) cleanNamesEl.checked = settings.cleanNames;
  if (skipSmallEl) skipSmallEl.checked = settings.skipSmallImages;
  if (minSizeEl) minSizeEl.value = settings.minSize;
  if (minSizeValueEl) minSizeValueEl.textContent = settings.minSize;
  if (hideDupesEl) hideDupesEl.checked = settings.hideDupes;
}

// Save popup state per tab
async function savePopupState() {
  if (!currentTabId) return;
  await chrome.storage.session.set({
    [`popup_state_${currentTabId}`]: {
      filter: currentFilter
    }
  });
}

// Load popup state for current tab
async function loadPopupState(tabId) {
  const result = await chrome.storage.session.get(`popup_state_${tabId}`);
  const state = result[`popup_state_${tabId}`];
  if (state) {
    currentFilter = state.filter || 'all';

    // Update UI to reflect loaded state
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === currentFilter);
    });
  }
}

// Normalize URL for deduplication - more aggressive to catch image variants
function normalizeUrlForDedup(url) {
  try {
    const urlObj = new URL(url);

    // Remove ALL common size/format parameters
    const sizeParams = ['w', 'h', 'width', 'height', 'size', 'resize', 'quality', 'q', 'dpr', 'format', 's', 'sz', 'fit', 'crop', 'auto'];
    sizeParams.forEach(p => urlObj.searchParams.delete(p));

    // Remove numeric-only params (often sizes like ?100, ?200x200)
    for (const [key, value] of [...urlObj.searchParams.entries()]) {
      if (/^\d+$/.test(key) || /^\d+x\d+$/.test(key) || /^\d+$/.test(value)) {
        urlObj.searchParams.delete(key);
      }
    }

    // Normalize common image size suffixes in path
    let pathname = urlObj.pathname;
    pathname = pathname.replace(/_\d+x\d+(\.[a-z]+)$/i, '$1');    // image_100x100.jpg -> image.jpg
    pathname = pathname.replace(/-\d+x\d+(\.[a-z]+)$/i, '$1');    // image-100x100.jpg -> image.jpg
    pathname = pathname.replace(/@\d+x(\.[a-z]+)$/i, '$1');       // image@2x.jpg -> image.jpg
    pathname = pathname.replace(/_\d+w(\.[a-z]+)$/i, '$1');       // image_800w.jpg -> image.jpg
    pathname = pathname.replace(/\/\d+x\d+\//g, '/');             // /100x100/ -> /

    // Normalize HLS CDN URLs - dedupe by video ID, ignoring CDN hostname
    // Different CDN nodes serve same video: cdn-xxx.edgeon-bandwidth.com vs cdn-yyy.edgeon-bandwidth.com
    if (urlObj.hostname.includes('edgeon-bandwidth.com') ||
        pathname.includes('/engine/hls') || pathname.includes('/hls2')) {
      // Extract video ID from path: /engine/hls2/01/14818/x04v1fmwj or /engine/hls2-c/01/14818/x04v1fm
      const videoIdMatch = pathname.match(/\/(\d+)\/(\d+)\/([a-z0-9]+)/i);
      if (videoIdMatch) {
        // Use normalized key based on video ID only (first 7 chars to catch variations)
        const videoId = videoIdMatch[3].substring(0, 7);
        return `hls://${videoIdMatch[1]}/${videoIdMatch[2]}/${videoId}`;
      }
    }

    // Return origin + pathname + remaining query params (preserves non-size params for uniqueness)
    const remainingParams = urlObj.searchParams.toString();
    return urlObj.origin + pathname + (remainingParams ? '?' + remainingParams : '');
  } catch {
    return url;
  }
}

// Format file size (no decimals)
function formatSize(bytes) {
  if (!bytes || bytes === 0) return 'Unknown';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i)) + ' ' + sizes[i];
}

// Sanitize filename - remove invalid chars
function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Smart filename cleaning - removes junk patterns
function cleanFilename(rawName) {
  let name = rawName;

  // Remove file extension for processing
  const extMatch = name.match(/\.(jpg|jpeg|png|gif|webp|svg|mp4|webm|m4v|mov|avi|mkv|m3u8)$/i);
  const ext = extMatch ? extMatch[0] : '';
  if (ext) {
    name = name.slice(0, -ext.length);
  }

  // Remove query params and hash
  name = name.replace(/[?#].*$/, '');

  // Remove common junk patterns
  name = name
    // Remove UUIDs (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
    .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '')
    // Remove long hex strings (16+ chars)
    .replace(/[a-f0-9]{16,}/gi, '')
    // Remove base64-like strings (long alphanumeric with mixed case)
    .replace(/[A-Za-z0-9+/]{20,}={0,2}/g, '')
    // Remove timestamp-like numbers (10+ digits)
    .replace(/\d{10,}/g, '')
    // Remove size indicators like 1920x1080, 800w, etc.
    .replace(/\d+x\d+/gi, '')
    .replace(/\d+[wh]/gi, '')
    // Remove common tracking/cache params in filenames
    .replace(/[-_](v\d+|cache|thumb|small|medium|large|original|hd|sd|hq|lq)[-_]?/gi, '')
    // Clean up separators
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // If name is empty or too short after cleaning, use a generic name
  if (name.length < 3) {
    return null; // Signal to use fallback
  }

  // Title case the name
  name = name
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

  // Limit length (leave room for extension and index)
  if (name.length > 50) {
    name = name.substring(0, 50).trim();
  }

  return name + ext.toLowerCase();
}

// Get file extension from URL or content type
function getExtension(media) {
  // Try URL first
  const urlPath = media.url.split('?')[0].toLowerCase();
  const urlExt = urlPath.match(/\.(jpg|jpeg|png|gif|webp|svg|avif|mp4|webm|m4v|mov|avi|mkv|m3u8|m3u)$/);
  if (urlExt) return urlExt[0];

  // Try content type
  const ct = (media.contentType || '').toLowerCase();
  if (ct.includes('jpeg') || ct.includes('jpg')) return '.jpg';
  if (ct.includes('png')) return '.png';
  if (ct.includes('gif')) return '.gif';
  if (ct.includes('webp')) return '.webp';
  if (ct.includes('svg')) return '.svg';
  if (ct.includes('mp4')) return '.mp4';
  if (ct.includes('webm')) return '.webm';
  if (ct.includes('mpegurl')) return '.mp4'; // HLS will be converted

  return media.type === 'image' ? '.jpg' : '.mp4';
}

// Check if current page is a policy-blocked site (YouTube, Instagram, TikTok, etc.)
// Note: Images can still be downloaded, only video streaming is blocked
function isYouTube() {
  return pageUrl.includes('youtube.com') || pageUrl.includes('youtu.be');
}

// Sites where VIDEO downloads are blocked by Chrome policy (images still work)
function isVideoRestricted() {
  const restricted = [
    'youtube.com', 'youtu.be',
    'instagram.com',
    'tiktok.com',
    'dailymotion.com',
    'vk.com',
    'twitter.com', 'x.com',
    'facebook.com', 'fb.com'
  ];
  return restricted.some(site => pageUrl.includes(site));
}

// Legacy function - now checks if we're on a completely blocked page (no media at all)
function isPolicyBlocked() {
  return false; // We now allow images on all sites
}

function getRestrictedSiteName() {
  if (pageUrl.includes('youtube.com') || pageUrl.includes('youtu.be')) return 'YouTube';
  if (pageUrl.includes('instagram.com')) return 'Instagram';
  if (pageUrl.includes('tiktok.com')) return 'TikTok';
  if (pageUrl.includes('dailymotion.com')) return 'Dailymotion';
  if (pageUrl.includes('vk.com')) return 'VK';
  if (pageUrl.includes('twitter.com') || pageUrl.includes('x.com')) return 'Twitter';
  if (pageUrl.includes('facebook.com') || pageUrl.includes('fb.com')) return 'Facebook';
  return null;
}

// Show restriction notice if on a video-restricted site
function updateRestrictionNotice() {
  const notice = document.getElementById('restriction-notice');
  const iconEl = document.getElementById('restriction-icon');
  const textEl = document.getElementById('restriction-text');

  const siteName = getRestrictedSiteName();

  if (siteName && isVideoRestricted()) {
    iconEl.innerHTML = PLATFORM_ICONS[siteName] || '';
    textEl.textContent = `${siteName} videos restricted - tap for options`;
    notice.classList.remove('hidden');

    // Make it clickable to show the blocked site download options
    notice.onclick = () => showBlockedSiteOptions(siteName);
  } else {
    notice.classList.add('hidden');
  }
}

// Show download options for blocked sites (using external services)
function showBlockedSiteOptions(siteName) {
  const container = document.getElementById('media-list');
  const platformIcons = {
    'YouTube': `<svg width="40" height="40" viewBox="0 0 24 24" fill="#ffffff"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,
    'Instagram': `<svg width="40" height="40" viewBox="0 0 24 24" fill="#ffffff"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>`,
    'TikTok': `<svg width="40" height="40" viewBox="0 0 24 24" fill="#ffffff"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/></svg>`,
    'Dailymotion': `<svg width="40" height="40" viewBox="0 0 24 24" fill="#ffffff"><path d="M12.036 0C5.384 0 0 5.384 0 12.036c0 6.651 5.384 12.035 12.036 12.035 6.651 0 12.035-5.384 12.035-12.035C24.071 5.384 18.687 0 12.036 0z"/></svg>`,
    'VK': `<svg width="40" height="40" viewBox="0 0 24 24" fill="#ffffff"><path d="M15.684 0H8.316C1.592 0 0 1.592 0 8.316v7.368C0 22.408 1.592 24 8.316 24h7.368C22.408 24 24 22.408 24 15.684V8.316C24 1.592 22.391 0 15.684 0z"/></svg>`,
    'Twitter': `<svg width="40" height="40" viewBox="0 0 24 24" fill="#ffffff"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
    'Facebook': `<svg width="40" height="40" viewBox="0 0 24 24" fill="#ffffff"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`
  };

  const icon = platformIcons[siteName] || `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`;

  container.innerHTML = `
    <div class="youtube-notice">
      <div class="blocked-icon">${icon}</div>
      <p><strong>${siteName} videos restricted</strong></p>
      <p class="blocked-hint">Chrome Web Store policy blocks video downloads from this site</p>
      <button class="ytdlp-btn cobalt-btn" id="y2down-btn">Download with y2down.cc</button>
      <button class="btn-ghost" id="back-to-images" style="margin-top: 8px;">← Back to images</button>
    </div>
  `;

  document.getElementById('y2down-btn').addEventListener('click', openY2Down);
  document.getElementById('back-to-images').addEventListener('click', () => {
    renderMediaList();
  });
}

// Legacy function for compatibility
function getPolicyBlockedSite() {
  return getRestrictedSiteName();
}

// Parse episode info and format as "Show Name S01E01"
function parseEpisodeTitle(title) {
  let showName = '';
  let season = null;
  let episode = null;

  // Extract season number (Staffel X, Season X, S01, etc.)
  const seasonMatch = title.match(/(?:staffel|season|s)\s*(\d+)/i);
  if (seasonMatch) {
    season = parseInt(seasonMatch[1], 10);
  }

  // Extract episode number (Episode X, Ep X, E01, Folge X, etc.)
  const episodeMatch = title.match(/(?:episode|ep|e|folge)\s*(\d+)/i);
  if (episodeMatch) {
    episode = parseInt(episodeMatch[1], 10);
  }

  // Try to extract show name - usually after "von" or before episode/season info
  // Pattern: "Episode X Staffel Y von SHOW NAME ❤ site" or "SHOW NAME S01E01"
  const vonMatch = title.match(/\bvon\s+(.+?)(?:\s*[❤♥️♡]|$)/i);
  if (vonMatch) {
    showName = vonMatch[1].trim();
  } else {
    // Try to get show name by removing episode/season info and site cruft
    showName = title
      .replace(/(?:episode|ep|folge)\s*\d+/gi, '')
      .replace(/(?:staffel|season)\s*\d+/gi, '')
      .replace(/s\d+\s*e\d+/gi, '')
      .replace(/\s*[❤♥️♡]\s*\S+$/gi, '')  // Remove heart + site
      .replace(/\s*[-–—|]\s*\S+\.\w{2,3}\s*$/i, '')  // Remove " - site.to"
      .trim();
  }

  // Clean up show name - remove leading/trailing separators
  showName = showName
    .replace(/^[-–—]\s*/, '')
    .replace(/\s*[-–—]\s*$/, '');

  // Clean up show name
  showName = showName
    .replace(/\s*[-–—|:]\s*S\.to\s*$/i, '')
    .replace(/\s*[-–—|]\s*\S+\.(to|tv|cc|io|me|net|com|org)\s*$/i, '')
    .replace(/\s*[♥❤️❤]\s*\S*$/g, '')
    .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '')
    .replace(/\s*[-–—|]\s*$/, '')
    .replace(/^\s*[-–—|]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();

  // If we have show name and episode info, format nicely
  if (showName && (season !== null || episode !== null)) {
    let formatted = showName;
    if (season !== null && episode !== null) {
      formatted += ` S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
    } else if (episode !== null) {
      formatted += ` E${String(episode).padStart(2, '0')}`;
    } else if (season !== null) {
      formatted += ` S${String(season).padStart(2, '0')}`;
    }
    return sanitizeFilename(formatted) || null;
  }

  return null; // Fall back to basic cleaning
}

// Clean video title - remove site names, cruft, etc.
function cleanVideoTitle(title) {
  // First try smart episode parsing
  const parsed = parseEpisodeTitle(title);
  if (parsed) return parsed;

  // Fall back to basic cleaning
  let clean = title;

  // Remove common streaming site names and patterns
  const sitePatterns = [
    /\s*[-–—|:]\s*S\.to\s*$/i,
    /\s*[-–—|:]\s*Netflix\s*$/i,
    /\s*[-–—|:]\s*Prime Video\s*$/i,
    /\s*[-–—|:]\s*Disney\+?\s*$/i,
    /\s*[-–—|:]\s*Crunchyroll\s*$/i,
    /\s*[-–—|:]\s*Stream(ing)?\s*$/i,
    /\s*[-–—|:]\s*Watch(online|free|hd)?\s*$/i,
    /\s*❤\s*S\.to\s*$/i,
    /\s*[♥❤️]\s*\S+\.\w{2,3}\s*$/i,  // Heart + domain
    /\s*[-–—|]\s*\S+\.(to|tv|cc|io|me|net|com|org)\s*$/i,  // Trailing domain
  ];

  for (const pattern of sitePatterns) {
    clean = clean.replace(pattern, '');
  }

  // Remove trailing site info after separator
  clean = clean.replace(/\s*[-–—|]\s*[^-–—|]+$/i, '');

  // Remove quality tags
  clean = clean.replace(/\b(1080p|720p|480p|360p|hd|4k|uhd)\b/gi, '');

  // Remove brackets content
  clean = clean.replace(/\s*\[[^\]]*\]\s*/g, ' ');

  // Remove emojis and special symbols
  clean = clean.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[♥❤️♡]/gu, '');

  // Clean up whitespace
  clean = clean.replace(/\s+/g, ' ').trim();

  return sanitizeFilename(clean) || null;
}

// Clean YouTube title
function cleanYouTubeTitle(title) {
  return sanitizeFilename(title.replace(/\s*[-–—|]\s*YouTube\s*$/i, '').trim()) || null;
}

// Get clean display name for media
function getDisplayName(media, index) {
  // For HLS/video streams, use the title stored with the media item (or fallback to current pageTitle)
  if (isHLS(media.url) || (media.type === 'video' && isYouTube())) {
    // Prefer stored pageTitle from when media was captured (more accurate)
    const titleToUse = media.pageTitle || pageTitle;

    if (titleToUse) {
      // Special handling for YouTube - keep "Title - Creator" format
      if (isYouTube()) {
        const ytTitle = cleanYouTubeTitle(titleToUse);
        if (ytTitle && ytTitle.length >= 2) {
          const hlsCount = allMedia.filter(m =>
            isHLS(m.url) && !isMasterPlaylist(m.url)
          ).length;
          if (hlsCount > 1) {
            return `${ytTitle} (${index + 1})`;
          }
          return ytTitle;
        }
      }

      // Standard cleaning for other sites
      const cleanTitle = settings.cleanNames ? cleanVideoTitle(titleToUse) : sanitizeFilename(titleToUse);

      if (cleanTitle && cleanTitle.length >= 2) {
        // Only add number if there are multiple non-master HLS streams
        const hlsCount = allMedia.filter(m =>
          isHLS(m.url) && !isMasterPlaylist(m.url)
        ).length;
        if (hlsCount > 1) {
          return `${cleanTitle} (${index + 1})`;
        }
        return cleanTitle;
      }
    }
    return `Video ${index + 1}`;
  }

  // For regular files, try to clean up the filename
  const rawName = media.filename || '';

  // If useTitle is enabled for images, prepend page title
  let baseName = '';
  if (settings.useTitle && pageTitle && media.type === 'image') {
    const cleanPageTitle = settings.cleanNames ?
      sanitizeFilename(pageTitle).substring(0, 30) :
      sanitizeFilename(pageTitle);
    baseName = cleanPageTitle ? `${cleanPageTitle} - ` : '';
  }

  // Clean the filename if setting is enabled
  const cleanedName = settings.cleanNames ? cleanFilename(rawName) : sanitizeFilename(rawName);

  if (cleanedName) {
    return baseName + cleanedName;
  }

  // Fallback: use type + index
  const ext = getExtension(media);
  if (media.type === 'image') {
    return `${baseName}Image ${index + 1}${ext}`;
  } else if (media.type === 'video') {
    return `Video ${index + 1}${ext}`;
  }
  return `Media ${index + 1}${ext}`;
}

// Get file type label - shows the OUTPUT format (what you'll download)
function getFileTypeLabel(media) {
  const url = media.url.toLowerCase().split('?')[0];

  // HLS and DASH streams get converted to MP4
  if (isHLS(url) || media.type === 'hls') return 'MP4';
  if (url.endsWith('.mpd') || media.type === 'dash') return 'MP4';

  // Check URL extension
  const extMatch = url.match(/\.([a-z0-9]{2,5})$/i);
  if (extMatch) {
    const ext = extMatch[1].toUpperCase();
    // Map common extensions
    const extMap = {
      'JPEG': 'JPG',
      'M4V': 'MP4',
      'MOV': 'MP4'
    };
    return extMap[ext] || ext;
  }

  // Fall back to content type
  const ct = (media.contentType || '').toLowerCase();
  if (ct.includes('mp4')) return 'MP4';
  if (ct.includes('webm')) return 'WEBM';
  if (ct.includes('jpeg') || ct.includes('jpg')) return 'JPG';
  if (ct.includes('png')) return 'PNG';
  if (ct.includes('gif')) return 'GIF';
  if (ct.includes('webp')) return 'WEBP';
  if (ct.includes('mpegurl')) return 'MP4';  // HLS -> MP4
  if (ct.includes('dash')) return 'MP4';      // DASH -> MP4

  // Fall back to generic type
  if (media.type === 'video') return 'MP4';
  if (media.type === 'image') return 'JPG';

  return 'MP4';
}

// Check if URL is an HLS stream
function isHLS(url) {
  if (!url) return false;
  const urlLower = url.toLowerCase().split('?')[0];
  return urlLower.endsWith('.m3u8') || urlLower.endsWith('.m3u');
}

// Check if URL is a master playlist (should be hidden)
// Only hide if it's clearly a master/manifest, not just any playlist
function isMasterPlaylist(url) {
  const urlLower = url.toLowerCase();
  // Only filter obvious master playlist indicators
  // Don't filter "playlist" alone as many valid media playlists contain this
  return urlLower.includes('master.m3u8') ||
         urlLower.includes('master_') ||
         urlLower.includes('/master/') ||
         urlLower.includes('manifest.m3u8') ||
         urlLower.includes('/manifest/');
}

// Sort media list based on settings.sortOrder
function sortMedia(media) {
  return [...media].sort((a, b) => {
    // FIRST PRIORITY: Videos with HLS thumbnails should appear before those without
    // This ensures VOE videos with extracted thumbnails show before JWPlayer videos without
    const aIsHLS = a.type === 'hls' || isHLS(a.url);
    const bIsHLS = b.type === 'hls' || isHLS(b.url);
    if (aIsHLS || bIsHLS) {
      const aHasExtractedThumb = a.thumbnail && a.thumbnailSource === 'hls_extraction';
      const bHasExtractedThumb = b.thumbnail && b.thumbnailSource === 'hls_extraction';
      if (aHasExtractedThumb && !bHasExtractedThumb) return -1;
      if (!aHasExtractedThumb && bHasExtractedThumb) return 1;
    }

    // Then apply existing sort criteria
    switch (settings.sortOrder) {
      case 'largest':
        return (b.size || 0) - (a.size || 0);
      case 'newest':
        // Use timestamp if available, otherwise maintain order
        return (b.timestamp || 0) - (a.timestamp || 0);
      case 'type':
        // Group by type (images first, then videos), then by size
        if (a.type !== b.type) {
          return a.type === 'image' ? -1 : 1;
        }
        return (b.size || 0) - (a.size || 0);
      case 'name':
        // Sort alphabetically by display name
        const nameA = (a.displayName || a.filename || '').toLowerCase();
        const nameB = (b.displayName || b.filename || '').toLowerCase();
        return nameA.localeCompare(nameB);
      default:
        return (b.size || 0) - (a.size || 0);
    }
  });
}

// Check if URL is an HLS/DASH segment (not useful on its own)
function isStreamSegment(url) {
  const urlLower = url.toLowerCase().split('?')[0];
  // Only filter by extension - .ts and .m4s are segment files
  return urlLower.endsWith('.ts') || urlLower.endsWith('.m4s');
}

// Filter media list
function filterMedia(media, type) {
  // Debug: log what images we're getting
  const inputImages = media.filter(m => m.type === 'image');

  // Log sample images with dimensions for debugging
  if (inputImages.length > 0) {
    const samples = inputImages.slice(0, 5).map(i =>
      `${i.width || '?'}x${i.height || '?'} ${i.url?.split('/').pop()?.slice(0, 25) || '?'}`
    );
    logToBackground('debug', 'filterMedia images', {
      type,
      count: inputImages.length,
      samples
    });
  }

  // First, filter out segments, master playlists, and files with no size
  let filtered = media.filter(m => {
    // Hide HLS/DASH segments - they're useless without the full stream
    if (isStreamSegment(m.url)) {
      return false;
    }
    // Hide master playlists (but be careful - only if URL clearly indicates master)
    if (isHLS(m.url) && isMasterPlaylist(m.url)) {
      return false;
    }
    // Hide files with no size, UNLESS:
    // - It's an HLS stream (may not have size yet)
    // - It's an image (from DOM scan or background - size may come later)
    if (!m.size && !isHLS(m.url) && m.type !== 'image') {
      return false;
    }
    // Skip small images if setting is enabled
    if (m.type === 'image' && settings.skipSmallImages) {
      const minSize = settings.minSize || 80;
      if (m.width && m.height && (m.width < minSize || m.height < minSize)) {
        return false;
      }
      // Skip tiny files (likely tracking pixels)
      if (m.size && m.size < 1000) {
        return false;
      }
    }
    return true;
  });

  // Apply deduplication if hideDupes is enabled
  if (settings.hideDupes) {
    const dedupedMap = new Map();
    filtered.forEach(m => {
      const key = normalizeUrlForDedup(m.url);
      const existing = dedupedMap.get(key);
      if (!existing || (m.size || 0) > (existing.size || 0)) {
        dedupedMap.set(key, m);
      }
    });
    filtered = Array.from(dedupedMap.values());
  }

  // Debug: log filtered results for images
  const outputImages = filtered.filter(m => m.type === 'image');
  if (inputImages.length > 0 && outputImages.length !== inputImages.length) {
    logToBackground('debug', 'filterMedia output', {
      type,
      inputImages: inputImages.length,
      outputImages: outputImages.length,
      filtered: inputImages.length - outputImages.length
    });
  }

  if (type === 'all') return filtered;
  if (type === 'video') {
    return filtered.filter(m => m.type === 'video' || m.type === 'hls' || isHLS(m.url));
  }
  return filtered.filter(m => m.type === type);
}

// Render media list
function renderMediaList() {
  const container = document.getElementById('media-list');
  const countEl = document.getElementById('media-count');
  const sizeEl = document.getElementById('total-size');

  let filtered = filterMedia(allMedia, currentFilter);
  let sorted = sortMedia(filtered);

  countEl.textContent = `${sorted.length} item${sorted.length !== 1 ? 's' : ''}`;
  const totalSize = sorted.reduce((acc, m) => acc + (m.size || 0), 0);
  sizeEl.textContent = totalSize > 0 ? formatSize(totalSize) : '';

  // Update restriction notice (shown if on video-restricted site)
  updateRestrictionNotice();

  if (sorted.length === 0) {
    // Show contextual hint based on filter type
    let hint = 'Try scrolling or interacting with the page';
    if (currentFilter === 'video' || currentFilter === 'all') {
      hint = 'Try playing the video first, then refresh';
    }
    container.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
        <p>No media found on this page</p>
        <p>${hint}</p>
      </div>
    `;
    return;
  }

  container.innerHTML = sorted.map((media, index) => {
    const isHlsStream = isHLS(media.url) || media.type === 'hls';
    const isVideoType = media.type === 'video' || media.type === 'hls' || isHlsStream;
    const displayType = isVideoType ? 'video' : media.type; // For CSS class
    const fileTypeLabel = getFileTypeLabel(media); // Actual file type label
    const displayName = media.displayName || getDisplayName(media, index);
    const thumbnail = media.thumbnail || '';
    const isSelected = selectedUrls.has(media.url);

    // Get appropriate icon for media type
    const videoIcon = `<svg class="media-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
    const imageIcon = `<svg class="media-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`;
    const defaultIcon = displayType === 'video' ? videoIcon : imageIcon;

    // Build thumbnail HTML with proper fallbacks
    let thumbnailHtml;
    const fallbackThumbnail = media.fallbackThumbnail || '';
    if (thumbnail) {
      // Has thumbnail - show it with fallback chain: primary -> fallback -> icon
      if (fallbackThumbnail) {
        // HLS video with fallback - try fallback thumbnail before icon
        thumbnailHtml = `<img src="${thumbnail}" alt="" loading="lazy" data-fallback="${fallbackThumbnail}" onerror="if(this.dataset.fallback && !this.dataset.triedFallback){this.dataset.triedFallback='1';this.src=this.dataset.fallback;}else{this.classList.add('hidden');}"><span class="icon-fallback">${defaultIcon}</span>`;
      } else {
        // Regular thumbnail - just icon fallback
        thumbnailHtml = `<img src="${thumbnail}" alt="" loading="lazy" onerror="this.classList.add('hidden')"><span class="icon-fallback">${defaultIcon}</span>`;
      }
    } else if (media.type === 'image') {
      // Image without thumbnail - try to show the image itself with icon fallback
      thumbnailHtml = `<img src="${media.url}" alt="" loading="lazy" onerror="this.classList.add('hidden')"><span class="icon-fallback">${imageIcon}</span>`;
    } else {
      // Video/other without thumbnail - show icon directly
      thumbnailHtml = `<span class="icon-fallback visible">${defaultIcon}</span>`;
    }

    // Build size/duration display
    let sizeDisplay = formatSize(media.size);
    if (media.sizeEstimated && media.size) {
      sizeDisplay = '~' + sizeDisplay; // Mark estimated sizes with ~
    }

    // Build extra info (duration, resolution)
    let extraInfo = '';
    if (media.duration) {
      extraInfo += `<span class="media-duration">${formatDuration(media.duration)}</span>`;
    }
    // Only show resolution if it's a valid resolution string (not null, "Unknown", or "Stream")
    if (media.resolution && media.resolution !== 'Unknown' && media.resolution !== 'Stream') {
      extraInfo += `<span class="media-resolution">${media.resolution}</span>`;
    }

    // Determine preview URL (for clicking thumbnail)
    const previewUrl = media.type === 'image' ? media.url : (thumbnail || '');

    return `
    <div class="media-item ${isSelected ? 'selected' : ''}" data-index="${index}" data-url="${encodeURIComponent(media.url)}">
      <div class="media-select ${isSelected ? 'selected' : ''}" data-url="${encodeURIComponent(media.url)}"></div>
      <div class="media-thumbnail" data-preview="${encodeURIComponent(previewUrl)}" title="Click to preview">${thumbnailHtml}</div>
      <div class="media-info">
        <div class="media-filename" title="${displayName}">${displayName}</div>
        <div class="media-details">
          <span class="media-type ${displayType}">${fileTypeLabel}</span>
          ${extraInfo}
          <span class="media-size">${sizeDisplay}</span>
        </div>
      </div>
      <div class="media-actions">
        <button class="${isHlsStream ? 'download-hls-btn' : 'download-btn'}"
                data-url="${encodeURIComponent(media.url)}"
                data-filename="${encodeURIComponent(displayName)}"
                title="Download">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </button>
      </div>
    </div>
  `}).join('');

  attachDownloadListeners();
}

// Update selection toolbar visibility
function updateSelectionToolbar() {
  const toolbar = document.getElementById('selection-toolbar');
  const countEl = document.getElementById('selected-count');
  const count = selectedUrls.size;

  countEl.textContent = count;
  toolbar.classList.toggle('visible', count > 0);
}

// Toggle selection for a media item
function toggleSelection(url) {
  if (selectedUrls.has(url)) {
    selectedUrls.delete(url);
  } else {
    selectedUrls.add(url);
  }
  renderMediaList();
  updateSelectionToolbar();
}

// Clear all selections
function clearSelection() {
  selectedUrls.clear();
  renderMediaList();
  updateSelectionToolbar();
}

// Download selected media
async function downloadSelected() {
  const selectedMedia = allMedia.filter(m => selectedUrls.has(m.url));

  if (selectedMedia.length === 0) return;

  // Single file - download directly
  if (selectedMedia.length === 1) {
    const media = selectedMedia[0];
    if (isHLS(media.url) || media.type === 'hls') {
      downloadHLS(media.url, media.displayName);
    } else {
      downloadMedia(media.url, media.displayName);
    }
    clearSelection();
    return;
  }

  // Multiple files - check if any are HLS (can't bundle those)
  const hlsMedia = selectedMedia.filter(m => isHLS(m.url) || m.type === 'hls');
  const directMedia = selectedMedia.filter(m => !isHLS(m.url) && m.type !== 'hls');

  // Download HLS streams individually (they require special handling)
  hlsMedia.forEach((media, index) => {
    setTimeout(() => {
      downloadHLS(media.url, media.displayName);
    }, index * 1000);
  });

  // Bundle direct downloads into ZIP if more than 1
  if (directMedia.length > 1) {
    await downloadAsZip(directMedia);
  } else if (directMedia.length === 1) {
    downloadMedia(directMedia[0].url, directMedia[0].displayName);
  }

  clearSelection();
}

// Attach download listeners
function attachDownloadListeners() {
  document.querySelectorAll('.download-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const url = decodeURIComponent(btn.dataset.url);
      const filename = decodeURIComponent(btn.dataset.filename);
      downloadMedia(url, filename);
    });
  });

  document.querySelectorAll('.download-hls-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const url = decodeURIComponent(btn.dataset.url);
      const filename = decodeURIComponent(btn.dataset.filename);
      downloadHLS(url, filename);
    });
  });

  // Selection checkboxes
  document.querySelectorAll('.media-select').forEach(checkbox => {
    checkbox.addEventListener('click', (e) => {
      e.stopPropagation();
      const url = decodeURIComponent(checkbox.dataset.url);
      toggleSelection(url);
    });
  });

  // Thumbnail click for preview
  document.querySelectorAll('.media-thumbnail').forEach(thumb => {
    thumb.addEventListener('click', (e) => {
      e.stopPropagation();
      const previewUrl = thumb.dataset.preview;
      if (previewUrl) {
        showPreview(decodeURIComponent(previewUrl));
      }
    });
  });
}

// Show image preview modal
function showPreview(url) {
  const modal = document.getElementById('preview-modal');
  const img = document.getElementById('preview-image');
  img.src = url;
  modal.classList.add('visible');
  document.body.classList.add('modal-open');
}

// Hide preview modal
function hidePreview() {
  const modal = document.getElementById('preview-modal');
  const img = document.getElementById('preview-image');
  modal.classList.remove('visible');
  document.body.classList.remove('modal-open');
  img.src = '';  // Clear to free memory
}

// Check if URL is a YouTube video URL (protected)
function isYouTubeVideo(url) {
  return url.includes('googlevideo.com') ||
         (isYouTube() && (url.includes('.mp4') || url.includes('.webm')));
}

// Open y2down.cc with URL (primary download service)
function openY2Down() {
  const targetUrl = 'https://y2down.cc/?url=' + encodeURIComponent(pageUrl);
  chrome.tabs.create({ url: targetUrl });
}

// Download regular media
async function downloadMedia(url, filename) {
  // Policy-blocked videos can't be downloaded directly
  if (isYouTubeVideo(url)) {
    openY2Down();
    return;
  }

  // Ensure filename has extension
  let finalFilename = sanitizeFilename(filename || 'video');
  const urlLower = url.toLowerCase();

  // Add extension if missing
  if (!finalFilename.toLowerCase().match(/\.(mp4|webm|mkv|mov|avi|jpg|jpeg|png|gif|webp)$/)) {
    if (urlLower.includes('.webm')) {
      finalFilename += '.webm';
    } else if (urlLower.includes('.png')) {
      finalFilename += '.png';
    } else if (urlLower.includes('.jpg') || urlLower.includes('.jpeg')) {
      finalFilename += '.jpg';
    } else {
      finalFilename += '.mp4';
    }
  }

  // Use Chrome's download API directly - it handles cross-origin better
  chrome.runtime.sendMessage({
    action: 'downloadMedia',
    url: url,
    filename: finalFilename,
    saveAs: settings.saveAs
  });
}

// Set download state (updates UI and beforeunload warning)
function setDownloadState(downloading) {
  isDownloading = downloading;
  document.body.classList.toggle('downloading', downloading);

  // Update beforeunload warning
  if (downloading) {
    window.onbeforeunload = (e) => {
      e.preventDefault();
      e.returnValue = 'Download in progress. Are you sure you want to close?';
      return e.returnValue;
    };
  } else {
    window.onbeforeunload = null;
  }
}

// Download HLS stream via offscreen document (persists when popup closes)
let activeDownloadId = null;
let lastDownloadTime = 0;

async function downloadHLS(url, displayName) {
  // Debounce - prevent double clicks (must wait 2 seconds between downloads)
  const now = Date.now();
  if (now - lastDownloadTime < 2000) {
    console.log('Download debounced - too soon after last download');
    return;
  }
  lastDownloadTime = now;
  const progressEl = document.getElementById('hls-progress');
  const progressFill = progressEl.querySelector('.progress-fill');
  const progressText = progressEl.querySelector('.progress-text');
  const progressDetails = progressEl.querySelector('.progress-details');

  progressEl.classList.remove('hidden');
  setDownloadState(true);
  progressText.textContent = 'Starting download...';
  progressFill.style.width = '0%';
  progressDetails.textContent = 'Download continues in background';

  // Generate filename
  let filename = sanitizeFilename(displayName || pageTitle || 'video');
  if (!filename.toLowerCase().endsWith('.mp4')) {
    filename += '.mp4';
  }

  try {
    // Start download via offscreen document
    const response = await chrome.runtime.sendMessage({
      action: 'startHLSDownload',
      url: url,
      filename: filename,
      tabId: currentTabId
    });

    if (response?.downloadId) {
      activeDownloadId = response.downloadId;
      progressText.textContent = 'Download started';
      progressDetails.textContent = 'Safe to close popup - download continues in background';
    } else if (response?.error) {
      throw new Error(response.error);
    }
  } catch (error) {
    progressText.textContent = 'Failed to start download';
    progressDetails.textContent = error.message;
    console.error('Download error:', error);
    setTimeout(() => {
      progressEl.classList.add('hidden');
      setDownloadState(false);
    }, 3000);
  }
}

// Show cancel download confirmation modal
function showCancelModal() {
  document.getElementById('cancel-modal').classList.add('visible');
  document.body.classList.add('modal-open');
}

// Hide cancel modal
function hideCancelModal() {
  document.getElementById('cancel-modal').classList.remove('visible');
  document.body.classList.remove('modal-open');
}

// Cancel the active download
async function cancelDownload() {
  hideCancelModal();

  if (activeDownloadId) {
    try {
      await chrome.runtime.sendMessage({
        action: 'cancelHLSDownload',
        downloadId: activeDownloadId
      });
    } catch (err) {
      console.error('Failed to cancel download:', err);
    }
  }

  // Reset UI
  const progressEl = document.getElementById('hls-progress');
  progressEl.classList.add('hidden');
  setDownloadState(false);
  activeDownloadId = null;
}

// Listen for progress updates from offscreen document
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'hlsProgress' && message.download) {
    const download = message.download;
    const progressEl = document.getElementById('hls-progress');
    const progressFill = progressEl.querySelector('.progress-fill');
    const progressText = progressEl.querySelector('.progress-text');
    const progressDetails = progressEl.querySelector('.progress-details');

    progressEl.classList.remove('hidden');
    setDownloadState(true);
    progressFill.style.width = `${download.progress}%`;
    progressText.textContent = download.message;

    if (download.status === 'complete') {
      progressDetails.textContent = '';
      setTimeout(() => {
        progressEl.classList.add('hidden');
        setDownloadState(false);
        activeDownloadId = null;
      }, 2000);
    } else if (download.status === 'error' || download.status === 'cancelled') {
      progressDetails.textContent = download.message;
      setTimeout(() => {
        progressEl.classList.add('hidden');
        setDownloadState(false);
        activeDownloadId = null;
      }, 3000);
    } else {
      progressDetails.textContent = download.progress > 0 ? `${download.progress}%` : '';
    }
  }
  return false;
});

// Warn user when trying to close during download
window.addEventListener('beforeunload', (e) => {
  if (isDownloading) {
    e.preventDefault();
    e.returnValue = 'A download is in progress. Are you sure you want to leave?';
    return e.returnValue;
  }
});

// Get thumbnail data (new format with default + per-video)
async function fetchThumbnailData(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { action: 'getThumbnail' });
    // Handle both old format (string) and new format (object)
    if (typeof response?.thumbnail === 'string') {
      return { default: response.thumbnail, videos: {} };
    }
    const data = response?.thumbnail || { default: null, videos: {} };
    // Log debug info if available
    if (data.debug && data.debug.length > 0) {
      console.log('[MediaDownloader] Thumbnail detection:', data.debug);
      logToBackground('debug', 'Thumbnail detection', { steps: data.debug, result: data.default?.substring(0, 80) });
    }
    return data;
  } catch {
    return { default: null, videos: {} };
  }
}

// Estimate bitrate based on resolution (conservative streaming bitrates)
// These values are based on typical streaming services, erring on the low side
function estimateBitrateFromResolution(resolution) {
  if (!resolution) return 0;

  const match = resolution.match(/(\d+)x(\d+)/);
  if (!match) return 0;

  const height = parseInt(match[2], 10);

  // Conservative average bitrates (in bits per second)
  // Using lower estimates to avoid overestimating file sizes
  if (height >= 2160) return 12000000;  // 4K: ~12 Mbps
  if (height >= 1440) return 6000000;   // 1440p: ~6 Mbps
  if (height >= 1080) return 3500000;   // 1080p: ~3.5 Mbps
  if (height >= 720) return 2000000;    // 720p: ~2 Mbps
  if (height >= 480) return 1000000;    // 480p: ~1 Mbps
  if (height >= 360) return 600000;     // 360p: ~600 Kbps
  return 400000;                         // Lower: ~400 Kbps
}

// Parse HLS playlist to get duration and estimate size
async function parseHLSPlaylist(url) {
  // HLS BANDWIDTH is typically peak/max bitrate, not average
  // Apply correction factor to get realistic average (typically 50-60% of peak)
  const BANDWIDTH_CORRECTION = 0.5;
  const DEFAULT_BITRATE = 1500000; // 1.5 Mbps default fallback

  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const text = await response.text();
    const lines = text.split('\n');

    let totalDuration = 0;
    let bandwidth = 0;
    let averageBandwidth = 0; // Some playlists have AVERAGE-BANDWIDTH
    let resolution = '';
    let isVariantPlaylist = false;
    let bestVariant = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Check for variant/master playlist
      if (line.startsWith('#EXT-X-STREAM-INF:')) {
        isVariantPlaylist = true;
        const bwMatch = line.match(/BANDWIDTH=(\d+)/);
        const avgBwMatch = line.match(/AVERAGE-BANDWIDTH=(\d+)/);
        const resMatch = line.match(/RESOLUTION=(\d+x\d+)/);
        const bw = bwMatch ? parseInt(bwMatch[1], 10) : 0;
        const avgBw = avgBwMatch ? parseInt(avgBwMatch[1], 10) : 0;

        if (bw > bandwidth) {
          bandwidth = bw;
          averageBandwidth = avgBw;
          resolution = resMatch ? resMatch[1] : '';
          // Next line is the variant URL
          const nextLine = lines[i + 1]?.trim();
          if (nextLine && !nextLine.startsWith('#')) {
            bestVariant = new URL(nextLine, url).href;
          }
        }

        // If no bandwidth but has resolution, capture it for estimation
        if (!bw && resMatch && !resolution) {
          resolution = resMatch[1];
        }
      }

      // Get segment duration
      if (line.startsWith('#EXTINF:')) {
        const durationMatch = line.match(/#EXTINF:([\d.]+)/);
        if (durationMatch) {
          totalDuration += parseFloat(durationMatch[1]);
        }
      }
    }

    // Calculate effective bandwidth (prefer AVERAGE-BANDWIDTH, then apply correction to BANDWIDTH)
    function getEffectiveBandwidth(bw, avgBw, res) {
      if (avgBw > 0) return avgBw; // Use average if available
      if (bw > 0) return Math.round(bw * BANDWIDTH_CORRECTION); // Apply correction to peak
      return estimateBitrateFromResolution(res); // Fall back to resolution estimate
    }

    // If this is a variant playlist, fetch the best quality one
    if (isVariantPlaylist && bestVariant) {
      const variantInfo = await parseHLSPlaylist(bestVariant);
      if (variantInfo) {
        const effectiveBandwidth = getEffectiveBandwidth(bandwidth, averageBandwidth, resolution);
        return {
          duration: variantInfo.duration,
          bandwidth: effectiveBandwidth || variantInfo.bandwidth,
          resolution: resolution || variantInfo.resolution,
          estimatedSize: effectiveBandwidth > 0 && variantInfo.duration > 0
            ? Math.round((effectiveBandwidth / 8) * variantInfo.duration)
            : variantInfo.estimatedSize
        };
      }
    }

    // Estimate size: use calculated effective bandwidth
    let effectiveBandwidth = getEffectiveBandwidth(bandwidth, averageBandwidth, resolution);

    // Fallback to default if we still have nothing
    if (!effectiveBandwidth && totalDuration > 0) {
      effectiveBandwidth = DEFAULT_BITRATE;
    }

    let estimatedSize = 0;
    if (effectiveBandwidth > 0 && totalDuration > 0) {
      estimatedSize = Math.round((effectiveBandwidth / 8) * totalDuration);
    }

    return {
      duration: totalDuration,
      bandwidth: effectiveBandwidth,
      resolution: resolution || null, // Return null instead of 'Unknown' to differentiate
      estimatedSize
    };
  } catch (err) {
    console.error('HLS parse error:', err);
    return null;
  }
}

// Format duration as mm:ss or hh:mm:ss
function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Fetch media sizes with improved detection
async function fetchMediaSizes(media) {
  const promises = media.map(async (item) => {
    // Skip if already has size
    if (item.size) return item;

    // For HLS streams, parse playlist to estimate size
    if (isHLS(item.url)) {
      try {
        const hlsInfo = await parseHLSPlaylist(item.url);
        if (hlsInfo) {
          item.duration = hlsInfo.duration;
          // Only set resolution if it's a valid value (not null)
          if (hlsInfo.resolution) {
            item.resolution = hlsInfo.resolution;
          }
          if (hlsInfo.estimatedSize > 0) {
            item.size = hlsInfo.estimatedSize;
            item.sizeEstimated = true; // Mark as estimated
          }
        }
        // Don't set resolution to "Stream" - just leave it undefined
      } catch (err) {
        console.error('Failed to parse HLS:', err);
        // Don't set resolution on error - just leave it undefined
      }
      return item;
    }

    // For regular media, try HEAD request first
    try {
      const response = await fetch(item.url, { method: 'HEAD' });
      const contentLength = response.headers.get('content-length');
      if (contentLength) {
        item.size = parseInt(contentLength, 10);
        return item;
      }
    } catch {
      // HEAD failed, try range request
    }

    // Fallback: try range request to get size
    try {
      const response = await fetch(item.url, {
        method: 'GET',
        headers: { 'Range': 'bytes=0-0' }
      });
      const contentRange = response.headers.get('content-range');
      if (contentRange) {
        // Format: bytes 0-0/12345
        const match = contentRange.match(/\/(\d+)$/);
        if (match) {
          item.size = parseInt(match[1], 10);
        }
      }
    } catch {
      // Ignore
    }

    return item;
  });
  return Promise.all(promises);
}

// Load media from background and content script
async function loadMedia() {
  const container = document.getElementById('media-list');
  container.innerHTML = '<div class="loading">Scanning page...</div>';

  // Clear stale data immediately
  allMedia = [];
  selectedUrls.clear();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  currentTabId = tab.id;
  pageTitle = tab.title || '';
  pageUrl = tab.url || '';

  // Restore saved popup state for this tab
  await loadPopupState(tab.id);

  // Get thumbnail data from page
  const thumbnailData = await fetchThumbnailData(tab.id);

  // Get media from background script
  const bgResponse = await chrome.runtime.sendMessage({
    action: 'getMedia',
    tabId: tab.id
  });

  // Always scan all media on the page (viewport filtering removed)
  let contentMedia = [];
  try {
    const csResponse = await chrome.tabs.sendMessage(tab.id, {
      action: 'scanAllMedia'
    });
    contentMedia = csResponse?.media || [];
  } catch {
    // Content script may not be loaded
  }

  // All content media is the same (no viewport distinction)
  const allContentMedia = contentMedia;

  // Merge and deduplicate using normalized URLs, preferring larger files
  const mediaMap = new Map();
  const allMediaMap = new Map();

  function addToMediaMap(m, map) {
    const key = normalizeUrlForDedup(m.url);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, m);
    } else {
      // THUMBNAIL PRIORITY: Prefer items with HLS-extracted thumbnails
      const existingHasExtractedThumb = existing.thumbnail && existing.thumbnailSource === 'hls_extraction';
      const newHasExtractedThumb = m.thumbnail && m.thumbnailSource === 'hls_extraction';

      // Decide which item to keep based on thumbnail quality first, then size
      let keepExisting;
      if (existingHasExtractedThumb && !newHasExtractedThumb) {
        // Existing has better thumbnail - keep it
        keepExisting = true;
      } else if (!existingHasExtractedThumb && newHasExtractedThumb) {
        // New item has better thumbnail - use it
        keepExisting = false;
      } else {
        // Same thumbnail quality - fall back to size comparison
        const newSize = m.size || 0;
        const existingSize = existing.size || 0;
        keepExisting = existingSize >= newSize;
      }

      if (keepExisting) {
        // Keep existing but merge in any new properties it might be missing
        const merged = { ...existing };
        if (m.thumbnail && !existing.thumbnail) {
          merged.thumbnail = m.thumbnail;
          merged.thumbnailSource = m.thumbnailSource;
        }
        if (m.width && !existing.width) merged.width = m.width;
        if (m.height && !existing.height) merged.height = m.height;
        if (m.size && !existing.size) merged.size = m.size;
        map.set(key, merged);
      } else {
        // Use new item but preserve any properties from existing
        const merged = { ...m };
        if (existing.thumbnail && !m.thumbnail) {
          merged.thumbnail = existing.thumbnail;
          merged.thumbnailSource = existing.thumbnailSource;
        }
        if (existing.width && !m.width) merged.width = existing.width;
        if (existing.height && !m.height) merged.height = existing.height;
        if (existing.size && !m.size) merged.size = existing.size;
        map.set(key, merged);
      }
    }
  }

  // Normalize URL for comparison (remove hash, trailing slash)
  function normalizePageUrl(url) {
    if (!url) return '';
    return url.split('#')[0].replace(/\/$/, '');
  }

  const normalizedPageUrl = normalizePageUrl(pageUrl);

  // Filter media from background - match current page URL
  // Uses normalized comparison to handle minor URL variations
  (bgResponse?.media || []).forEach(m => {
    if (m.pageUrl && normalizePageUrl(m.pageUrl) === normalizedPageUrl) {
      addToMediaMap(m, mediaMap);
      addToMediaMap(m, allMediaMap);
    }
  });

  // Add content media with current page URL (for display)
  contentMedia.forEach(m => {
    m.pageUrl = pageUrl;
    m.pageTitle = pageTitle;
    addToMediaMap(m, mediaMap);
  });

  // Add ALL content media (for download all modal)
  allContentMedia.forEach(m => {
    m.pageUrl = pageUrl;
    m.pageTitle = pageTitle;
    addToMediaMap(m, allMediaMap);
  });

  // Log HLS items from background (with or without thumbnails)
  const allHlsFromBg = (bgResponse?.media || []).filter(m => m.type === 'hls' || m.url?.includes('.m3u8'));
  if (allHlsFromBg.length > 0) {
    logToBackground('debug', 'HLS items from background', {
      count: allHlsFromBg.length,
      currentPageUrl: normalizedPageUrl?.slice(0, 50),
      items: allHlsFromBg.map(m => ({
        url: m.url?.slice(0, 50),
        thumb: m.thumbnail?.slice(0, 50) || 'none',
        itemPageUrl: m.pageUrl?.slice(0, 50),
        matchesPage: normalizePageUrl(m.pageUrl) === normalizedPageUrl
      }))
    });
  }

  // Log for debugging
  logToBackground('debug', 'Media loaded', {
    bgCount: bgResponse?.media?.length || 0,
    filteredCount: mediaMap.size,
    allMediaCount: allMediaMap.size,
    pageUrl: pageUrl
  });

  allMedia = Array.from(mediaMap.values());

  // Collect all images for potential thumbnail matching
  const allImages = Array.from(mediaMap.values()).filter(m => m.type === 'image');

  // Add display names and thumbnails to both arrays
  async function processMediaArray(arr, thumbnailData, images) {
    let hlsIndex = 0;
    for (let i = 0; i < arr.length; i++) {
      const media = arr[i];
      const isVideo = isHLS(media.url) || media.type === 'video' || media.type === 'hls';

      if (isHLS(media.url)) {
        media.displayName = getDisplayName(media, hlsIndex++);
      } else {
        media.displayName = getDisplayName(media, i);
      }

      // Assign thumbnails for videos
      if (isVideo) {
        // Log original thumbnail state for HLS
        const originalThumb = media.thumbnail;

        let thumbnail = null;
        let thumbnailSource = null;

        // For HLS videos: prefer LOCAL page images (they load reliably)
        // External hoster thumbnails (VOE etc.) are often CORS-blocked
        if (media.type === 'hls') {
          // Get HLS video domain for matching
          let hlsDomain = '';
          try {
            hlsDomain = new URL(media.url).hostname;
          } catch {}

          // 1. FIRST: Try to find a 16:9 LANDSCAPE image (with dimensions)
          if (images.length > 0) {
            thumbnail = findVideoRatioImage(images);
            if (thumbnail) thumbnailSource = 'page_16:9_image';
          }

          // 2. For CDN images WITHOUT dimensions, load dimensions and check for 16:9
          if (!thumbnail && images.length > 0 && hlsDomain) {
            // Filter for CDN images that don't have dimensions (couldn't be checked in step 1)
            const cdnImagesNoDims = images.filter(img => {
              if (img.width && img.height) return false; // Already checked in step 1
              if (!img.url) return false;
              try {
                const imgDomain = new URL(img.url).hostname;
                return imgDomain === hlsDomain ||
                       imgDomain.includes('edgeon') ||
                       imgDomain.includes('voe');
              } catch { return false; }
            });

            // Load dimensions for CDN images and find a 16:9 one
            for (const cdnImg of cdnImagesNoDims) {
              const dims = await loadImageDimensions(cdnImg.url);
              if (dims && isLandscape16x9(dims.width, dims.height)) {
                thumbnail = cdnImg.url;
                thumbnailSource = 'cdn_16:9';
                logToBackground('debug', 'CDN image dimensions loaded', {
                  url: cdnImg.url?.slice(0, 60),
                  width: dims.width,
                  height: dims.height,
                  ratio: (dims.width / dims.height).toFixed(2)
                });
                break;
              }
            }

            // If no 16:9 found, use first CDN image as fallback
            if (!thumbnail && cdnImagesNoDims.length > 0) {
              thumbnail = cdnImagesNoDims[0].url;
              thumbnailSource = 'cdn_matched';
            }
          }

          // 3. Try page default thumbnail (series cover etc.)
          if (!thumbnail && thumbnailData.default) {
            thumbnail = thumbnailData.default;
            thumbnailSource = 'page_default';
          }

          // 4. Last resort: use hoster thumbnail URL directly
          if (!thumbnail && originalThumb) {
            thumbnail = originalThumb;
            thumbnailSource = 'hls_extraction';
          }
        } else {
          // For regular videos: use original priority (hoster thumb first)
          thumbnail = media.thumbnail;
          thumbnailSource = thumbnail ? 'hls_extraction' : null;

          // Try exact URL match from DOM detection
          if (!thumbnail) {
            thumbnail = thumbnailData.videos[media.url];
            if (thumbnail) thumbnailSource = 'dom_exact_match';
          }

          // Try matching by normalized URL
          if (!thumbnail) {
            const normalizedVideoUrl = normalizeUrlForDedup(media.url);
            for (const [videoUrl, thumbUrl] of Object.entries(thumbnailData.videos)) {
              if (normalizeUrlForDedup(videoUrl) === normalizedVideoUrl) {
                thumbnail = thumbUrl;
                thumbnailSource = 'dom_normalized_match';
                break;
              }
            }
          }

          // Try to find a matching image from detected images
          if (!thumbnail && images.length > 0) {
            thumbnail = findBestThumbnailMatch(media.url, images);
            if (thumbnail) thumbnailSource = 'image_match';
          }

          // Fall back to page default
          if (!thumbnail && thumbnailData.default) {
            thumbnail = thumbnailData.default;
            thumbnailSource = 'page_default';
          }
        }

        media.thumbnail = thumbnail;
        media.thumbnailSource = thumbnailSource;

        // Store fallback thumbnail for ALL HLS/video media (in case primary fails to load)
        // Find an image with video-like aspect ratio as fallback
        if (media.type === 'hls' || media.type === 'video' || (media.url && isHLS(media.url))) {
          try {
            const ratioFallback = findVideoRatioImage(images);
            if (ratioFallback) {
              media.fallbackThumbnail = ratioFallback;
            } else if (thumbnailData.default) {
              media.fallbackThumbnail = thumbnailData.default;
            }
          } catch (e) {
            console.error('[MediaDownloader] Error in findVideoRatioImage:', e);
            if (thumbnailData.default) {
              media.fallbackThumbnail = thumbnailData.default;
            }
          }
        }

        // Log HLS thumbnail assignment for debugging
        // Check media.type first (safer - avoids potential isHLS error)
        if (media.type === 'hls' || media.type === 'video' || (media.url && isHLS(media.url))) {
          logToBackground('debug', 'HLS thumbnail assigned', {
            url: media.url?.slice(0, 60),
            finalThumb: thumbnail?.slice(0, 60),
            source: thumbnailSource,
            fallback: media.fallbackThumbnail?.slice(0, 60) || 'none',
            originalThumb: originalThumb?.slice(0, 60) || 'none',
            mediaType: media.type
          });
        }
      }
    }
  }

  // Find a LANDSCAPE image with video-appropriate aspect ratio (16:9 preferred)
  // Only considers images where width > height
  function findVideoRatioImage(images) {
    if (!images || !Array.isArray(images) || images.length === 0) {
      return null;
    }

    const TARGET_RATIO = 16 / 9;  // 1.778 - ideal video ratio
    const MIN_WIDTH = 200;
    const MIN_HEIGHT = 100;

    let bestMatch = null;
    let bestRatioDiff = Infinity;
    let bestSize = 0;

    for (const img of images) {
      // Skip if no dimensions
      if (!img.width || !img.height || !img.url) continue;

      // MUST be landscape (width > height) - no portrait images
      if (img.width <= img.height) continue;

      // Skip too small images
      if (img.width < MIN_WIDTH || img.height < MIN_HEIGHT) continue;

      // Skip images that look like UI elements
      const urlLower = img.url.toLowerCase();
      if (urlLower.includes('logo') || urlLower.includes('icon') ||
          urlLower.includes('avatar') || urlLower.includes('banner') ||
          urlLower.includes('button') || urlLower.includes('sprite') ||
          urlLower.includes('/ad') || urlLower.includes('pixel') ||
          urlLower.includes('spacer') || urlLower.includes('blank') ||
          urlLower.includes('cover')) {
        continue;
      }

      const ratio = img.width / img.height;
      const ratioDiff = Math.abs(ratio - TARGET_RATIO);

      // Must be reasonably close to 16:9 (within 0.5)
      if (ratioDiff > 0.5) continue;

      const size = img.width * img.height;

      // Pick the image closest to 16:9, prefer larger when similar
      const isBetterRatio = ratioDiff < bestRatioDiff - 0.05;
      const isSimilarRatio = Math.abs(ratioDiff - bestRatioDiff) <= 0.05;
      const isLarger = size > bestSize;

      if (isBetterRatio || (isSimilarRatio && isLarger) || !bestMatch) {
        bestRatioDiff = ratioDiff;
        bestMatch = img.url;
        bestSize = size;
      }
    }

    logToBackground('debug', 'findVideoRatioImage result', {
      found: !!bestMatch,
      url: bestMatch?.slice(0, 60) || 'none',
      ratio: bestRatioDiff === Infinity ? 'none' : (16/9 - bestRatioDiff).toFixed(2)
    });

    return bestMatch;
  }

  // Load image dimensions by creating an Image element
  // Returns { width, height } or null on error
  function loadImageDimensions(url) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve(null);
      setTimeout(() => resolve(null), 3000); // 3s timeout
      img.src = url;
    });
  }

  // Check if image is landscape 16:9 (or close to it)
  function isLandscape16x9(width, height) {
    if (!width || !height || width <= height) return false;
    const ratio = width / height;
    return Math.abs(ratio - 16/9) < 0.5; // Within 0.5 of 16:9
  }

  // Find best thumbnail match from detected images
  // This is a STRICT fallback - only returns a match if we're confident
  function findBestThumbnailMatch(videoUrl, images) {
    try {
      const videoUrlObj = new URL(videoUrl);
      const videoHost = videoUrlObj.hostname;
      const videoPath = videoUrlObj.pathname.toLowerCase();

      // Extract potential video ID from URL (common patterns)
      const videoIdMatch = videoPath.match(/\/([a-zA-Z0-9_-]{6,20})(?:\.|\?|$)/);
      const videoId = videoIdMatch ? videoIdMatch[1].toLowerCase() : null;

      // Score each image as a potential thumbnail
      let bestMatch = null;
      let bestScore = 0;

      for (const img of images) {
        let score = 0;
        const imgUrl = img.url.toLowerCase();
        const imgUrlObj = new URL(img.url);
        const imgPath = imgUrlObj.pathname.toLowerCase();

        // REQUIRED: Must have thumbnail/poster keywords OR share video ID
        // This is the key change - we're much stricter now
        const hasThumbnailKeyword = imgUrl.includes('poster') ||
                                     imgUrl.includes('thumb') ||
                                     imgUrl.includes('preview') ||
                                     imgUrl.includes('cover') ||
                                     imgUrl.includes('still');

        const sharesVideoId = videoId && imgPath.includes(videoId);

        // Skip if it doesn't look like a thumbnail at all
        if (!hasThumbnailKeyword && !sharesVideoId) {
          continue; // Skip this image entirely
        }

        // Now score the candidates that passed the filter
        if (hasThumbnailKeyword) {
          score += 8; // Strong indicator
        }

        if (sharesVideoId) {
          score += 10; // Very strong indicator - same video ID
        }

        // Same domain is expected
        if (imgUrlObj.hostname === videoHost) {
          score += 2;
        }

        // NEGATIVE scoring - things that make it unlikely to be a thumbnail
        if (imgUrl.includes('logo') || imgUrl.includes('icon') ||
            imgUrl.includes('avatar') || imgUrl.includes('profile') ||
            imgUrl.includes('banner') || imgUrl.includes('ad') ||
            imgUrl.includes('button') || imgUrl.includes('sprite')) {
          score -= 20; // Strong negative
        }

        // Aspect ratio check - thumbnails are typically 16:9 or close
        if (img.width && img.height) {
          const ratio = img.width / img.height;
          if (ratio >= 1.5 && ratio <= 2.0) {
            score += 3; // Video-like aspect ratio
          } else if (ratio < 1.0 || ratio > 3.0) {
            score -= 5; // Very unlikely to be a video thumbnail
          }

          // Size check - too small is likely not a real thumbnail
          if (img.width < 200 || img.height < 100) {
            score -= 5;
          }
        }

        if (score > bestScore && score >= 8) {
          bestScore = score;
          bestMatch = img.url;
        }
      }

      return bestMatch;
    } catch {
      return null;
    }
  }

  await processMediaArray(allMedia, thumbnailData, allImages);

  // Log video thumbnails summary
  const videos = allMedia.filter(m => m.type === 'video' || m.type === 'hls' || isHLS(m.url));
  if (videos.length > 0) {
    logToBackground('debug', 'Video thumbnails summary', {
      count: videos.length,
      videos: videos.map(v => ({
        type: v.type,
        url: v.url?.slice(0, 50),
        thumb: v.thumbnail?.slice(0, 50) || 'none',
        source: v.thumbnailSource || 'unknown'
      }))
    });

    // Console log for debugging - check browser DevTools
    console.log('[MediaDownloader] Videos with thumbnails:', videos.map(v => ({
      url: v.url?.slice(0, 60),
      thumbnail: v.thumbnail,
      source: v.thumbnailSource
    })));
  }

  // Fetch sizes
  try {
    allMedia = await fetchMediaSizes(allMedia);
  } catch (err) {
    console.error('[MediaDownloader] Error fetching sizes:', err);
  }

  // Log that we're about to render
  logToBackground('debug', 'Media loaded', {
    allMediaCount: allMedia.length,
    bgCount: bgResponse?.media?.length || 0,
    pageUrl
  });

  renderMediaList();
}

// Show warning modal before download all
async function showDownloadAllWarning() {
  // Update counts
  updateDownloadModalCounts();

  // Show modal
  document.getElementById('download-modal').classList.add('visible');
  document.body.classList.add('modal-open');
}

// Update download modal counts
function updateDownloadModalCounts() {
  const validMedia = getValidMediaForDownload();

  // Count images and videos - ensure no double counting of HLS
  const images = validMedia.filter(m => m.type === 'image');
  const videos = getUniqueVideos(validMedia);

  // Update counts in modal
  document.getElementById('image-count').textContent = `${images.length} image${images.length !== 1 ? 's' : ''}`;
  document.getElementById('video-count').textContent = `${videos.length} video${videos.length !== 1 ? 's' : ''}`;
  document.getElementById('all-count').textContent = `${images.length + videos.length} file${(images.length + videos.length) !== 1 ? 's' : ''}`;
}

// Get unique videos (avoid counting HLS and regular video as duplicates)
function getUniqueVideos(mediaList) {
  const videoMap = new Map();

  mediaList.forEach(m => {
    const isVideo = m.type === 'video' || m.type === 'hls' || isHLS(m.url);
    if (!isVideo) return;

    // Normalize URL to prevent duplicates
    const normalizedUrl = normalizeUrlForDedup(m.url);
    const existing = videoMap.get(normalizedUrl);

    if (!existing || (m.size || 0) > (existing.size || 0)) {
      videoMap.set(normalizedUrl, m);
    }
  });

  return Array.from(videoMap.values());
}

// Hide download modal
function hideDownloadModal() {
  document.getElementById('download-modal').classList.remove('visible');
  document.body.classList.remove('modal-open');
}

// Filter media for download - removes junk (tracking pixels, icons, etc.)
function getValidMediaForDownload() {
  // Use all detected media
  const sourceMedia = allMedia;

  // Use a Map to deduplicate by normalized URL, keeping largest version
  const dedupedMap = new Map();

  sourceMedia.forEach(m => {
    if (m.url.startsWith('data:')) return;

    // Skip small images (if setting is enabled)
    if (m.type === 'image' && settings.skipSmallImages) {
      const minSize = settings.minSize || 80;
      if (m.width && m.height && (m.width < minSize || m.height < minSize)) return;
      // Also skip if file size is tiny (likely tracking pixel)
      if (m.size && m.size < 1000) return; // Less than 1KB
    }

    // Skip common junk patterns
    const urlLower = m.url.toLowerCase();
    const junkPatterns = [
      '/pixel', '/beacon', '/track', '/analytics', '/1x1', 'spacer',
      '/icon/', '/emoji/', '/badge/', 'favicon', '/sprite', '/logo',
      'facebook.com/tr', 'google-analytics', 'doubleclick', 'adsense',
      '.ico', 'base64,', 'transparent.', 'blank.', 'placeholder',
      '/static/images/', '/assets/icons/', '_thumb', '-thumb'
    ];

    if (junkPatterns.some(p => urlLower.includes(p))) return;

    // Deduplicate by normalized URL
    const normalizedUrl = normalizeUrlForDedup(m.url);
    const existing = dedupedMap.get(normalizedUrl);
    if (!existing || (m.size || 0) > (existing.size || 0)) {
      dedupedMap.set(normalizedUrl, m);
    }
  });

  return Array.from(dedupedMap.values());
}

// Download multiple files as a ZIP
async function downloadAsZip(mediaList) {
  if (!window.JSZip) {
    console.error('JSZip not loaded');
    // Fallback to individual downloads
    mediaList.forEach((media, index) => {
      setTimeout(() => downloadMedia(media.url, media.displayName || media.filename), index * 500);
    });
    return;
  }

  const progressEl = document.getElementById('hls-progress');
  const progressFill = progressEl.querySelector('.progress-fill');
  const progressText = progressEl.querySelector('.progress-text');
  const progressDetails = progressEl.querySelector('.progress-details');

  progressEl.classList.remove('hidden');
  setDownloadState(true);
  progressText.textContent = `Preparing ZIP (0/${mediaList.length})...`;
  progressFill.style.width = '0%';
  progressDetails.textContent = 'Downloading files...';

  const zip = new JSZip();
  const usedFilenames = new Set();

  let completed = 0;
  const total = mediaList.length;

  for (const media of mediaList) {
    try {
      // Generate unique filename
      let filename = sanitizeFilename(media.displayName || media.filename || 'file');
      const ext = getExtension(media);

      // Ensure extension
      if (!filename.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp|svg|mp4|webm|mkv|mov|avi)$/i)) {
        filename += ext;
      }

      // Make unique
      let uniqueName = filename;
      let counter = 1;
      while (usedFilenames.has(uniqueName.toLowerCase())) {
        const nameWithoutExt = filename.replace(/\.[^.]+$/, '');
        uniqueName = `${nameWithoutExt} (${counter})${ext}`;
        counter++;
      }
      usedFilenames.add(uniqueName.toLowerCase());

      // Fetch the file
      const response = await fetch(media.url);
      if (response.ok) {
        const blob = await response.blob();
        zip.file(uniqueName, blob);
      }
    } catch (err) {
      console.warn('Failed to fetch for ZIP:', media.url, err);
    }

    completed++;
    const percent = Math.round((completed / total) * 100);
    progressFill.style.width = `${percent}%`;
    progressText.textContent = `Preparing ZIP (${completed}/${total})...`;
  }

  // Generate ZIP
  progressText.textContent = 'Creating ZIP file...';
  progressDetails.textContent = 'Compressing...';

  try {
    const zipBlob = await zip.generateAsync({ type: 'blob' }, (metadata) => {
      progressFill.style.width = `${Math.round(metadata.percent)}%`;
    });

    // Create download
    const zipFilename = `media-download-${Date.now()}.zip`;
    const url = URL.createObjectURL(zipBlob);

    chrome.downloads.download({
      url: url,
      filename: zipFilename,
      saveAs: settings.saveAs
    }, (downloadId) => {
      // Cleanup blob URL after a delay
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    });

    progressText.textContent = 'ZIP download started!';
    progressDetails.textContent = `${total} files`;
    logToBackground('info', 'ZIP download created', { count: total, size: zipBlob.size });

  } catch (err) {
    progressText.textContent = 'Failed to create ZIP';
    progressDetails.textContent = err.message;
    logToBackground('error', 'ZIP creation failed', { error: err.message });
  }

  setTimeout(() => {
    progressEl.classList.add('hidden');
    setDownloadState(false);
  }, 2500);
}

// Download media by type
async function downloadByType(type) {
  hideDownloadModal();

  // Get all valid media (no scope filtering)
  const validMedia = getValidMediaForDownload();
  let mediaToDownload = [];
  if (type === 'images') {
    mediaToDownload = validMedia.filter(m => m.type === 'image');
  } else if (type === 'videos') {
    // Get unique videos to avoid duplicate downloads
    mediaToDownload = getUniqueVideos(validMedia);
  } else {
    // For 'all', get unique images and unique videos
    const images = validMedia.filter(m => m.type === 'image');
    const videos = getUniqueVideos(validMedia);
    mediaToDownload = [...images, ...videos];
  }

  if (mediaToDownload.length === 0) return;

  // Single file - download directly
  if (mediaToDownload.length === 1) {
    const media = mediaToDownload[0];
    if (isHLS(media.url) || media.type === 'hls') {
      downloadHLS(media.url, media.displayName || 'video');
    } else {
      downloadMedia(media.url, media.displayName || media.filename);
    }
    return;
  }

  // Multiple files - separate HLS from direct downloads
  const hlsMedia = mediaToDownload.filter(m => isHLS(m.url) || m.type === 'hls');
  const directMedia = mediaToDownload.filter(m => !isHLS(m.url) && m.type !== 'hls');

  // Download HLS streams individually (can't be bundled)
  hlsMedia.forEach((media, index) => {
    setTimeout(() => {
      downloadHLS(media.url, media.displayName || 'video');
    }, index * 1000);
  });

  // Handle direct downloads based on ZIP setting
  if (directMedia.length > 1 && settings.zipDownloads) {
    // Bundle into ZIP if setting is enabled
    await downloadAsZip(directMedia);
  } else {
    // Download individually
    directMedia.forEach((media, index) => {
      setTimeout(() => {
        downloadMedia(media.url, media.displayName || media.filename);
      }, index * 500);
    });
  }

  logToBackground('info', `Downloading ${type}`, {
    count: mediaToDownload.length,
    zip: directMedia.length > 1 && settings.zipDownloads
  });
}

// Legacy function for compatibility
function hideWarningModal() {
  hideDownloadModal();
}

function downloadAll() {
  downloadByType('all');
}

// Export logs for troubleshooting
// Generates industry-standard log file for support/debugging
async function exportLogs() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getLogs' });
    const logs = response?.logs || [];

    if (logs.length === 0) {
      alert('No logs available. Try using the extension first, then export.');
      return;
    }

    // Build log file header
    const header = [
      '# Media Downloader Debug Logs',
      `# Generated: ${new Date().toISOString()}`,
      `# Extension Version: 1.0.0`,
      `# Total Entries: ${logs.length}`,
      `# Browser: ${navigator.userAgent}`,
      '#',
      '# HOW TO USE THIS FILE:',
      '# Share this file with support when reporting issues.',
      '# It contains diagnostic info to help identify problems.',
      '#',
      '# FORMAT: [TIMESTAMP] [LEVEL] [SOURCE] MESSAGE {context}',
      '# LEVELS: DEBUG (verbose) < INFO < WARN < ERROR',
      '#',
      '=' .repeat(80),
      ''
    ].join('\n');

    // Format logs in standard format
    const logText = logs.map(log => {
      // Handle both old and new log formats
      const ts = log.ts || log.timestamp || '';
      const lvl = (log.lvl || log.level || 'INFO').toUpperCase().padEnd(5);
      const src = (log.src || log.source || 'unknown').padEnd(12);
      const msg = log.msg || log.message || '';

      // Format context/data
      let ctx = '';
      if (log.ctx && typeof log.ctx === 'object' && Object.keys(log.ctx).length > 0) {
        ctx = ' ' + JSON.stringify(log.ctx);
      } else if (log.data && log.data !== '{}') {
        ctx = ' ' + (typeof log.data === 'string' ? log.data : JSON.stringify(log.data));
      }

      return `[${ts}] [${lvl}] [${src}] ${msg}${ctx}`;
    }).join('\n');

    // Combine header and logs
    const fullContent = header + logText;

    // Create download - use octet-stream to prevent Chrome from changing extension
    const blob = new Blob([fullContent], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const filename = `media-downloader-logs-${new Date().toISOString().slice(0, 10)}.log`;

    chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: true,
      conflictAction: 'uniquify'
    });

    // Cleanup
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (err) {
    console.error('Failed to export logs:', err);
    alert('Failed to export logs: ' + err.message);
  }
}

// Log helper for popup context
function logToBackground(level, message, data = {}) {
  chrome.runtime.sendMessage({
    action: 'log',
    level,
    source: 'popup',
    message,
    data
  }).catch(() => {});
}

// Refresh page scan - rescans DOM without clearing network-detected media
async function refreshMedia() {
  const container = document.getElementById('media-list');
  container.innerHTML = '<div class="loading">Rescanning page...</div>';

  // Clear local popup state only
  allMedia = [];
  selectedUrls.clear();

  if (currentTabId) {
    // DO NOT clear background storage - it contains HLS streams from network interception
    // Only tell content script to clear its URL dedup cache and rescan DOM
    try {
      await chrome.tabs.sendMessage(currentTabId, { action: 'clearAndRescan' });
      // Brief wait for content script to send new items to background
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (e) {
      // Content script may not be loaded
    }
  }

  // Reload media - background still has HLS streams, content script provides fresh DOM scan
  await loadMedia();
  logToBackground('info', 'Manual refresh triggered');
}

// Clear cache for current tab
async function clearCache() {
  if (currentTabId) {
    try {
      await chrome.tabs.sendMessage(currentTabId, { action: 'clearAndRescan' });
    } catch (e) {
      // Ignore
    }
    await chrome.runtime.sendMessage({
      action: 'clearTabMedia',
      tabId: currentTabId
    });
  }

  allMedia = [];
  selectedUrls.clear();
  renderMediaList();
  logToBackground('info', 'Cache cleared');
}

// Settings panel handlers
function openSettings() {
  document.body.classList.add('settings-open');
  document.getElementById('settings-panel').classList.add('visible');
}

function closeSettings() {
  document.getElementById('settings-panel').classList.remove('visible');
  document.body.classList.remove('settings-open');
}

// Handle setting changes
function handleSettingChange(settingId, value) {
  switch (settingId) {
    case 'setting-auto-refresh':
      settings.autoRefresh = value;
      break;
    case 'setting-sort-order':
      settings.sortOrder = value;
      // Re-render with new sort order
      renderMediaList();
      break;
    case 'setting-zip-downloads':
      settings.zipDownloads = value;
      break;
    case 'setting-save-as':
      settings.saveAs = value;
      break;
    case 'setting-use-title':
      settings.useTitle = value;
      break;
    case 'setting-clean-names':
      settings.cleanNames = value;
      break;
    case 'setting-skip-small':
      settings.skipSmallImages = value;
      // Re-render to apply filter
      renderMediaList();
      break;
    case 'setting-min-size':
      settings.minSize = parseInt(value, 10);
      // Update display value
      const minSizeValueEl = document.getElementById('min-size-value');
      if (minSizeValueEl) minSizeValueEl.textContent = settings.minSize;
      // Re-render if skip-small is enabled
      if (settings.skipSmallImages) {
        renderMediaList();
      }
      break;
    case 'setting-hide-dupes':
      settings.hideDupes = value;
      // Re-render to apply deduplication
      renderMediaList();
      break;
  }
  saveSettings();
}

// Reset all settings to defaults
async function resetSettings() {
  settings = { ...DEFAULT_SETTINGS };
  await saveSettings();
  applySettingsToUI();
  // Reload to apply changes
  loadMedia();
  logToBackground('info', 'Settings reset to defaults');
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  logToBackground('info', 'Popup opened', { url: location.href, version: 'v2' });

  // Load settings first
  await loadSettings();

  // Load media
  loadMedia();

  // Filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.type;
      savePopupState();
      renderMediaList();
    });
  });

  // Header actions
  document.getElementById('refresh-btn').addEventListener('click', refreshMedia);
  document.getElementById('download-all-btn').addEventListener('click', showDownloadAllWarning);
  document.getElementById('settings-btn').addEventListener('click', openSettings);

  // Settings panel
  document.getElementById('settings-close').addEventListener('click', closeSettings);
  document.getElementById('export-logs-btn').addEventListener('click', exportLogs);
  document.getElementById('clear-cache-btn').addEventListener('click', async () => {
    await clearCache();
    closeSettings();
  });

  document.getElementById('flush-logs-btn').addEventListener('click', async () => {
    try {
      await chrome.runtime.sendMessage({ action: 'flushLogs' });
      alert('Logs cleared');
    } catch (e) {
      console.error('Failed to flush logs:', e);
    }
  });

  // Settings toggles (checkboxes)
  ['setting-show-all', 'setting-auto-refresh', 'setting-zip-downloads', 'setting-skip-small',
   'setting-save-as', 'setting-use-title', 'setting-clean-names', 'setting-hide-dupes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', (e) => handleSettingChange(id, e.target.checked));
    }
  });

  // Sort order dropdown
  const sortOrderEl = document.getElementById('setting-sort-order');
  if (sortOrderEl) {
    sortOrderEl.addEventListener('change', (e) => handleSettingChange('setting-sort-order', e.target.value));
  }

  // Minimum size slider
  const minSizeEl = document.getElementById('setting-min-size');
  if (minSizeEl) {
    minSizeEl.addEventListener('input', (e) => handleSettingChange('setting-min-size', e.target.value));
  }

  // Reset settings button
  document.getElementById('reset-settings-btn').addEventListener('click', async () => {
    if (confirm('Reset all settings to defaults?')) {
      await resetSettings();
    }
  });

  // Selection toolbar controls
  document.getElementById('download-selected-btn').addEventListener('click', downloadSelected);
  document.getElementById('clear-selection-btn').addEventListener('click', clearSelection);

  // Download modal controls
  document.getElementById('modal-close').addEventListener('click', hideDownloadModal);
  document.getElementById('download-images-btn').addEventListener('click', () => downloadByType('images'));
  document.getElementById('download-videos-btn').addEventListener('click', () => downloadByType('videos'));
  document.getElementById('download-both-btn').addEventListener('click', () => downloadByType('all'));

  // Cancel download controls
  document.getElementById('cancel-download-btn').addEventListener('click', showCancelModal);
  document.getElementById('cancel-modal-no').addEventListener('click', hideCancelModal);
  document.getElementById('cancel-modal-yes').addEventListener('click', cancelDownload);

  // Preview modal controls
  document.getElementById('preview-close').addEventListener('click', hidePreview);
  document.getElementById('preview-modal').addEventListener('click', (e) => {
    // Close when clicking outside the image
    if (e.target.id === 'preview-modal') {
      hidePreview();
    }
  });
});
