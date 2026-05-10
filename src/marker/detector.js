

const BORDER_FRAC_MIN = 0.04;
const BORDER_FRAC_MAX = 0.25;

const ANCHOR_FRAC_MIN = 0.08;
const ANCHOR_FRAC_MAX = 0.24;
const MIN_AREA_FRAC = 0.02;
const MAX_AREA_FRAC = 0.92;

const SQUARENESS_TOL = 0.35;         // ✅ FIX: was 0.25

const MIN_INTERIOR_WHITE = 0.40;     
const MIN_BORDER_BLACK   = 0.25;     
const ANCHOR_BLACK_MIN   = 0.35;     
const NON_ANCHOR_BLACK_MAX = 0.45;   

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

/**
 * Compute Otsu threshold and binarise.
 * @param {Uint8Array} gray
 * @returns {Uint8Array} binary — 0=black, 255=white
 */
function otsuBinarise(gray) {
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

/**
 * ✅ FIX: Completely rewritten findCandidates.
 *
 * OLD problem: ROW_THRESH was 0.30. Interior rows (only left+right border black)
 * had ~20% black — below threshold. So denseRows only caught top/bottom border
 * rows as two separate groups, giving 4 tiny corner candidates instead of the
 * full marker bounding box.
 *
 * NEW approach:
 * 1. Lower ROW_THRESH to 0.05 so interior rows (with border on both sides) pass.
 * 2. Add the FULL OUTER EXTENT of all dense rows/cols as the first candidate.
 *    This ensures the whole marker is always evaluated first.
 */
function findCandidates(bin, imgW, imgH) {
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

  // ✅ FIX: Increased back to 0.08. Instead of relying on interior rows to pass,
  // we will combine pairs of row/col groups to form candidates.
  const ROW_THRESH = 0.08;

  const denseRows = [];
  const denseCols = [];
  for (let y = 0; y < imgH; y++) if (rowBlack[y] / imgW >= ROW_THRESH) denseRows.push(y);
  for (let x = 0; x < imgW; x++) if (colBlack[x] / imgH >= ROW_THRESH) denseCols.push(x);

  if (denseRows.length === 0 || denseCols.length === 0) return [];

  const rowGroups = contiguousGroups(denseRows, 10);
  const colGroups = contiguousGroups(denseCols, 10);

  const candidates = [];

  // ✅ FIX: Generate candidates from ALL PAIRS of row groups and col groups.
  // This guarantees that even if the top border and bottom border are split
  // into separate groups, they will be combined to form the correct full marker box!
  for (let ri = 0; ri < rowGroups.length; ri++) {
    for (let rj = ri; rj < rowGroups.length; rj++) {
      for (let ci = 0; ci < colGroups.length; ci++) {
        for (let cj = ci; cj < colGroups.length; cj++) {
          const r1 = rowGroups[ri][0];
          const r2 = rowGroups[rj][rowGroups[rj].length - 1];
          const c1 = colGroups[ci][0];
          const c2 = colGroups[cj][colGroups[cj].length - 1];
          
          const w = c2 - c1 + 1;
          const h = r2 - r1 + 1;
          
          // Ignore impossibly small candidates to save processing
          if (w < 20 || h < 20) continue;
          
          candidates.push({ x: c1, y: r1, w, h });
        }
      }
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

function validateBorderSolid(bin, imgW, bx, by, bw, bh, borderPx) {
  const inset = Math.round(borderPx * 0.5);
  const topOk   = regionBlackFrac(bin, imgW, bx + inset, by,                   bw - 2 * inset, borderPx) >= MIN_BORDER_BLACK;
  const botOk   = regionBlackFrac(bin, imgW, bx + inset, by + bh - borderPx,   bw - 2 * inset, borderPx) >= MIN_BORDER_BLACK;
  const leftOk  = regionBlackFrac(bin, imgW, bx,         by + inset,           borderPx, bh - 2 * inset) >= MIN_BORDER_BLACK;
  const rightOk = regionBlackFrac(bin, imgW, bx + bw - borderPx, by + inset,   borderPx, bh - 2 * inset) >= MIN_BORDER_BLACK;
  return topOk && botOk && leftOk && rightOk;
}

function findAnchor(bin, imgW, bx, by, bw, bh, borderPx) {
  const side = Math.min(bw, bh);
  const anchorSz = Math.round(side * 0.16);
  const innerBorder = borderPx;

  // ✅ FIX: Check multiple offsets to handle markers with a gap between border and anchor
  const offsets = [
    innerBorder,
    innerBorder + Math.round(side * 0.04),
    innerBorder + Math.round(side * 0.08),
    innerBorder + Math.round(side * 0.12),
    innerBorder + Math.round(side * 0.16)
  ];

  function getCornerMaxBlack(isLeft, isTop) {
    let maxF = 0;
    for (const off of offsets) {
      const x = isLeft ? bx + off : bx + bw - off - anchorSz;
      const y = isTop  ? by + off : by + bh - off - anchorSz;
      const f = regionBlackFrac(bin, imgW, x, y, anchorSz, anchorSz);
      if (f > maxF) maxF = f;
    }
    return maxF;
  }

  const corners = [
    { name: 'TL', orientation: 0,   blackFrac: getCornerMaxBlack(true, true) },
    { name: 'TR', orientation: 270, blackFrac: getCornerMaxBlack(false, true) },
    { name: 'BR', orientation: 180, blackFrac: getCornerMaxBlack(false, false) },
    { name: 'BL', orientation: 90,  blackFrac: getCornerMaxBlack(true, false) },
  ];

  // ✅ DEBUG: Log anchor black fractions to help diagnose detection failures
  console.log('[detector] Anchor fracs:', corners.map(r => `${r.name}=${r.blackFrac.toFixed(2)}`).join(' '));

  const anchors    = corners.filter(r => r.blackFrac >= ANCHOR_BLACK_MIN);
  const nonAnchors = corners.filter(r => r.blackFrac < ANCHOR_BLACK_MIN);

  if (anchors.length !== 1) {
    console.log(`[detector] Expected 1 anchor, found ${anchors.length}`);
    return null;
  }

  const nonAnchorValid = nonAnchors.every(r => r.blackFrac < NON_ANCHOR_BLACK_MAX);
  if (!nonAnchorValid) {
    console.log('[detector] Non-anchor corners too dark');
    return null;
  }

  return anchors[0];
}

/**
 * @param {Uint8ClampedArray|Uint8Array} rgba  Raw RGBA pixel data
 * @param {number} width
 * @param {number} height
 * @returns {{ found: boolean, bbox: {x,y,w,h}|null, orientation: number }}
 */
export function detectMarker(rgba, width, height) {
  const imageArea = width * height;

  const gray = toGrayscale(rgba, width, height);
  const bin  = otsuBinarise(gray);

  const candidates = findCandidates(bin, width, height);
  if (candidates.length === 0) {
    console.log('[detector] No candidates found');
    return { found: false, bbox: null, orientation: 0 };
  }

  console.log(`[detector] Evaluating ${candidates.length} candidates`);

  // Sort largest area first — full outer extent candidate is already first but
  // sorting ensures largest wins if multiple candidates are similar
  candidates.sort((a, b) => b.w * b.h - a.w * a.h);

  for (const bbox of candidates) {
    const { x, y, w, h } = bbox;
    const area = w * h;

    const areaFrac = area / imageArea;
    if (areaFrac < MIN_AREA_FRAC || areaFrac > MAX_AREA_FRAC) {
      console.log(`[detector] Candidate rejected — areaFrac=${areaFrac.toFixed(3)}`);
      continue;
    }

    const ar = w / h;
    if (Math.abs(ar - 1.0) > SQUARENESS_TOL) {
      console.log(`[detector] Candidate rejected — aspectRatio=${ar.toFixed(3)}`);
      continue;
    }

    const side = Math.min(w, h);
    const borderPxMin = Math.round(side * BORDER_FRAC_MIN);
    const borderPxMax = Math.round(side * BORDER_FRAC_MAX);

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

    if (validBorderPx < 0) {
      console.log('[detector] Candidate rejected — border/interior check failed');
      continue;
    }

    const anchorResult = findAnchor(bin, width, x, y, w, h, validBorderPx);
    if (!anchorResult) continue;

    console.log(`[detector] ✅ Marker found! orientation=${anchorResult.orientation}`);
    return {
      found: true,
      bbox,
      orientation: anchorResult.orientation,
    };
  }

  return { found: false, bbox: null, orientation: 0 };
}

export function getRotationDegrees(orientation) {
  return orientation;
}