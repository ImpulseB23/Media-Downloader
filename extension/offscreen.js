// Offscreen document for HLS downloading and FFmpeg processing
// This persists even when popup closes

// Debug logging helper
function debugLog(action, data = {}) {
  try {
    chrome.runtime.sendMessage({
      action: 'debugLog',
      source: 'offscreen',
      logAction: action,
      data
    }).catch(() => {});
    console.log(`[offscreen] ${action}:`, data);
  } catch (e) {
    console.error('Debug log failed:', e);
  }
}

debugLog('OFFSCREEN_LOADED', { time: Date.now() });

let ffmpegInstance = null;
let ffmpegLoading = false;
let activeDownloads = new Map();

// Track AbortControllers for cancellation
const downloadAbortControllers = new Map();

// Track blob URLs pending download completion
const pendingBlobs = new Map();

// Initialize FFmpeg with timeout
async function initFFmpeg() {
  if (ffmpegInstance) return ffmpegInstance;
  if (ffmpegLoading) {
    debugLog('FFMPEG_WAITING', { alreadyLoading: true });
    // Wait up to 30 seconds for existing load
    let waited = 0;
    while (ffmpegLoading && waited < 30000) {
      await new Promise(r => setTimeout(r, 100));
      waited += 100;
    }
    if (ffmpegInstance) return ffmpegInstance;
    throw new Error('FFmpeg load timeout');
  }

  debugLog('FFMPEG_LOAD_START', {});
  ffmpegLoading = true;

  try {
    const { FFmpeg } = FFmpegWASM;
    ffmpegInstance = new FFmpeg();

    ffmpegInstance.on('log', ({ message }) => {
      console.log('[ffmpeg]', message);
    });

    // Add timeout for loading (30 seconds)
    const loadPromise = ffmpegInstance.load({
      coreURL: chrome.runtime.getURL('ffmpeg-core.js'),
      wasmURL: chrome.runtime.getURL('ffmpeg-core.wasm'),
    });

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('FFmpeg load timeout (30s)')), 30000);
    });

    await Promise.race([loadPromise, timeoutPromise]);

    debugLog('FFMPEG_LOADED', { success: true });
    return ffmpegInstance;
  } catch (e) {
    debugLog('FFMPEG_LOAD_FAILED', { error: e.message });
    ffmpegInstance = null;
    throw e;
  } finally {
    ffmpegLoading = false;
  }
}

// Convert TS to MP4 using FFmpeg
async function convertToMp4(tsData) {
  debugLog('FFMPEG_CONVERT_START', { inputSize: tsData.byteLength });

  const ffmpeg = await initFFmpeg();

  await ffmpeg.writeFile('input.ts', tsData);
  debugLog('FFMPEG_FILE_WRITTEN', { size: tsData.byteLength });

  await ffmpeg.exec([
    '-i', 'input.ts',
    '-c', 'copy',
    '-movflags', '+faststart',
    'output.mp4'
  ]);
  debugLog('FFMPEG_EXEC_DONE', {});

  const data = await ffmpeg.readFile('output.mp4');
  debugLog('FFMPEG_OUTPUT_READ', { outputSize: data.byteLength });

  await ffmpeg.deleteFile('input.ts');
  await ffmpeg.deleteFile('output.mp4');

  return data;
}

