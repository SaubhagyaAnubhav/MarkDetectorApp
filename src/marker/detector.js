/**
 * Marker Detection Logic
 *
 * Target Marker (Marker 1 from assignment):
 * - Square overall shape
 * - Thick black outer border (~15% of marker width on each side)
 * - Solid black filled square in the TOP-LEFT corner of the border
 *   (acts as orientation anchor — unique among the 4 corners)
 * - Large white interior (~60%+ of area)
 *
 * Detection pipeline:
 * 1. Convert image pixels to grayscale
 * 2. Threshold to binary (black/white)
 * 3. Find connected components (blobs)
 * 4. Filter for large square-ish blobs (the outer border region)
 * 5. Validate the corner anchor (filled square in top-left)
 * 6. Determine orientation from anchor position
 * 7. Return bounding quad for perspective correction
 */

// ─── Constants ────────────────────────────────────────────────────────────────

// Fraction of marker side that the border occupies (each side)
const BORDER_RATIO = 0.15;
// The corner anchor square occupies roughly this fraction of the marker side
const ANCHOR_RATIO = 0.20;
// Tolerance for squareness check (aspect ratio must be within this of 1.0)
const SQUARENESS_TOLERANCE = 0.25;
// Minimum fraction of image area a candidate blob must occupy
const MIN_AREA_FRACTION = 0.03;
// Maximum fraction of image area a candidate blob must occupy
const MAX_AREA_FRACTION = 0.90;
// How dark a pixel must be to count as "black" (0–255)
const BLACK_THRESHOLD = 80;
// Interior white ratio — the inside of the marker must be mostly white
const MIN_INTERIOR_WHITE_RATIO = 0.55;

// ─── Pixel helpers ────────────────────────────────────────────────────────────

/**
 * Convert RGBA pixel data to a flat grayscale Uint8Array.
 * @param {Uint8ClampedArray} rgba  Raw RGBA pixel data
 * @param {number} width
 * @param {number} height
 * @returns {Uint8Array}
 */
export function rgbaToGrayscale(rgba, width, height) {
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    // Luminance formula
    gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }
  return gray;
}

/**
 * Binarise grayscale image: pixels <= threshold → 0 (black), else → 255 (white).
 * @param {Uint8Array} gray
 * @param {number} threshold
 * @returns {Uint8Array}
 */
export function binarise(gray, threshold = BLACK_THRESHOLD) {
  const bin = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) {
    bin[i] = gray[i] <= threshold ? 0 : 255;
  }
  return bin;
}

// ─── Bounding-box scan ────────────────────────────────────────────────────────

/**
 * Scan the binary image for rectangular black regions using a sliding-window
 * row/column projection approach (fast, no full connected-components needed).
 *
 * Returns an array of candidate bounding boxes { x, y, w, h }.
 */
export function findBlackRectCandidates(bin, width, height) {
  // Build column sums of black pixels per row
  const rowBlack = new Int32Array(height);
  const colBlack = new Int32Array(width);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (bin[y * width + x] === 0) {
        rowBlack[y]++;
        colBlack[x]++;
      }
    }
  }

  // Find row spans where black density is high (border rows)
  const ROW_DENSITY = 0.4; // at least 40% of row is black
  const blackRows = [];
  for (let y = 0; y < height; y++) {
    if (rowBlack[y] / width >= ROW_DENSITY) blackRows.push(y);
  }
  const blackCols = [];
  for (let x = 0; x < width; x++) {
    if (colBlack[x] / height >= ROW_DENSITY) blackCols.push(x);
  }

  if (blackRows.length === 0 || blackCols.length === 0) return [];

  // Group contiguous black rows into spans
  const rowSpans = groupContiguous(blackRows);
  const colSpans = groupContiguous(blackCols);

  const candidates = [];
  for (const rs of rowSpans) {
    for (const cs of colSpans) {
      const x = cs[0];
      const y = rs[0];
      const w = cs[cs.length - 1] - cs[0] + 1;
      const h = rs[rs.length - 1] - rs[0] + 1;
      candidates.push({ x, y, w, h });
    }
  }
  return candidates;
}

function groupContiguous(sorted) {
  if (sorted.length === 0) return [];
  const groups = [];
  let current = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] <= 3) {
      current.push(sorted[i]);
    } else {
      groups.push(current);
      current = [sorted[i]];
    }
  }
  groups.push(current);
  return groups;
}

// ─── Main detection ───────────────────────────────────────────────────────────

/**
 * Detect the custom marker in a binary image.
 *
 * @param {Uint8Array} bin     Binarised pixel data (0 = black, 255 = white)
 * @param {number}     width   Image width in pixels
 * @param {number}     height  Image height in pixels
 * @returns {{ found: boolean, bbox: {x,y,w,h}|null, orientation: number }}
 *   orientation: 0=normal, 90=rotated90CW, 180=rotated180, 270=rotated270CW
 */
