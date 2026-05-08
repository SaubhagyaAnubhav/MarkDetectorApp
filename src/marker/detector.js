/**
 * detector.js — Marker 1 Detection Engine
 *
 * TARGET: Marker 1 — 140×140mm square
 *   • Solid thick black border on ALL 4 sides (~11–15% of side each)
 *   • Single 20×20mm black anchor in one corner inside the border
 *     (20/140 ≈ 14.3% of the marker side)
 *   • Interior is mostly white (>60% of total area)
 *
 * PIPELINE:
 *  1. RGBA → Grayscale
 *  2. Otsu adaptive threshold → binary
 *  3. Scan for candidate square black-bordered regions
 *  4. Validate: squareness, size, border solidity, interior whiteness
 *  5. Find corner anchor — must be exactly 1, size ≈ 14% of side
 *  6. Return: { found, bbox, orientation }
 *     orientation: 0=normal(anchor TL), 90=anchor BL, 180=anchor BR, 270=anchor TR
 */

// ─── Marker 1 Geometry Constants ────────────────────────────────────────────
// Border occupies this fraction of the marker side (each side)
const BORDER_FRAC_MIN = 0.08;
const BORDER_FRAC_MAX = 0.22;

// Anchor square side is this fraction of the total marker side
// 20mm / 140mm = 0.1428 → allow ±40% tolerance
const ANCHOR_FRAC_MIN = 0.08;
const ANCHOR_FRAC_MAX = 0.24;

// Minimum fraction of IMAGE area that a candidate must occupy
const MIN_AREA_FRAC = 0.02;
const MAX_AREA_FRAC = 0.92;

// Squareness: aspect ratio must be within this of 1.0
const SQUARENESS_TOL = 0.20;

// Interior must be ≥ this fraction white
const MIN_INTERIOR_WHITE = 0.58;

// Border solidity: each border strip must be ≥ this fraction black
const MIN_BORDER_BLACK = 0.45;

// Anchor region must be ≥ this fraction black to count as an anchor
const ANCHOR_BLACK_MIN = 0.65;

// Other corner regions must be < this fraction black (to be considered white)
const NON_ANCHOR_BLACK_MAX = 0.28;

// ─── Step 1: RGBA → Grayscale ─────────────────────────────────────────────
/**
 * @param {Uint8ClampedArray|Uint8Array} rgba
 * @param {number} w
 * @param {number} h
 * @returns {Uint8Array}
 */
function toGrayscale(rgba, w, h) {
  const n = w * h;
  const gray = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const base = i * 4;
    gray[i] = (77 * rgba[base] + 150 * rgba[base + 1] + 29 * rgba[base + 2]) >> 8;
  }
  return gray;
}

// ─── Step 2: Otsu's adaptive threshold ───────────────────────────────────
/**
 * Compute Otsu threshold and binarise.
 * @param {Uint8Array} gray
 * @returns {Uint8Array} binary — 0=black, 255=white
 */
function otsuBinarise(gray) {
  // Build histogram
  const hist = new Int32Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;

  const total = gray.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];

  let sumB = 0;
  let wB = 0;
  let maxVar = 0;
  let threshold = 128;

  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const varBetween = wB * wF * (mB - mF) * (mB - mF);
    if (varBetween > maxVar) {
      maxVar = varBetween;
      threshold = t;
    }
  }

  const bin = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) {
    bin[i] = gray[i] <= threshold ? 0 : 255;
  }
  return bin;
}

// ─── Step 3: Row / column projection to find candidates ──────────────────
/**
 * Find candidate bounding boxes by looking for dense black rows/cols.
 * Returns array of { x, y, w, h }.
 */
function findCandidates(bin, imgW, imgH) {
  // Per-row and per-column black pixel counts
  const rowBlack = new Int32Array(imgH);
  const colBlack = new Int32Array(imgW);

  for (let y = 0; y < imgH; y++) {
    const base = y * imgW;
    for (let x = 0; x < imgW; x++) {
      if (bin[base + x] === 0) {
        rowBlack[y]++;
        colBlack[x]++;
      }
    }
  }

  // Find spans of rows/cols where the black density is high enough to be a border
  const ROW_THRESH = 0.30; // ≥30% of the row/col is black
  const denseRows = [];
  const denseCols = [];
  for (let y = 0; y < imgH; y++) if (rowBlack[y] / imgW >= ROW_THRESH) denseRows.push(y);
  for (let x = 0; x < imgW; x++) if (colBlack[x] / imgH >= ROW_THRESH) denseCols.push(x);

  if (denseRows.length === 0 || denseCols.length === 0) return [];

  // Group into contiguous spans (gap ≤ 5px)
  const rowGroups = contiguousGroups(denseRows, 5);
  const colGroups = contiguousGroups(denseCols, 5);

  // Each (row group, col group) pair is a candidate bounding box
  const candidates = [];
  for (const rg of rowGroups) {
    for (const cg of colGroups) {
      candidates.push({
        x: cg[0],
        y: rg[0],
        w: cg[cg.length - 1] - cg[0] + 1,
        h: rg[rg.length - 1] - rg[0] + 1,
      });
    }
  }
  return candidates;
}

