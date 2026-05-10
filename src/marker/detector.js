'use strict';

var BORDER_FRAC_MIN    = 0.08;
var BORDER_FRAC_MAX    = 0.22;
var MIN_AREA_FRAC      = 0.02;
var MAX_AREA_FRAC      = 0.92;
var SQUARENESS_TOL     = 0.25;
var MIN_INTERIOR_WHITE = 0.50;
var MIN_BORDER_BLACK   = 0.35;

var ANCHOR_BLACK_MIN     = 0.40; 
var NON_ANCHOR_BLACK_MAX = 0.35;  
var ANCHOR_LARGE_SZ_FRAC = 0.28;  
var M2_SOLID_BLACK_MIN  = 0.40;  
var M2_DASHED_BLACK_MIN = 0.08;  
var M2_DASHED_BLACK_MAX = 0.75;  



function toGrayscale(rgba, w, h) {
  var n = w * h;
  var gray = new Uint8Array(n);
  for (var i = 0; i < n; i++) {
    var base = i * 4;
    gray[i] = (77 * rgba[base] + 150 * rgba[base + 1] + 29 * rgba[base + 2]) >> 8;
  }
  return gray;
}

function otsuBinarise(gray) {
  var hist = new Int32Array(256);
  for (var i = 0; i < gray.length; i++) hist[gray[i]]++;

  var total = gray.length;
  var sum = 0;
  for (var t = 0; t < 256; t++) sum += t * hist[t];

  var sumB = 0, wB = 0, maxVar = 0, threshold = 128;
  for (var t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    var wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    var mB = sumB / wB;
    var mF = (sum - sumB) / wF;
    var v = wB * wF * (mB - mF) * (mB - mF);
    if (v > maxVar) { maxVar = v; threshold = t; }
  }

  var bin = new Uint8Array(gray.length);
  for (var i = 0; i < gray.length; i++) {
    bin[i] = gray[i] <= threshold ? 0 : 255;
  }
  return bin;
}

function regionBlackFrac(bin, imgW, rx, ry, rw, rh) {
  var x1 = Math.max(0, rx);
  var y1 = Math.max(0, ry);
  var x2 = Math.min(imgW - 1, rx + rw - 1);
  var y2 = ry + rh - 1;
  if (x2 < x1 || y2 < y1) return 0;
  var black = 0;
  var total = (x2 - x1 + 1) * (y2 - y1 + 1);
  for (var y = y1; y <= y2; y++) {
    var base = y * imgW;
    for (var x = x1; x <= x2; x++) {
      if (bin[base + x] === 0) black++;
    }
  }
  return black / total;
}

function interiorWhiteFrac(bin, imgW, bx, by, bw, bh, borderPx) {
  var ix = bx + borderPx;
  var iy = by + borderPx;
  var iw = bw - 2 * borderPx;
  var ih = bh - 2 * borderPx;
  if (iw <= 0 || ih <= 0) return 0;
  var white = 0, total = 0;
  var x2 = Math.min(imgW - 1, ix + iw - 1);
  for (var y = iy; y < iy + ih; y++) {
    var base = y * imgW;
    for (var x = ix; x <= x2; x++) {
      total++;
      if (bin[base + x] === 255) white++;
    }
  }
  return total === 0 ? 0 : white / total;
}