// Parse M3U8 playlist
async function parseM3U8(url, headers = {}) {
  debugLog('M3U8_FETCH_START', { url: url.slice(0, 100) });
  const response = await fetch(url, {
    headers: headers,
    credentials: 'include'
  });
  debugLog('M3U8_FETCH_RESPONSE', { status: response.status, ok: response.ok });
  const text = await response.text();
  debugLog('M3U8_CONTENT', { length: text.length, preview: text.slice(0, 300) });
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);

  // Extract base URL properly - remove query string before finding last slash
  const urlWithoutQuery = url.split('?')[0];
  const baseUrl = urlWithoutQuery.substring(0, urlWithoutQuery.lastIndexOf('/') + 1);
  debugLog('M3U8_PARSED_LINES', { lineCount: lines.length, baseUrl });

  const segments = [];
  let isMaster = false;
  let variants = [];
  let isEncrypted = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for encryption (AES-128, SAMPLE-AES, etc.)
    if (line.startsWith('#EXT-X-KEY') && !line.includes('METHOD=NONE')) {
      isEncrypted = true;
    }

    // Check for fMP4 format - handle both quoted and unquoted URI
    if (line.includes('#EXT-X-MAP')) {
      const uriMatch = line.match(/URI=["']?([^"',\s]+)["']?/);
      if (uriMatch) {
        const initUrl = uriMatch[1].startsWith('http') ? uriMatch[1] : baseUrl + uriMatch[1];
        segments.push({ url: initUrl, isInit: true });
      }
    }

    // Check if master playlist
    if (line.startsWith('#EXT-X-STREAM-INF')) {
      isMaster = true;
      const nextLine = lines[i + 1];
      if (nextLine && !nextLine.startsWith('#')) {
        const bandwidth = line.match(/BANDWIDTH=(\d+)/);
        const resolution = line.match(/RESOLUTION=(\d+x\d+)/);
        const variantUrl = nextLine.startsWith('http') ? nextLine : baseUrl + nextLine;
        variants.push({
          url: variantUrl,
          bandwidth: bandwidth ? parseInt(bandwidth[1]) : 0,
          resolution: resolution ? resolution[1] : 'unknown'
        });
      }
    }

    // Get media segments
    if (line.startsWith('#EXTINF')) {
      const nextLine = lines[i + 1];
      if (nextLine && !nextLine.startsWith('#')) {
        const segmentUrl = nextLine.startsWith('http') ? nextLine : baseUrl + nextLine;
        segments.push({ url: segmentUrl, isInit: false });
      }
    }
  }

  debugLog('M3U8_PARSE_RESULT', {
    isMaster,
    variantsCount: variants.length,
    segmentsCount: segments.length,
    isEncrypted,
    firstSegments: segments.slice(0, 3).map(s => s.url.slice(-50))
  });
  return { isMaster, variants, segments, isEncrypted };
}

// Download segments in parallel batches with cancellation support
async function downloadSegmentsParallel(segments, concurrency, headers, onProgress, abortSignal) {
  debugLog('SEGMENTS_DOWNLOAD_START', {
    segmentCount: segments.length,
    concurrency,
    headersKeys: Object.keys(headers)
  });
  const results = new Array(segments.length);
  let completed = 0;
  let currentIndex = 0;
  let totalSize = 0;

  async function downloadNext() {
    while (currentIndex < segments.length) {
      // Check if cancelled
      if (abortSignal?.aborted) {
        throw new DOMException('Download cancelled', 'AbortError');
      }

      const index = currentIndex++;
      const segment = segments[index];

      try {
        debugLog('SEGMENT_FETCH', { index, url: segment.url.slice(0, 120), isInit: segment.isInit });
        const response = await fetch(segment.url, {
          headers: headers,
          credentials: 'include',
          signal: abortSignal
        });
        debugLog('SEGMENT_RESPONSE', { index, status: response.status, ok: response.ok });
        if (response.ok) {
          const buffer = await response.arrayBuffer();
          debugLog('SEGMENT_DATA', { index, size: buffer.byteLength });
          totalSize += buffer.byteLength;
          results[index] = { data: new Uint8Array(buffer), isInit: segment.isInit };
        } else {
          console.warn(`Segment ${index} failed: HTTP ${response.status}`);
          results[index] = null;
        }
      } catch (e) {
        if (e.name === 'AbortError') {
          throw e; // Re-throw abort errors
        }
        console.warn(`Segment ${index} failed:`, e);
        results[index] = null;
      }

      completed++;
      onProgress(completed, segments.length);
    }
  }

  // Start concurrent downloads
  const workers = [];
  for (let i = 0; i < Math.min(concurrency, segments.length); i++) {
    workers.push(downloadNext());
  }

  await Promise.all(workers);

  const validResults = results.filter(r => r !== null && r !== undefined);
  debugLog('SEGMENTS_DOWNLOAD_COMPLETE', {
    totalResults: results.length,
    validResults: validResults.length,
    nullResults: results.filter(r => r === null).length,
    undefinedResults: results.filter(r => r === undefined).length,
    totalSize
  });

  return results;
}