function contiguousGroups(sorted, maxGap) {
  if (sorted.length === 0) return [];
  const groups = [];
  let cur = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] <= maxGap) {
      cur.push(sorted[i]);
    } else {
      groups.push(cur);
      cur = [sorted[i]];
    }
  }
  groups.push(cur);
  return groups;
}

// ─── Step 4: Candidate validation ────────────────────────────────────────

/** Fraction of black pixels in a rectangular region */
function regionBlackFrac(bin, imgW, rx, ry, rw, rh) {
  let black = 0;
  const x1 = Math.max(0, rx);
  const y1 = Math.max(0, ry);
  const x2 = Math.min(imgW - 1, rx + rw - 1);
  const y2 = ry + rh - 1;
  if (x2 < x1 || y2 < y1) return 0;
  const total = (x2 - x1 + 1) * (y2 - y1 + 1);
  for (let y = y1; y <= y2; y++) {
    const base = y * imgW;
    for (let x = x1; x <= x2; x++) {
      if (bin[base + x] === 0) black++;
    }
  }
  return black / total;
}

/** Fraction of white pixels in the interior of a bbox (excluding border strip) */
function interiorWhiteFrac(bin, imgW, bx, by, bw, bh, borderPx) {
  const ix = bx + borderPx;
  const iy = by + borderPx;
  const iw = bw - 2 * borderPx;
  const ih = bh - 2 * borderPx;
  if (iw <= 0 || ih <= 0) return 0;
  let white = 0;
  let total = 0;
  const x2 = Math.min(imgW - 1, ix + iw - 1);
  for (let y = iy; y < iy + ih; y++) {
    const base = y * imgW;
    for (let x = ix; x <= x2; x++) {
      total++;
      if (bin[base + x] === 255) white++;
    }
  }
  return total === 0 ? 0 : white / total;
}

/**
 * Validate that the border is solid (not dashed, not open).
 * Checks all 4 sides: top strip, bottom strip, left strip, right strip.
 */
function validateBorderSolid(bin, imgW, bx, by, bw, bh, borderPx) {
  // Check each strip with some inset to avoid corner effects
  const inset = Math.round(borderPx * 0.5);
  // Top strip
  const topOk = regionBlackFrac(bin, imgW, bx + inset, by, bw - 2 * inset, borderPx) >= MIN_BORDER_BLACK;
  // Bottom strip
  const botOk = regionBlackFrac(bin, imgW, bx + inset, by + bh - borderPx, bw - 2 * inset, borderPx) >= MIN_BORDER_BLACK;
  // Left strip
  const leftOk = regionBlackFrac(bin, imgW, bx, by + inset, borderPx, bh - 2 * inset) >= MIN_BORDER_BLACK;
  // Right strip
  const rightOk = regionBlackFrac(bin, imgW, bx + bw - borderPx, by + inset, borderPx, bh - 2 * inset) >= MIN_BORDER_BLACK;

  return topOk && botOk && leftOk && rightOk;
}

// ─── Step 5: Corner anchor detection ─────────────────────────────────────

/**
 * Check each of the 4 inner corners for the anchor square.
 * Returns:
 *   { anchorCorner, orientation } if exactly one corner qualifies
 *   null if 0 or >1 corners qualify
 *
 * Orientation mapping (so we rotate to make anchor top-left):
 *   anchor TL → 0°    (already correct)
 *   anchor TR → 270°  (rotate 270° CW to fix)
 *   anchor BR → 180°  (rotate 180°)
 *   anchor BL → 90°   (rotate 90° CW)
 */