export function detectMarker(bin, width, height) {
  const imageArea = width * height;

  const candidates = findBlackRectCandidates(bin, width, height);

  for (const bbox of candidates) {
    const { x, y, w, h } = bbox;
    const area = w * h;

    // 1. Size filter
    const areaFraction = area / imageArea;
    if (areaFraction < MIN_AREA_FRACTION || areaFraction > MAX_AREA_FRACTION) continue;

    // 2. Squareness filter
    const aspectRatio = w / h;
    if (Math.abs(aspectRatio - 1.0) > SQUARENESS_TOLERANCE) continue;

    // 3. Check that the interior is mostly white (large empty area inside)
    const interiorWhiteRatio = measureInteriorWhite(bin, width, x, y, w, h);
    if (interiorWhiteRatio < MIN_INTERIOR_WHITE_RATIO) continue;

    // 4. Check for the corner anchor and determine orientation
    const orientation = findAnchorOrientation(bin, width, x, y, w, h);
    if (orientation === -1) continue;

    return { found: true, bbox, orientation };
  }

  return { found: false, bbox: null, orientation: 0 };
}

/**
 * Measure the fraction of white pixels in the interior region of a candidate bbox.
 * Interior = inner 60% of the bounding box (excluding border).
 */
function measureInteriorWhite(bin, width, bx, by, bw, bh) {
  const margin = Math.round(Math.min(bw, bh) * BORDER_RATIO);
  const ix = bx + margin;
  const iy = by + margin;
  const iw = bw - 2 * margin;
  const ih = bh - 2 * margin;

  if (iw <= 0 || ih <= 0) return 0;

  let white = 0;
  let total = 0;
  for (let row = iy; row < iy + ih; row++) {
    for (let col = ix; col < ix + iw; col++) {
      if (col >= 0 && col < width && row >= 0) {
        total++;
        if (bin[row * width + col] === 255) white++;
      }
    }
  }
  return total === 0 ? 0 : white / total;
}

/**
 * Check each of the 4 corners for the filled black anchor square.
 * Returns the orientation (0, 90, 180, 270) based on which corner has the anchor,
 * or -1 if no valid anchor is found.
 *
 * Corner → orientation mapping (so that after correction, anchor is top-left):
 *   Top-left anchor     → 0   (already correct)
 *   Top-right anchor    → 270 (rotate 270° CW = 90° CCW)
 *   Bottom-right anchor → 180
 *   Bottom-left anchor  → 90
 */
function findAnchorOrientation(bin, width, bx, by, bw, bh) {
  const anchorSize = Math.round(Math.min(bw, bh) * ANCHOR_RATIO);
  const borderSize = Math.round(Math.min(bw, bh) * BORDER_RATIO);

  // The anchor square sits inside the border, at one corner
  // We check a region of anchorSize×anchorSize at each corner (offset by borderSize)
  const corners = [
    { cx: bx + borderSize,           cy: by + borderSize,           orientation: 0   }, // top-left
    { cx: bx + bw - borderSize - anchorSize, cy: by + borderSize,   orientation: 270 }, // top-right
    { cx: bx + bw - borderSize - anchorSize, cy: by + bh - borderSize - anchorSize, orientation: 180 }, // bottom-right
    { cx: bx + borderSize,           cy: by + bh - borderSize - anchorSize, orientation: 90  }, // bottom-left
  ];

  // We also need to verify that ONLY ONE corner has the anchor (uniqueness)
  const anchorThreshold = 0.70; // 70% of corner region must be black
  const nonAnchorThreshold = 0.30; // other corners must be mostly white

  let anchorCount = 0;
  let detectedOrientation = -1;

  for (const corner of corners) {
    const blackRatio = measureRegionBlack(bin, width, corner.cx, corner.cy, anchorSize, anchorSize);
    if (blackRatio >= anchorThreshold) {
      anchorCount++;
      detectedOrientation = corner.orientation;
    }
  }

  // Exactly one corner should be the anchor
  if (anchorCount !== 1) return -1;

  // Verify the other 3 corners are NOT filled (they should be white/interior)
  let nonAnchorValid = true;
  for (const corner of corners) {
    if (corner.orientation === detectedOrientation) continue;
    const blackRatio = measureRegionBlack(bin, width, corner.cx, corner.cy, anchorSize, anchorSize);
    if (blackRatio >= nonAnchorThreshold) {
      nonAnchorValid = false;
      break;
    }
  }

  if (!nonAnchorValid) return -1;

  return detectedOrientation;
}

/**
 * Measure the fraction of black pixels in a rectangular region.
 */
function measureRegionBlack(bin, width, rx, ry, rw, rh) {
  let black = 0;
  let total = 0;
  for (let row = ry; row < ry + rh; row++) {
    for (let col = rx; col < rx + rw; col++) {
      if (col >= 0 && row >= 0) {
        total++;
        if (bin[row * width + col] === 0) black++;
      }
    }
  }
  return total === 0 ? 0 : black / total;
}

// ─── Orientation correction ───────────────────────────────────────────────────

/**
 * Given the detected orientation, return the rotation degrees needed
 * to bring the marker to its canonical upright position (anchor top-left).
 * @param {number} orientation  0 | 90 | 180 | 270
 * @returns {number} degrees to rotate (clockwise)
 */
export function getRotationDegrees(orientation) {
  // orientation already encodes "how much to rotate to fix"
  return orientation;
}