// Main HLS download function
async function downloadHLS(downloadId, url, filename, headers = {}) {
  debugLog('HLS_DOWNLOAD_START', { downloadId, url: url.slice(0, 80), filename });

  // Create AbortController for this download
  const abortController = new AbortController();
  downloadAbortControllers.set(downloadId, abortController);

  const download = {
    id: downloadId,
    status: 'starting',
    progress: 0,
    message: 'Preparing download...'
  };
  activeDownloads.set(downloadId, download);
  sendProgress(download);

  try {
    debugLog('HLS_PARSING_PLAYLIST', { url: url.slice(0, 80) });
    let playlist = await parseM3U8(url, headers);
    debugLog('HLS_PLAYLIST_PARSED', {
      isMaster: playlist.isMaster,
      variants: playlist.variants?.length,
      segments: playlist.segments?.length,
      isEncrypted: playlist.isEncrypted
    });

    // Check for encryption
    if (playlist.isEncrypted) {
      throw new Error('Encrypted streams are not supported. The video uses DRM protection.');
    }

    // If master playlist, get best quality variant
    if (playlist.isMaster && playlist.variants.length > 0) {
      download.message = 'Selecting best quality...';
      sendProgress(download);

      // Sort by resolution first (if available), then bandwidth
      playlist.variants.sort((a, b) => {
        if (a.resolution !== 'unknown' && b.resolution !== 'unknown') {
          const [aw, ah] = a.resolution.split('x').map(Number);
          const [bw, bh] = b.resolution.split('x').map(Number);
          if (ah !== bh) return bh - ah;
        }
        return b.bandwidth - a.bandwidth;
      });

      const bestVariant = playlist.variants[0];
      download.message = `Quality: ${bestVariant.resolution}`;
      sendProgress(download);
      playlist = await parseM3U8(bestVariant.url, headers);

      // Check encryption again for variant playlist
      if (playlist.isEncrypted) {
        throw new Error('Encrypted streams are not supported. The video uses DRM protection.');
      }
    }

    const segments = playlist.segments;
    if (segments.length === 0) {
      throw new Error('No video data found');
    }

    download.status = 'downloading';
    download.message = 'Downloading...';
    sendProgress(download);

    // Download segments in parallel (5 concurrent) with cancellation support
    const results = await downloadSegmentsParallel(segments, 5, headers, (completed, total) => {
      download.progress = Math.round((completed / total) * 80);
      download.message = `Downloading... ${download.progress}%`;
      sendProgress(download);
    }, abortController.signal);

    // Separate init segment and data chunks
    let initSegment = null;
    const chunks = [];

    debugLog('PROCESSING_RESULTS', { resultsLength: results.length });
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result) {
        if (result.isInit) {
          initSegment = result.data;
          debugLog('FOUND_INIT_SEGMENT', { index: i, size: result.data?.byteLength });
        } else {
          chunks.push(result.data);
        }
      } else {
        debugLog('NULL_RESULT', { index: i, value: result });
      }
    }
    debugLog('CHUNKS_COLLECTED', { chunkCount: chunks.length, hasInit: !!initSegment });

    download.progress = 85;
    download.message = 'Processing...';
    sendProgress(download);

    // Merge chunks
    let totalLength = chunks.reduce((acc, chunk) => acc + chunk.byteLength, 0);
    if (initSegment) {
      totalLength += initSegment.byteLength;
    }

    const merged = new Uint8Array(totalLength);
    let offset = 0;

    if (initSegment) {
      merged.set(initSegment, offset);
      offset += initSegment.byteLength;
    }

    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }

    debugLog('SEGMENTS_MERGED', { totalLength, chunksCount: chunks.length, hasInit: !!initSegment });

    // Convert if needed
    let finalData;
    if (initSegment) {
      // Already fMP4 format
      download.message = 'Finalizing MP4...';
      sendProgress(download);
      finalData = merged;
    } else {
      // TS format - convert to MP4
      download.progress = 90;
      download.message = 'Converting to MP4...';
      sendProgress(download);

      try {
        finalData = await convertToMp4(merged);
      } catch (e) {
        console.error('FFmpeg conversion failed:', e);
        download.message = 'Conversion failed, saving as TS';
        sendProgress(download);
        finalData = merged;
        filename = filename.replace(/\.mp4$/i, '.ts');
      }
    }

    download.progress = 95;
    download.message = 'Saving file...';
    sendProgress(download);

    debugLog('CREATING_BLOB', { finalDataSize: finalData.byteLength, filename });

    // Convert to blob URL and download
    const blob = new Blob([finalData], { type: 'video/mp4' });
    debugLog('BLOB_CREATED', { blobSize: blob.size });

    const blobUrl = URL.createObjectURL(blob);
    const blobId = `blob_${Date.now()}_${downloadId}`;
    debugLog('BLOB_URL_CREATED', { blobUrl: blobUrl.slice(0, 50), blobId });

    // Track this blob for cleanup after download completes
    pendingBlobs.set(blobId, blobUrl);

    // Send download request to background and wait for response
    try {
      debugLog('SENDING_DOWNLOAD_REQUEST', { filename, blobId });
      const response = await chrome.runtime.sendMessage({
        action: 'downloadFromOffscreen',
        url: blobUrl,
        filename: filename,
        blobId: blobId
      });
      debugLog('DOWNLOAD_RESPONSE', { success: response?.success, error: response?.error });

      if (response?.success) {
        download.status = 'complete';
        download.progress = 100;
        download.message = 'Complete!';
        sendProgress(download);
      } else {
        throw new Error(response?.error || 'Download failed to start');
      }
    } catch (err) {
      // If download request failed, clean up blob immediately
      URL.revokeObjectURL(blobUrl);
      pendingBlobs.delete(blobId);
      throw err;
    }

    // Cleanup download tracking after delay (blob cleanup handled by downloadComplete message)
    setTimeout(() => {
      activeDownloads.delete(downloadId);
      // Fallback cleanup if downloadComplete never received (60 seconds)
      setTimeout(() => {
        if (pendingBlobs.has(blobId)) {
          URL.revokeObjectURL(pendingBlobs.get(blobId));
          pendingBlobs.delete(blobId);
        }
      }, 60000);
    }, 2000);

  } catch (error) {
    // Handle cancellation
    if (error.name === 'AbortError') {
      debugLog('HLS_DOWNLOAD_CANCELLED', { downloadId });
      download.status = 'cancelled';
      download.message = 'Download cancelled';
      sendProgress(download);
    } else {
      debugLog('HLS_DOWNLOAD_ERROR', { downloadId, error: error.message });
      download.status = 'error';
      download.message = error.message;
      sendProgress(download);
      console.error('Download error:', error);
    }
  } finally {
    // Clean up abort controller
    downloadAbortControllers.delete(downloadId);
  }
}