function findAnchor(bin, imgW, bx, by, bw, bh, borderPx) {
  const side = Math.min(bw, bh);
  // Anchor size: should be ~14% of side (20mm/140mm)
  const anchorSzMin = Math.round(side * ANCHOR_FRAC_MIN);
  const anchorSzMax = Math.round(side * ANCHOR_FRAC_MAX);
  const anchorSz = Math.round(side * 0.16); // Use 16% as sampling size, covers 14% anchor

  const innerBorder = borderPx;

  // 4 corner positions (top-left corner of each anchor check region, inside border)
  const corners = [
    { name: 'TL', x: bx + innerBorder, y: by + innerBorder, orientation: 0 },
    { name: 'TR', x: bx + bw - innerBorder - anchorSz, y: by + innerBorder, orientation: 270 },
    { name: 'BR', x: bx + bw - innerBorder - anchorSz, y: by + bh - innerBorder - anchorSz, orientation: 180 },
    { name: 'BL', x: bx + innerBorder, y: by + bh - innerBorder - anchorSz, orientation: 90 },
  ];

  const results = corners.map(c => ({
    ...c,
    blackFrac: regionBlackFrac(bin, imgW, c.x, c.y, anchorSz, anchorSz),
  }));

  const anchors = results.filter(r => r.blackFrac >= ANCHOR_BLACK_MIN);
  const nonAnchors = results.filter(r => r.blackFrac < ANCHOR_BLACK_MIN);

  // Must be exactly 1 anchor corner
  if (anchors.length !== 1) return null;

  // All other corners must be clearly white/light
  const nonAnchorValid = nonAnchors.every(r => r.blackFrac < NON_ANCHOR_BLACK_MAX);
  if (!nonAnchorValid) return null;

  return anchors[0];
}

// ─── Main detection export ────────────────────────────────────────────────

/**
 * Detect Marker 1 in a raw RGBA frame from jpeg-js.
 *
 * @param {Uint8ClampedArray|Uint8Array} rgba  Raw RGBA pixel data
 * @param {number} width
 * @param {number} height
 * @returns {{ found: boolean, bbox: {x,y,w,h}|null, orientation: number }}
 *   orientation: 0 | 90 | 180 | 270 (degrees to rotate CW to correct)
 */
export function detectMarker(rgba, width, height) {
  const imageArea = width * height;

  // Step 1 & 2
  const gray = toGrayscale(rgba, width, height);
  const bin = otsuBinarise(gray);

  // Step 3
  const candidates = findCandidates(bin, width, height);
  if (candidates.length === 0) return { found: false, bbox: null, orientation: 0 };

  // Sort candidates by area descending (most likely first)
  candidates.sort((a, b) => b.w * b.h - a.w * a.h);

  // Step 4 & 5: Validate each candidate
  for (const bbox of candidates) {
    const { x, y, w, h } = bbox;
    const area = w * h;

    // Size filter
    const areaFrac = area / imageArea;
    if (areaFrac < MIN_AREA_FRAC || areaFrac > MAX_AREA_FRAC) continue;

    // Squareness filter
    const ar = w / h;
    if (Math.abs(ar - 1.0) > SQUARENESS_TOL) continue;

    // Border thickness validation
    const side = Math.min(w, h);
    const borderPxMin = Math.round(side * BORDER_FRAC_MIN);
    const borderPxMax = Math.round(side * BORDER_FRAC_MAX);

    // Try a range of border thicknesses and pick one that satisfies all checks
    let validBorderPx = -1;
    for (let bp = borderPxMin; bp <= borderPxMax; bp += Math.max(1, Math.round(side * 0.01))) {
      if (validateBorderSolid(bin, width, x, y, w, h, bp)) {
        const white = interiorWhiteFrac(bin, width, x, y, w, h, bp);
        if (white >= MIN_INTERIOR_WHITE) {
          validBorderPx = bp;
          break;
        }
      }
    }
    if (validBorderPx < 0) continue;

    // Anchor validation
    const anchorResult = findAnchor(bin, width, x, y, w, h, validBorderPx);
    if (!anchorResult) continue;

    // All checks passed — this is Marker 1!
    return {
      found: true,
      bbox,
      orientation: anchorResult.orientation,
    };
  }

  return { found: false, bbox: null, orientation: 0 };
}

/**
 * Convenience: get rotation degrees to apply to correct orientation.
 * The result is what we pass to expo-image-manipulator's rotate action.
 */
export function getRotationDegrees(orientation) {
  return orientation; // 0, 90, 180, or 270
}
