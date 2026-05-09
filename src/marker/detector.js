const BORDER_FRAC_MIN = 0.08;
const BORDER_FRAC_MAX = 0.22;

const ANCHOR_FRAC_MIN = 0.08;
const ANCHOR_FRAC_MAX = 0.24;
const MIN_AREA_FRAC = 0.02;
const MAX_AREA_FRAC = 0.92;

const SQUARENESS_TOL = 0.20;
const MIN_INTERIOR_WHITE = 0.50;

const MIN_BORDER_BLACK = 0.35;

const ANCHOR_BLACK_MIN = 0.50;

const NON_ANCHOR_BLACK_MAX = 0.35;

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

  const ROW_THRESH = 0.05; 

  const denseRows = [];
  const denseCols = [];
  for (let y = 0; y < imgH; y++) if (rowBlack[y] / imgW >= ROW_THRESH) denseRows.push(y);
  for (let x = 0; x < imgW; x++) if (colBlack[x] / imgH >= ROW_THRESH) denseCols.push(x);

  if (denseRows.length === 0 || denseCols.length === 0) return [];

  const rowGroups = contiguousGroups(denseRows, 5);
  const colGroups = contiguousGroups(denseCols, 5);

  const candidates = [];
  for (const rg of rowGroups) {
    for (const cg of colGroups) {
      const x = cg[0];
      const y = rg[0];
      const w = cg[cg.length - 1] - cg[0] + 1;
      const h = rg[rg.length - 1] - rg[0] + 1;
      candidates.push({ x, y, w, h });
    }
  }

  
  candidates.unshift({
    x: denseCols[0],
    y: denseRows[0],
    w: denseCols[denseCols.length - 1] - denseCols[0] + 1,
    h: denseRows[denseRows.length - 1] - denseRows[0] + 1,
  });

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
  const topOk = regionBlackFrac(bin, imgW, bx + inset, by, bw - 2 * inset, borderPx) >= MIN_BORDER_BLACK;
  const botOk = regionBlackFrac(bin, imgW, bx + inset, by + bh - borderPx, bw - 2 * inset, borderPx) >= MIN_BORDER_BLACK;
  const leftOk = regionBlackFrac(bin, imgW, bx, by + inset, borderPx, bh - 2 * inset) >= MIN_BORDER_BLACK;
  const rightOk = regionBlackFrac(bin, imgW, bx + bw - borderPx, by + inset, borderPx, bh - 2 * inset) >= MIN_BORDER_BLACK;

  return topOk && botOk && leftOk && rightOk;
}


function findAnchor(bin, imgW, bx, by, bw, bh, borderPx) {
  const side = Math.min(bw, bh);
  const anchorSzMin = Math.round(side * ANCHOR_FRAC_MIN);
  const anchorSzMax = Math.round(side * ANCHOR_FRAC_MAX);
  const anchorSz = Math.round(side * 0.16);

  const innerBorder = borderPx;

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

  if (anchors.length !== 1) return null;

  const nonAnchorValid = nonAnchors.every(r => r.blackFrac < NON_ANCHOR_BLACK_MAX);
  if (!nonAnchorValid) return null;

  return anchors[0];
}


/**
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

  const candidates = findCandidates(bin, width, height);
  if (candidates.length === 0) return { found: false, bbox: null, orientation: 0 };

  candidates.sort((a, b) => b.w * b.h - a.w * a.h);

  for (const bbox of candidates) {
    const { x, y, w, h } = bbox;
    const area = w * h;

 
    const areaFrac = area / imageArea;
    if (areaFrac < MIN_AREA_FRAC || areaFrac > MAX_AREA_FRAC) continue;

   
    const ar = w / h;
    if (Math.abs(ar - 1.0) > SQUARENESS_TOL) continue;


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
    if (validBorderPx < 0) continue;

   
    const anchorResult = findAnchor(bin, width, x, y, w, h, validBorderPx);
    if (!anchorResult) continue;

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