// Send progress update to popup
function sendProgress(download) {
  chrome.runtime.sendMessage({
    action: 'hlsProgress',
    download: {
      id: download.id,
      status: download.status,
      progress: download.progress,
      message: download.message
    }
  }).catch(() => {
    // Popup might be closed, ignore
  });
}

// Direct video download using fetch (for sites that block direct downloads like YouTube)
async function downloadDirect(downloadId, url, filename, headers = {}, pageUrl = '') {
  debugLog('DIRECT_DOWNLOAD_START', { downloadId, url: url.slice(0, 100), filename });

  // Create AbortController for this download
  const abortController = new AbortController();
  downloadAbortControllers.set(downloadId, abortController);

  const download = {
    id: downloadId,
    status: 'starting',
    progress: 0,
    message: 'Starting download...'
  };
  activeDownloads.set(downloadId, download);
  sendProgress(download);

  try {
    // Build headers - include referer from the page
    const fetchHeaders = { ...headers };
    if (pageUrl && !fetchHeaders['Referer']) {
      fetchHeaders['Referer'] = pageUrl;
    }

    download.message = 'Fetching video...';
    sendProgress(download);

    debugLog('DIRECT_FETCH_START', { url: url.slice(0, 100), headers: Object.keys(fetchHeaders) });

    const response = await fetch(url, {
      headers: fetchHeaders,
      credentials: 'include',
      mode: 'cors',
      signal: abortController.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentLength = response.headers.get('content-length');
    const totalSize = contentLength ? parseInt(contentLength, 10) : 0;

    debugLog('DIRECT_FETCH_RESPONSE', { status: response.status, contentLength: totalSize });

    // Read the response as stream to show progress
    const reader = response.body.getReader();
    const chunks = [];
    let receivedLength = 0;

    download.status = 'downloading';

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      chunks.push(value);
      receivedLength += value.length;

      if (totalSize > 0) {
        download.progress = Math.round((receivedLength / totalSize) * 90);
        const sizeMB = (receivedLength / (1024 * 1024)).toFixed(1);
        const totalMB = (totalSize / (1024 * 1024)).toFixed(1);
        download.message = `Downloading... ${sizeMB}/${totalMB} MB`;
      } else {
        const sizeMB = (receivedLength / (1024 * 1024)).toFixed(1);
        download.message = `Downloading... ${sizeMB} MB`;
        download.progress = Math.min(80, download.progress + 1);
      }
      sendProgress(download);
    }

    debugLog('DIRECT_FETCH_COMPLETE', { receivedLength, chunks: chunks.length });

    download.progress = 95;
    download.message = 'Saving file...';
    sendProgress(download);

    // Combine chunks
    const blob = new Blob(chunks, { type: 'video/mp4' });
    const blobUrl = URL.createObjectURL(blob);
    const blobId = `blob_${Date.now()}_${downloadId}`;

    debugLog('DIRECT_BLOB_CREATED', { blobSize: blob.size, blobId });

    pendingBlobs.set(blobId, blobUrl);

    const downloadResponse = await chrome.runtime.sendMessage({
      action: 'downloadFromOffscreen',
      url: blobUrl,
      filename: filename,
      blobId: blobId
    });

    if (downloadResponse?.success) {
      download.status = 'complete';
      download.progress = 100;
      download.message = 'Complete!';
      sendProgress(download);
    } else {
      throw new Error(downloadResponse?.error || 'Download failed');
    }

    setTimeout(() => {
      activeDownloads.delete(downloadId);
      setTimeout(() => {
        if (pendingBlobs.has(blobId)) {
          URL.revokeObjectURL(pendingBlobs.get(blobId));
          pendingBlobs.delete(blobId);
        }
      }, 60000);
    }, 2000);

  } catch (error) {
    // Handle cancellation
    if (error.name === 'AbortError') {
      debugLog('DIRECT_DOWNLOAD_CANCELLED', { downloadId });
      download.status = 'cancelled';
      download.message = 'Download cancelled';
      sendProgress(download);
    } else {
      debugLog('DIRECT_DOWNLOAD_ERROR', { downloadId, error: error.message });
      download.status = 'error';
      download.message = `Failed: ${error.message}`;
      sendProgress(download);
      console.error('Direct download error:', error);
    }
  } finally {
    // Clean up abort controller
    downloadAbortControllers.delete(downloadId);
  }
}

// Cancel an active download - actually aborts fetch requests
function cancelDownload(downloadId) {
  debugLog('CANCEL_DOWNLOAD_REQUESTED', { downloadId });

  // Abort the fetch requests
  const abortController = downloadAbortControllers.get(downloadId);
  if (abortController) {
    abortController.abort();
    downloadAbortControllers.delete(downloadId);
    debugLog('DOWNLOAD_ABORTED', { downloadId });
  }

  const download = activeDownloads.get(downloadId);
  if (download) {
    download.status = 'cancelled';
    download.message = 'Download cancelled';
    sendProgress(download);
    activeDownloads.delete(downloadId);
  }
}

// Listen for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Listen for the offscreen-specific action from background
  if (message.action === 'offscreen_startHLSDownload') {
    const downloadId = Date.now().toString();
    downloadHLS(downloadId, message.url, message.filename, message.headers || {});
    sendResponse({ downloadId });
    return true;
  }

  if (message.action === 'offscreen_startDirectDownload') {
    const downloadId = Date.now().toString();
    downloadDirect(downloadId, message.url, message.filename, message.headers || {}, message.pageUrl || '');
    sendResponse({ downloadId });
    return true;
  }

  if (message.action === 'cancelHLSDownload') {
    cancelDownload(message.downloadId);
    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'getDownloadStatus') {
    const download = activeDownloads.get(message.downloadId);
    sendResponse({ download: download || null });
    return true;
  }

  if (message.action === 'getAllDownloads') {
    const downloads = Array.from(activeDownloads.values());
    sendResponse({ downloads });
    return true;
  }

  // Handle download completion notification from background
  if (message.action === 'downloadComplete') {
    const blobUrl = pendingBlobs.get(message.blobId);
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      pendingBlobs.delete(message.blobId);
      console.log(`Blob cleaned up: ${message.blobId}, success: ${message.success}`);
    }
    return false;
  }

  return false;
});

console.log('Offscreen document ready');
