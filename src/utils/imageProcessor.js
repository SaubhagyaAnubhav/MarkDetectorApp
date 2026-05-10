import * as ImageManipulator from 'expo-image-manipulator';
import { detectMarker } from '../marker/detector';

const jpegJs = require('jpeg-js');



const PROCESS_WIDTH = 400;
const OUTPUT_SIZE   = 300;  



/**
 * Race a promise against a timeout.
 * @param {Promise<any>} promise
 * @param {number} ms
 */
function withTimeout(promise, ms) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms)
  );
  return Promise.race([promise, timeout]);
}



/**
 * 
 *
 * @param {string}                          photoUri
 * @param {{ width: number, height: number }} photoSize
 * @param {1|2}                             markerType  
 * @returns {Promise<{
 *   success         : boolean,
 *   uri             : string | null,
 *   processingTimeMs: number,
 *   orientation     : number,        // 0 | 90 | 180 | 270
 *   isCorrect       : boolean,       // from detector — false when marker is malformed
 *   reason          : string,        // human-readable reason when isCorrect=false
 * }>}
 */
export async function processMarkerImage(photoUri, photoSize, markerType = 1) {
  const t0 = Date.now();

  const fail = (extra = {}) => ({
    success: false,
    uri: null,
    processingTimeMs: Date.now() - t0,
    orientation: 0,
    isCorrect: false,
    reason: '',
    ...extra,
  });

  try {
    
    const minSide = Math.min(photoSize.width, photoSize.height);
    const cropSz  = Math.round(minSide * 0.75);  
    const cropX   = Math.round((photoSize.width  - cropSz) / 2);
    const cropY   = Math.round((photoSize.height - cropSz) / 2);

    const downscaled = await withTimeout(
      ImageManipulator.manipulateAsync(
        photoUri,
        [
          { crop: { originX: cropX, originY: cropY, width: cropSz, height: cropSz } },
          { resize: { width: PROCESS_WIDTH, height: PROCESS_WIDTH } },
        ],
        {
          format: ImageManipulator.SaveFormat.JPEG,
          compress: 0.82,  
          base64: true,
        }
      ),
      5000
    );

    if (!downscaled.base64 || downscaled.base64.length === 0) {
      console.warn('[imageProcessor] Empty base64 from downscale');
      return fail();
    }

    
    const jpegBytes = base64ToUint8Array(downscaled.base64);

    let decoded;
    try {
      decoded = jpegJs.decode(jpegBytes, {
        useTArray: true,
        maxMemoryUsageInMB: 64,
      });
    } catch (decodeErr) {
      console.warn('[imageProcessor] JPEG decode failed:', decodeErr.message);
      return fail();
    }

    
    const result = detectMarker(decoded.data, decoded.width, decoded.height, markerType);

    if (!result.found || !result.bbox) {
      console.log('[imageProcessor] No marker found in frame');
      return fail();
    }

    const { bbox, orientation, isCorrect, reason } = result;

    
    const scale = cropSz / PROCESS_WIDTH;

    const origX = cropX + Math.max(0, Math.round(bbox.x * scale));
    const origY = cropY + Math.max(0, Math.round(bbox.y * scale));
    const origW = Math.min(photoSize.width  - origX, Math.round(bbox.w * scale));
    const origH = Math.min(photoSize.height - origY, Math.round(bbox.h * scale));

    if (origW < 10 || origH < 10) {
      console.warn('[imageProcessor] Bbox too small after scaling');
      return fail({ isCorrect, reason });
    }

    
    const actions = [
      { crop: { originX: origX, originY: origY, width: origW, height: origH } },
    ];

       
    if (markerType === 1 && orientation !== 0) {
      actions.push({ rotate: orientation });
    }

    actions.push({ resize: { width: OUTPUT_SIZE, height: OUTPUT_SIZE } });

    const processed = await withTimeout(
      ImageManipulator.manipulateAsync(
        photoUri,
        actions,
        { format: ImageManipulator.SaveFormat.JPEG, compress: 0.95 }
      ),
      5000
    );

    console.log(
      `[imageProcessor] Done — markerType=${markerType}` +
      ` orientation=${orientation} isCorrect=${isCorrect}` +
      ` time=${Date.now() - t0}ms`
    );

    return {
      success:          true,
      uri:              processed.uri,
      processingTimeMs: Date.now() - t0,
      orientation:      orientation ?? 0,
      isCorrect:        isCorrect   ?? true,
      reason:           reason      ?? '',
    };

  } catch (err) {
    console.error('[imageProcessor] Unexpected error:', err.message);
    return fail();
  }
}



const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const B64_LOOKUP = (() => {
  const lookup = new Uint8Array(256);
  for (let i = 0; i < B64_CHARS.length; i++) {
    lookup[B64_CHARS.charCodeAt(i)] = i;
  }
  return lookup;
})();

/**
 * 
 * @param {string} b64
 * @returns {Uint8Array}
 */
function base64ToUint8Array(b64) {
 
  const comma = b64.indexOf(',');
  if (comma >= 0) b64 = b64.slice(comma + 1);

  const padCount = (b64.match(/=/g) || []).length;
  b64 = b64.replace(/[^A-Za-z0-9+/]/g, '');

  const len    = b64.length;
  const bufLen = Math.floor((len * 3) / 4) - padCount;
  const out    = new Uint8Array(bufLen);
  let p = 0;

  for (let i = 0; i < len; i += 4) {
    const e0 = B64_LOOKUP[b64.charCodeAt(i)]     ?? 0;
    const e1 = B64_LOOKUP[b64.charCodeAt(i + 1)] ?? 0;
    const e2 = B64_LOOKUP[b64.charCodeAt(i + 2)] ?? 0;
    const e3 = B64_LOOKUP[b64.charCodeAt(i + 3)] ?? 0;

    if (p < bufLen) out[p++] = (e0 << 2) | (e1 >> 4);
    if (p < bufLen) out[p++] = ((e1 & 0xf) << 4) | (e2 >> 2);
    if (p < bufLen) out[p++] = ((e2 & 0x3) << 6) | e3;
  }

  return out;
}