function contiguousGroups(sorted, maxGap) {
  if (sorted.length === 0) return [];
  var groups = [];
  var cur = [sorted[0]];
  for (var i = 1; i < sorted.length; i++) {
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

function findCandidates(bin, imgW, imgH) {
  var rowBlack = new Int32Array(imgH);
  var colBlack = new Int32Array(imgW);

  for (var y = 0; y < imgH; y++) {
    var base = y * imgW;
    for (var x = 0; x < imgW; x++) {
      if (bin[base + x] === 0) {
        rowBlack[y]++;
        colBlack[x]++;
      }
    }
  }

  var ROW_THRESH = 0.05;
  var denseRows = [];
  var denseCols = [];
  for (var y = 0; y < imgH; y++) if (rowBlack[y] / imgW >= ROW_THRESH) denseRows.push(y);
  for (var x = 0; x < imgW; x++) if (colBlack[x] / imgH >= ROW_THRESH) denseCols.push(x);
  if (denseRows.length === 0 || denseCols.length === 0) return [];

  var rowGroups = contiguousGroups(denseRows, 5);
  var colGroups = contiguousGroups(denseCols, 5);

  var candidates = [];

  
  candidates.push({
    x: denseCols[0],
    y: denseRows[0],
    w: denseCols[denseCols.length - 1] - denseCols[0] + 1,
    h: denseRows[denseRows.length - 1] - denseRows[0] + 1,
  });

  for (var ri = 0; ri < rowGroups.length; ri++) {
    for (var ci = 0; ci < colGroups.length; ci++) {
      var rg = rowGroups[ri];
      var cg = colGroups[ci];
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




function validateBorderSolid(bin, imgW, bx, by, bw, bh, borderPx) {
  var inset = Math.round(borderPx * 0.5);
  var topOk   = regionBlackFrac(bin, imgW, bx + inset, by,                  bw - 2 * inset, borderPx) >= MIN_BORDER_BLACK;
  var botOk   = regionBlackFrac(bin, imgW, bx + inset, by + bh - borderPx,  bw - 2 * inset, borderPx) >= MIN_BORDER_BLACK;
  var leftOk  = regionBlackFrac(bin, imgW, bx,         by + inset,          borderPx, bh - 2 * inset) >= MIN_BORDER_BLACK;
  var rightOk = regionBlackFrac(bin, imgW, bx + bw - borderPx, by + inset,  borderPx, bh - 2 * inset) >= MIN_BORDER_BLACK;
  return topOk && botOk && leftOk && rightOk;
}

function findAnchorWithSizeCheck(bin, imgW, bx, by, bw, bh, borderPx) {
  var side    = Math.min(bw, bh);
  var smallSz = Math.round(side * 0.16);         
  var largeSz = Math.round(side * ANCHOR_LARGE_SZ_FRAC); 
  var inner   = borderPx;

  var corners = [
    { name: 'TL', x: bx + inner,                 y: by + inner,                 orientation: 0   },
    { name: 'TR', x: bx + bw - inner - smallSz,  y: by + inner,                 orientation: 270 },
    { name: 'BR', x: bx + bw - inner - smallSz,  y: by + bh - inner - smallSz,  orientation: 180 },
    { name: 'BL', x: bx + inner,                  y: by + bh - inner - smallSz,  orientation: 90  },
  ];

  var results = corners.map(function(c) {
    return {
      name       : c.name,
      orientation: c.orientation,
      x          : c.x,
      y          : c.y,
      smallBlack : regionBlackFrac(bin, imgW, c.x, c.y, smallSz, smallSz),
      largeBlack : regionBlackFrac(bin, imgW, c.x, c.y, smallSz * 2, smallSz * 2),
    };
  });

  console.log('[detector M1] Anchor fracs: ' +
    results.map(function(r) {
      return r.name + '=s:' + r.smallBlack.toFixed(2) + ',l:' + r.largeBlack.toFixed(2);
    }).join(' ')
  );

  var anchors    = results.filter(function(r) { return r.smallBlack >= ANCHOR_BLACK_MIN; });
  var nonAnchors = results.filter(function(r) { return r.smallBlack <  ANCHOR_BLACK_MIN; });

  if (anchors.length === 0) {
    return { detected: false, isCorrect: false, reason: 'Missing anchor square', orientation: 0 };
  }
  if (anchors.length > 1) {
    return { detected: false, isCorrect: false, reason: 'Multiple dark corner regions detected', orientation: 0 };
  }

  var nonAnchorValid = nonAnchors.every(function(r) { return r.smallBlack < NON_ANCHOR_BLACK_MAX; });
  if (!nonAnchorValid) {
    return { detected: false, isCorrect: false, reason: 'Unexpected dark regions in non-anchor corners', orientation: 0 };
  }

  var anchor = anchors[0];

  if (anchor.largeBlack >= ANCHOR_BLACK_MIN) {
    return { detected: true, isCorrect: false, reason: 'Anchor square is too large', orientation: anchor.orientation };
  }

  return { detected: true, isCorrect: true, reason: '', orientation: anchor.orientation };
}

function detectMarker1Internal(bin, imgW, imgH, imageArea) {
  var candidates = findCandidates(bin, imgW, imgH);
  if (candidates.length === 0) {
    console.log('[detector M1] No candidates found');
    return { found: false, isCorrect: false, reason: 'No marker detected', bbox: null, orientation: 0 };
  }

  candidates.sort(function(a, b) { return (b.w * b.h) - (a.w * a.h); });
  console.log('[detector M1] Evaluating ' + candidates.length + ' candidates');

  for (var i = 0; i < candidates.length; i++) {
    var bbox = candidates[i];
    var x = bbox.x, y = bbox.y, w = bbox.w, h = bbox.h;

    var areaFrac = (w * h) / imageArea;
    if (areaFrac < MIN_AREA_FRAC || areaFrac > MAX_AREA_FRAC) {
      console.log('[detector M1] Rejected — areaFrac=' + areaFrac.toFixed(3));
      continue;
    }

    var ar = w / h;
    if (Math.abs(ar - 1.0) > SQUARENESS_TOL) {
      console.log('[detector M1] Rejected — aspectRatio=' + ar.toFixed(3));
      continue;
    }

    var side   = Math.min(w, h);
    var bpMin  = Math.round(side * BORDER_FRAC_MIN);
    var bpMax  = Math.round(side * BORDER_FRAC_MAX);
    var bpStep = Math.max(1, Math.round(side * 0.01));
    var validBorderPx = -1;

    for (var bp = bpMin; bp <= bpMax; bp += bpStep) {
      if (validateBorderSolid(bin, imgW, x, y, w, h, bp)) {
        var white = interiorWhiteFrac(bin, imgW, x, y, w, h, bp);
        if (white >= MIN_INTERIOR_WHITE) {
          validBorderPx = bp;
          break;
        }
      }
    }

    if (validBorderPx < 0) {
      console.log('[detector M1] Rejected — border/interior check failed');
      continue;
    }

    
    var anchorResult = findAnchorWithSizeCheck(bin, imgW, x, y, w, h, validBorderPx);

    console.log('[detector M1] found=true isCorrect=' + anchorResult.isCorrect + ' reason="' + anchorResult.reason + '"');
    return {
      found      : true,
      isCorrect  : anchorResult.isCorrect,
      reason     : anchorResult.reason,
      bbox       : bbox,
      orientation: anchorResult.orientation,
    };
  }

  return { found: false, isCorrect: false, reason: 'No Marker 1 structure detected', bbox: null, orientation: 0 };
}



function detectMarker2Internal(bin, imgW, imgH, imageArea) {
  var candidates = findCandidates(bin, imgW, imgH);
  if (candidates.length === 0) {
    console.log('[detector M2] No candidates found');
    return { found: false, isCorrect: false, reason: 'No marker detected', bbox: null, orientation: 0 };
  }

  candidates.sort(function(a, b) { return (b.w * b.h) - (a.w * a.h); });
  console.log('[detector M2] Evaluating ' + candidates.length + ' candidates');

  for (var i = 0; i < candidates.length; i++) {
    var bbox = candidates[i];
    var x = bbox.x, y = bbox.y, w = bbox.w, h = bbox.h;

    var areaFrac = (w * h) / imageArea;
    if (areaFrac < MIN_AREA_FRAC || areaFrac > MAX_AREA_FRAC) {
      console.log('[detector M2] Rejected — areaFrac=' + areaFrac.toFixed(3));
      continue;
    }

    var ar = w / h;
    if (Math.abs(ar - 1.0) > SQUARENESS_TOL) {
      console.log('[detector M2] Rejected — aspectRatio=' + ar.toFixed(3));
      continue;
    }

    var side   = Math.min(w, h);
    var bpMin  = Math.round(side * BORDER_FRAC_MIN);
    var bpMax  = Math.round(side * BORDER_FRAC_MAX);
    var bpStep = Math.max(1, Math.round(side * 0.01));
    var validBorderPx = -1;
    var leftBlack = 0, bottomBlack = 0;


    for (var bp = bpMin; bp <= bpMax; bp += bpStep) {
      var inset  = Math.round(bp * 0.5);
      leftBlack   = regionBlackFrac(bin, imgW, x,           y + inset,     bp,            h - 2 * inset);
      bottomBlack = regionBlackFrac(bin, imgW, x + inset,   y + h - bp,    w - 2 * inset, bp);
      var white   = interiorWhiteFrac(bin, imgW, x, y, w, h, bp);

      if (leftBlack >= M2_SOLID_BLACK_MIN && bottomBlack >= M2_SOLID_BLACK_MIN && white >= MIN_INTERIOR_WHITE) {
        validBorderPx = bp;
        break;
      }
    }

    if (validBorderPx < 0) {
      console.log('[detector M2] Rejected — L-shape border not found');
      continue;
    }

      
    var bp2    = validBorderPx;
    var inset2 = Math.round(bp2 * 0.5);
    var topBlack   = regionBlackFrac(bin, imgW, x + inset2,    y,           w - 2 * inset2, bp2);
    var rightBlack = regionBlackFrac(bin, imgW, x + w - bp2,   y + inset2,  bp2,            h - 2 * inset2);

    console.log('[detector M2] bp=' + bp2 +
      ' left=' + leftBlack.toFixed(2) +
      ' bottom=' + bottomBlack.toFixed(2) +
      ' top=' + topBlack.toFixed(2) +
      ' right=' + rightBlack.toFixed(2)
    );

    var topDashed   = topBlack   >= M2_DASHED_BLACK_MIN && topBlack   <= M2_DASHED_BLACK_MAX;
    var rightDashed = rightBlack >= M2_DASHED_BLACK_MIN && rightBlack <= M2_DASHED_BLACK_MAX;
    var isCorrect   = topDashed && rightDashed;

    var reason = '';
    if (!isCorrect) {
      if (!topDashed && !rightDashed) {
        reason = 'Top and right border dashed pattern missing';
      } else if (!topDashed) {
        reason = 'Top border dashed pattern incorrect (' + (topBlack * 100).toFixed(0) + '% black)';
      } else {
        reason = 'Right border dashed pattern incorrect (' + (rightBlack * 100).toFixed(0) + '% black)';
      }
    }

    console.log('[detector M2] found=true isCorrect=' + isCorrect + ' reason="' + reason + '"');
    return { found: true, isCorrect: isCorrect, reason: reason, bbox: bbox, orientation: 0 };
  }

  return { found: false, isCorrect: false, reason: 'No Marker 2 structure detected', bbox: null, orientation: 0 };
}




/**
 * Detect a marker in RGBA image data.
 *
 * @param {Uint8ClampedArray|Uint8Array} rgba   Raw RGBA pixel data
 * @param {number} width
 * @param {number} height
 * @param {1|2}   markerType                 
 *
 * @returns {{
 *   found      : boolean,
 *   isCorrect  : boolean,
 *   reason     : string,      // human-readable reason when isCorrect=false
 *   bbox       : {x,y,w,h} | null,
 *   orientation: number       // 0 | 90 | 180 | 270 (only meaningful for Marker 1)
 * }}
 */
function detectMarker(rgba, width, height, markerType) {
  if (markerType === undefined) markerType = 1;

  var gray      = toGrayscale(rgba, width, height);
  var bin       = otsuBinarise(gray);
  var imageArea = width * height;

  if (markerType === 2) {
    return detectMarker2Internal(bin, width, height, imageArea);
  }
  return detectMarker1Internal(bin, width, height, imageArea);
}

function getRotationDegrees(orientation) {
  return orientation;
}

module.exports = { detectMarker: detectMarker, getRotationDegrees: getRotationDegrees };