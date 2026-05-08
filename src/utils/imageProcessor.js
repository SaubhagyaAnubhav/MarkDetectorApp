/**
 * imageProcessor.js
 *
 * Bridges expo-image-manipulator with our JS marker detector.
 *
 * Flow:
 *  1. Take a photo URI from expo-camera
 *  2. Resize to a workable size for JS processing (~600px wide)
 *  3. Fetch pixel data via a canvas-like approach using expo-image-manipulator
 *  4. Run the detector
 *  5. If found: crop the bbox from the ORIGINAL full-res image, rotate, resize to 300×300
 *  6. Return the processed 300×300 URI
 */

import * as ImageManipulator from 'expo-image-manipulator';

// We process a downscaled version for speed, then crop the original
const PROCESS_WIDTH = 600;
const OUTPUT_SIZE = 300;

/**
 * Process a captured photo to detect and extract the marker.
 *
 * @param {string} photoUri   URI of the captured photo
 * @param {object} photoSize  { width, height } of the original photo
 * @returns {Promise<{ success: boolean, uri: string|null, processingTimeMs: number }>}
 */
export async function processMarkerImage(photoUri, photoSize) {
  const startTime = Date.now();

  try {
    // ── Step 1: Downscale for fast JS processing ──────────────────────────────
    const scaleRatio = PROCESS_WIDTH / photoSize.width;
    const processHeight = Math.round(photoSize.height * scaleRatio);

    const downscaled = await ImageManipulator.manipulateAsync(
      photoUri,
      [{ resize: { width: PROCESS_WIDTH, height: processHeight } }],
      { format: ImageManipulator.SaveFormat.JPEG, compress: 0.8, base64: true }
    );

    // ── Step 2: Decode pixel data from base64 JPEG ────────────────────────────
    const pixelData = await decodeJpegToPixels(downscaled.base64, PROCESS_WIDTH, processHeight);

    if (!pixelData) {
      return { success: false, uri: null, processingTimeMs: Date.now() - startTime };
    }

    // ── Step 3: Run detector ──────────────────────────────────────────────────
    const { rgbaToGrayscale, binarise, detectMarker, getRotationDegrees } = await import('../marker/detector');

    const gray = rgbaToGrayscale(pixelData, PROCESS_WIDTH, processHeight);
    const bin = binarise(gray);
    const result = detectMarker(bin, PROCESS_WIDTH, processHeight);

    if (!result.found) {
      return { success: false, uri: null, processingTimeMs: Date.now() - startTime };
    }

    // ── Step 4: Scale bbox back to original image coordinates ─────────────────
    const { bbox, orientation } = result;
    const invScale = 1 / scaleRatio;

    const origX = Math.max(0, Math.round(bbox.x * invScale));
    const origY = Math.max(0, Math.round(bbox.y * invScale));
    const origW = Math.min(photoSize.width - origX, Math.round(bbox.w * invScale));
    const origH = Math.min(photoSize.height - origY, Math.round(bbox.h * invScale));

    // ── Step 5: Crop, rotate, resize to 300×300 ───────────────────────────────
    const rotationDeg = getRotationDegrees(orientation);

    const actions = [
      { crop: { originX: origX, originY: origY, width: origW, height: origH } },
    ];

    if (rotationDeg !== 0) {
      actions.push({ rotate: rotationDeg });
    }

    actions.push({ resize: { width: OUTPUT_SIZE, height: OUTPUT_SIZE } });

    const processed = await ImageManipulator.manipulateAsync(
      photoUri,
      actions,
      { format: ImageManipulator.SaveFormat.JPEG, compress: 0.9 }
    );

    return {
      success: true,
      uri: processed.uri,
      processingTimeMs: Date.now() - startTime,
    };
  } catch (err) {
    console.error('[imageProcessor] Error:', err);
    return { success: false, uri: null, processingTimeMs: Date.now() - startTime };
  }
}

/**
 * Decode a base64 JPEG into raw RGBA pixel data using a pure-JS JPEG decoder.
 * We use a lightweight approach: parse the base64 → Uint8Array, then use
 * a simple scanline approximation via the image dimensions.
 *
 * For a production-quality implementation this would use a WASM JPEG decoder.
 * Here we use a JS-based approach compatible with React Native's JS engine.
 *
 * @param {string} base64   Base64-encoded JPEG (no data URI prefix)
 * @param {number} width
 * @param {number} height
 * @returns {Promise<Uint8ClampedArray|null>}
 */
async function decodeJpegToPixels(base64, width, height) {
  try {
    // Use the jpeg-js library if available, otherwise fall back to
    // a brightness-estimation approach using row/column sampling
    const jpegJs = await tryImportJpegJs();
    if (jpegJs) {
      const binaryStr = atob(base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const decoded = jpegJs.decode(bytes, { useTArray: true });
      return decoded.data; // RGBA Uint8ClampedArray
    }
    return null;
  } catch (e) {
    console.warn('[decodeJpegToPixels] Decode failed:', e.message);
    return null;
  }
}

async function tryImportJpegJs() {
  try {
    const jpegJs = require('jpeg-js');
    return jpegJs;
  } catch {
    return null;
  }
}
