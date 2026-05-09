
import * as ImageManipulator from 'expo-image-manipulator';
import { detectMarker } from '../marker/detector';


const PROCESS_WIDTH = 400;

const OUTPUT_SIZE = 300;

/**   
 *
 * @param {string} photoUri    
 * @param {{ width: number, height: number }} photoSize
 * @returns {Promise<{ success: boolean, uri: string|null, processingTimeMs: number }>}
 */
export async function processMarkerImage(photoUri, photoSize) {
  const t0 = Date.now();

  try {
    const scaleW = PROCESS_WIDTH / photoSize.width;
    const processH = Math.round(photoSize.height * scaleW);

    const downscaled = await ImageManipulator.manipulateAsync(
      photoUri,
      [{ resize: { width: PROCESS_WIDTH, height: processH } }],
      {
        format: ImageManipulator.SaveFormat.JPEG,
        compress: 0.85,
        base64: true,
      }
    );

    if (!downscaled.base64 || downscaled.base64.length === 0) {
      return { success: false, uri: null, processingTimeMs: Date.now() - t0 };
    }

    const jpegBytes = base64ToUint8Array(downscaled.base64);

    const jpegJs = require('jpeg-js');
    let decoded;
    try {
      decoded = jpegJs.decode(jpegBytes, {
        useTArray: true,
        maxMemoryUsageInMB: 256,
      });
    } catch (decodeErr) {
      console.warn('[imageProcessor] JPEG decode failed:', decodeErr.message);
      return { success: false, uri: null, processingTimeMs: Date.now() - t0 };
    }
    const result = detectMarker(decoded.data, decoded.width, decoded.height);

    if (!result.found || !result.bbox) {
      return { success: false, uri: null, processingTimeMs: Date.now() - t0 };
    }

    const { bbox, orientation } = result;
    const invScaleW = photoSize.width / decoded.width;
    const invScaleH = photoSize.height / decoded.height;

    const origX = Math.max(0, Math.round(bbox.x * invScaleW));
    const origY = Math.max(0, Math.round(bbox.y * invScaleH));
    const origW = Math.min(
      photoSize.width - origX,
      Math.round(bbox.w * invScaleW)
    );
    const origH = Math.min(
      photoSize.height - origY,
      Math.round(bbox.h * invScaleH)
    );
    if (origW < 10 || origH < 10) {
      return { success: false, uri: null, processingTimeMs: Date.now() - t0 };
    }
    const actions = [
      { crop: { originX: origX, originY: origY, width: origW, height: origH } },
    ];

    if (orientation !== 0) {
      actions.push({ rotate: orientation });
    }

    actions.push({ resize: { width: OUTPUT_SIZE, height: OUTPUT_SIZE } });

    const processed = await ImageManipulator.manipulateAsync(
      photoUri,
      actions,
      { format: ImageManipulator.SaveFormat.JPEG, compress: 0.93 }
    );

    return {
      success: true,
      uri: processed.uri,
      processingTimeMs: Date.now() - t0,
    };
  } catch (err) {
    console.error('[imageProcessor] Unexpected error:', err.message);
    return { success: false, uri: null, processingTimeMs: Date.now() - t0 };
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
 * Decode a base64 string to a Uint8Array.
 * Works in React Native (Hermes), no browser APIs required.
 * @param {string} b64 Base64-encoded string (with or without data-URI prefix)
 * @returns {Uint8Array}
 */
function base64ToUint8Array(b64) {
  
  const comma = b64.indexOf(',');
  if (comma >= 0) b64 = b64.slice(comma + 1);

  
  b64 = b64.replace(/[^A-Za-z0-9+/]/g, '');

  const len = b64.length;
  let bufLen = Math.floor((len * 3) / 4);
  if (b64[len - 1] === '=') bufLen--;
  if (b64[len - 2] === '=') bufLen--;

  const out = new Uint8Array(bufLen);
  let p = 0;

  for (let i = 0; i < len; i += 4) {
    const e0 = B64_LOOKUP[b64.charCodeAt(i)] ?? 0;
    const e1 = B64_LOOKUP[b64.charCodeAt(i + 1)] ?? 0;
    const e2 = B64_LOOKUP[b64.charCodeAt(i + 2)] ?? 0;
    const e3 = B64_LOOKUP[b64.charCodeAt(i + 3)] ?? 0;

    if (p < bufLen) out[p++] = (e0 << 2) | (e1 >> 4);
    if (p < bufLen) out[p++] = ((e1 & 0xf) << 4) | (e2 >> 2);
    if (p < bufLen) out[p++] = ((e2 & 0x3) << 6) | e3;
  }

  return out;
}
