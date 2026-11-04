const LIGHTBOX_FILL_HARD_MARGIN = 15;

// 二值掩膜的可分离膨胀：半径 radius 内任一像素为 1 则输出 1；tmp 为同尺寸暂存
function dilateBinaryMask(src, width, height, radius, dst, tmp) {
  if (radius <= 0) { dst.set(src); return dst; }
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let count = 0;
    for (let x = 0; x <= Math.min(radius, width - 1); x++) count += src[row + x];
    for (let x = 0; x < width; x++) {
      tmp[row + x] = count > 0 ? 1 : 0;
      const add = x + radius + 1;
      if (add < width) count += src[row + add];
      const remove = x - radius;
      if (remove >= 0) count -= src[row + remove];
    }
  }
  const counts = new Int32Array(width);
  for (let y = 0; y <= Math.min(radius, height - 1); y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) counts[x] += tmp[row + x];
  }
  for (let y = 0; y < height; y++) {
    const row = y * width;
    const addRow = y + radius + 1 < height ? (y + radius + 1) * width : -1;
    const removeRow = y - radius >= 0 ? (y - radius) * width : -1;
    for (let x = 0; x < width; x++) {
      dst[row + x] = counts[x] > 0 ? 1 : 0;
      if (addRow >= 0) counts[x] += tmp[addRow + x];
      if (removeRow >= 0) counts[x] -= tmp[removeRow + x];
    }
  }
  return dst;
}

// 二值掩膜的可分离腐蚀：半径 radius 内全部为 1 才输出 1；图像边界外视为 1，贴边区域不会被腐蚀掉
function erodeBinaryMask(src, width, height, radius, dst, tmp) {
  if (radius <= 0) { dst.set(src); return dst; }
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let count = 0;
    let span = Math.min(radius, width - 1) + 1;
    for (let x = 0; x < span; x++) count += src[row + x];
    for (let x = 0; x < width; x++) {
      tmp[row + x] = count === span ? 1 : 0;
      const add = x + radius + 1;
      if (add < width) { count += src[row + add]; span++; }
      const remove = x - radius;
      if (remove >= 0) { count -= src[row + remove]; span--; }
    }
  }
  const counts = new Int32Array(width);
  let span = Math.min(radius, height - 1) + 1;
  for (let y = 0; y < span; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) counts[x] += tmp[row + x];
  }
  for (let y = 0; y < height; y++) {
    const row = y * width;
    const addRow = y + radius + 1 < height ? (y + radius + 1) * width : -1;
    const removeRow = y - radius >= 0 ? (y - radius) * width : -1;
    for (let x = 0; x < width; x++) {
      dst[row + x] = counts[x] === span ? 1 : 0;
      if (addRow >= 0) counts[x] += tmp[addRow + x];
      if (removeRow >= 0) counts[x] -= tmp[removeRow + x];
    }
    if (addRow >= 0) span++;
    if (removeRow >= 0) span--;
  }
  return dst;
}

// 扫描线泛洪（4 连通）：在 passable 上从种子出发标记连通区域到 visited，返回像素数
function floodFillMask(passable, width, height, seedX, seedY, visited) {
  const total = width * height;
  const stack = [seedY * width + seedX];
  let count = 0;
  while (stack.length) {
    const index = stack.pop();
    if (visited[index] || !passable[index]) continue;
    const row = ((index / width) | 0) * width;
    let x0 = index - row;
    let x1 = x0;
    while (x0 > 0 && passable[row + x0 - 1] && !visited[row + x0 - 1]) x0--;
    while (x1 < width - 1 && passable[row + x1 + 1] && !visited[row + x1 + 1]) x1++;
    for (let x = x0; x <= x1; x++) visited[row + x] = 1;
    count += x1 - x0 + 1;
    for (let step = -1; step <= 1; step += 2) {
      const nextRow = row + step * width;
      if (nextRow < 0 || nextRow >= total) continue;
      let inRun = false;
      for (let x = x0; x <= x1; x++) {
        const candidate = passable[nextRow + x] === 1 && !visited[nextRow + x];
        if (candidate && !inRun) stack.push(nextRow + x);
        inRun = candidate;
      }
    }
  }
  return count;
}

function computeLightboxFillMask(source, seedX, seedY, settings) {
  const { width, height, data } = source;
  const total = width * height;
  const seedIndex = seedY * width + seedX;
  const foreground = settings.foreground?.[seedIndex] ? settings.foreground : null;
  const seed = seedIndex * 4;
  let sr = data[seed], sg = data[seed + 1], sb = data[seed + 2];
  const sa = data[seed + 3];
  if (foreground && !settings.sketch) {
    const samples = [[], [], []];
    for (let y = Math.max(0, seedY - 3); y <= Math.min(height - 1, seedY + 3); y++) {
      for (let x = Math.max(0, seedX - 3); x <= Math.min(width - 1, seedX + 3); x++) {
        const index = y * width + x;
        if (!foreground[index]) continue;
        for (let channel = 0; channel < 3; channel++) samples[channel].push(data[index * 4 + channel]);
      }
    }
    [sr, sg, sb] = samples.map(values => values.sort((a, b) => a - b)[values.length >> 1]);
  }
  // 容差 0–100 映射为 0–255 的通道差；比较平方距离避免逐像素开方
  const tolerance = Math.round(settings.tolerance / 100 * 255);
  const toleranceSq = tolerance * tolerance * 3;
  // 硬线：与种子色差超过“容差 + 固定余量”的像素视为实线，无论多细都不可跨越——
  // 草图里浅色辅助线/排线可被忽略，深色轮廓始终是边界，避免“忽略细线”把填色漏到轮廓外
  const hard = Math.round(Math.min(100, settings.tolerance + LIGHTBOX_FILL_HARD_MARGIN) / 100 * 255);
  const hardSq = hard * hard * 3;
  const withinTolerance = new Uint8Array(total);
  const hardLine = new Uint8Array(total);
  const seedChromaX = 2 * sr - sg - sb;
  const seedChromaY = Math.sqrt(3) * (sg - sb);
  const seedChromaSq = seedChromaX ** 2 + seedChromaY ** 2;
  const seedHigh = Math.max(sr, sg, sb);
  const seedSpread = seedHigh - Math.min(sr, sg, sb);
  const seedSaturation = seedSpread / Math.max(1, seedHigh);
  const useHue = !settings.sketch && sa >= 128 && (seedSpread >= 32 || (foreground && seedSpread >= 20 && seedSaturation >= 0.32));
  const minimumSaturation = Math.min(0.24, seedSaturation);
  const hueCosSq = Math.cos((8 + settings.tolerance * 0.24) * Math.PI / 180) ** 2;
  const lightness = p => (54 * data[p] + 183 * data[p + 1] + 19 * data[p + 2]) / 256;
  const seedLight = (54 * sr + 183 * sg + 19 * sb) / 256;
  const useNeutralMaterial = !settings.sketch && !useHue && sa >= 128 && seedLight >= 128;
  const useDarkMaterial = !settings.sketch && settings.boundaryStrength == null && !useHue && sa >= 128 && seedLight < 128;
  const materialLightRange = 30 + settings.tolerance * 0.45;
  const darkMaterialCeiling = Math.min(158, seedLight + materialLightRange);
  const materialLightFloor = Math.max(52, seedLight * (0.54 - settings.tolerance * 0.006));
  const rowStride = width * 4;
  for (let i = 0, p = 0; i < total; i++, p += 4) {
    if (foreground && !foreground[i]) {
      hardLine[i] = 1;
      continue;
    }
    const dr = data[p] - sr, dg = data[p + 1] - sg, db = data[p + 2] - sb;
    const distanceSq = dr * dr + dg * dg + db * db;
    const alphaClose = Math.abs(data[p + 3] - sa) <= tolerance;
    if (settings.boundaryStrength != null && p !== seed) {
      const strength = settings.boundaryStrength / 100;
      const edgeLimit = 82 - 50 * strength;
      const x = i % width;
      const light = lightness(p);
      const edge = (x > 0 && x < width - 1 && Math.abs(lightness(p - 4) - lightness(p + 4)) >= edgeLimit) ||
        (i >= width && i < total - width && Math.abs(lightness(p - rowStride) - lightness(p + rowStride)) >= edgeLimit);
      const warmShift = (data[p] - data[p + 2]) - (sr - sb);
      if (edge || Math.abs(warmShift) > 56 - 32 * strength || Math.abs(light - seedLight) > 112 - 54 * strength || data[p + 3] < 128) {
        hardLine[i] = 1;
        continue;
      }
    }
    if (useDarkMaterial) {
      const light = lightness(p);
      const column = i % width;
      const row = Math.floor(i / width);
      const high = Math.max(data[p], data[p + 1], data[p + 2]);
      const spread = high - Math.min(data[p], data[p + 1], data[p + 2]);
      // Keep silhouette edges independent of the tolerance and thin-line sliders.
      const edge = (column > 0 && column < width - 1 &&
        Math.abs(lightness(p - 4) - lightness(p + 4)) >= 36) ||
        (row > 0 && row < height - 1 &&
          Math.abs(lightness(p - rowStride) - lightness(p + rowStride)) >= 36);
      // Keep cool gray panels separate from warm pavement of similar brightness.
      const warmShift = (data[p] - data[p + 2]) - (sr - sb);
      const sameMaterial = light >= seedLight - materialLightRange && light <= darkMaterialCeiling &&
        spread <= 31 && Math.abs(warmShift) <= 20;
      if (p === seed || (alphaClose && data[p + 3] >= 128 && sameMaterial && !edge)) {
        withinTolerance[i] = 1;
      } else {
        hardLine[i] = 1;
      }
      continue;
    }
    if (useHue && alphaClose) {
      const chromaX = 2 * data[p] - data[p + 1] - data[p + 2];
      const chromaY = Math.sqrt(3) * (data[p + 1] - data[p + 2]);
      const chromaSq = chromaX ** 2 + chromaY ** 2;
      const projection = chromaX * seedChromaX + chromaY * seedChromaY;
      const light = lightness(p);
      // A bright reflection can carry very little pigment, while a dark seam
      // can retain the same hue as the panels it separates.
      const high = Math.max(data[p], data[p + 1], data[p + 2]);
      const spread = high - Math.min(data[p], data[p + 1], data[p + 2]);
      const saturationFloor = light >= 190 ? 0.03 : foreground ? minimumSaturation * 0.65 : minimumSaturation;
      const sameHue = light >= 12 && spread >= Math.max(6, high * saturationFloor) && projection > 0 &&
        projection ** 2 >= chromaSq * seedChromaSq * hueCosSq;
      const column = i % width;
      const row = Math.floor(i / width);
      const seam = i * 4 !== seed && (
        (column > 0 && column < width - 1 &&
          Math.min(lightness(p - 4), lightness(p + 4)) - light >= 30) ||
        (row > 0 && row < height - 1 &&
          Math.min(lightness(p - rowStride), lightness(p + rowStride)) - light >= 30)
      );
      if (sameHue && (!seam || foreground)) withinTolerance[i] = 1;
      else hardLine[i] = 1;
      continue;
    }
    if (useNeutralMaterial && alphaClose) {
      const high = Math.max(data[p], data[p + 1], data[p + 2]);
      const spread = high - Math.min(data[p], data[p + 1], data[p + 2]);
      if (lightness(p) >= materialLightFloor && spread <= Math.max(24, high * 0.2)) withinTolerance[i] = 1;
      else hardLine[i] = 1;
      continue;
    }
    if (settings.sketch && seedLight - lightness(p) >= 72 && lightness(p) < 112) hardLine[i] = 1;
    else if (distanceSq <= toleranceSq && alphaClose) withinTolerance[i] = 1;
    else if (distanceSq > hardSq || !alphaClose) hardLine[i] = 1;
  }
  // 忽略细线：膨胀可通行区，使宽度不超过 2×radius 的浅色线条可被跨过；硬线像素随后恢复为不可通行
  const radius = Math.ceil(Math.max(0, settings.lineWidth) / 2);
  const passable = new Uint8Array(total);
  const scratch = new Uint8Array(total);
  dilateBinaryMask(withinTolerance, width, height, radius, passable, scratch);
  if (radius > 0) for (let i = 0; i < total; i++) if (hardLine[i]) passable[i] = 0;
  let filled = new Uint8Array(total);
  const separateSeams = (useHue && !foreground) || useNeutralMaterial || useDarkMaterial;
  const seamRadius = separateSeams ? Math.max(2, Math.min(8, Math.round(Math.min(width, height) / 280))) : 0;
  if (settings.smart) {
    floodLightboxMaterialEdges(source, withinTolerance, seedIndex, filled);
  } else if (seamRadius) {
    const core = new Uint8Array(total);
    erodeBinaryMask(passable, width, height, seamRadius, core, scratch);
    if (core[seed >> 2]) {
      floodFillMask(core, width, height, seedX, seedY, filled);
      dilateBinaryMask(filled, width, height, seamRadius, core, scratch);
      for (let i = 0; i < total; i++) filled[i] = core[i] & passable[i];
    } else {
      floodFillMask(passable, width, height, seedX, seedY, filled);
    }
  } else {
    floodFillMask(passable, width, height, seedX, seedY, filled);
  }
  if (radius > 0) {
    // 闭运算（先膨胀后腐蚀）：把区域内部两侧都已填色、宽度不超过 2×radius 的线条（辅助线、排线、硬线）一并填满，
    // 得到整块实心区域；外轮廓两侧只有一侧填色，腐蚀会把它还原，不会漏到相邻区域
    dilateBinaryMask(filled, width, height, radius, passable, scratch);
    erodeBinaryMask(passable, width, height, radius, filled, scratch);
  }
  if (foreground) {
    // Remove isolated edge pixels and fill pinholes without expanding the subject.
    passable.set(filled);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x;
        if (!foreground[i] || i === seedIndex) continue;
        const neighbors = passable[i - width - 1] + passable[i - width] + passable[i - width + 1] +
          passable[i - 1] + passable[i + 1] + passable[i + width - 1] + passable[i + width] + passable[i + width + 1];
        if (neighbors >= 7) filled[i] = 1;
        if (neighbors <= 2) filled[i] = 0;
      }
    }
  }
  let count = 0;
  for (let i = 0; i < total; i++) {
    if ((foreground && !foreground[i]) || (useDarkMaterial && hardLine[i])) filled[i] = 0;
    count += filled[i];
  }
  return { mask: filled, count };
}

function floodLightboxMaterialEdges(source, candidates, seed, visited) {
  const { width, height, data } = source;
  const queue = new Uint32Array(width * height);
  let head = 0;
  let tail = 0;
  const enqueue = (from, to) => {
    if (!candidates[to] || visited[to]) return;
    const a = from * 4;
    const b = to * 4;
    const r = data[a] - data[b];
    const g = data[a + 1] - data[b + 1];
    const blue = data[a + 2] - data[b + 2];
    if (Math.abs(r - blue) > 24 || Math.abs(g - blue) > 24 || Math.abs((54 * r + 183 * g + 19 * blue) / 256) > 44) return;
    visited[to] = 1;
    queue[tail++] = to;
  };
  visited[seed] = 1;
  queue[tail++] = seed;
  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    if (x > 0) enqueue(index, index - 1);
    if (x < width - 1) enqueue(index, index + 1);
    if (index >= width) enqueue(index, index - width);
    if (index < visited.length - width) enqueue(index, index + width);
  }
}

function selectMaterialRegion(source, seedX, seedY, { tolerance, foreground }) {
  const { width, height, data } = source;
  const size = width * height;
  const mask = new Uint8Array(size);
  const seed = seedY * width + seedX;
  if (data[seed * 4 + 3] < 128 || (foreground && !foreground[seed])) return { mask, count: 0 };

  const light = new Uint8Array(size);
  const redBlue = new Float32Array(size);
  const greenBlue = new Float32Array(size);
  for (let i = 0, p = 0; i < size; i++, p += 4) {
    const r = data[p], g = data[p + 1], b = data[p + 2];
    light[i] = (54 * r + 183 * g + 19 * b) / 256;
    const normalization = Math.max(48, r + g + b);
    redBlue[i] = (r - b) / normalization;
    greenBlue[i] = (g - b) / normalization;
  }
  const seedLight = light[seed];
  const seedRed = redBlue[seed];
  const seedGreen = greenBlue[seed];
  const chromatic = Math.hypot(seedRed, seedGreen) >= 0.12;
  const strength = Math.min(150, Math.max(0, tolerance)) / 150;
  const colorRange = (chromatic ? 0.12 : 0.07) + strength * 0.10;
  const lightRange = (chromatic ? 95 : 26) + strength * (chromatic ? 65 : 36);
  const edgeLight = 20 + strength * 16;
  const edgeColor = 0.065 + strength * 0.05;
  const queue = new Uint32Array(size);
  let count = 1;
  queue[0] = seed;
  mask[seed] = 1;

  const visit = (from, next) => {
    if (mask[next] || data[next * 4 + 3] < 128 || (foreground && !foreground[next])) return;
    if (Math.abs(light[next] - seedLight) > lightRange ||
        Math.hypot(redBlue[next] - seedRed, greenBlue[next] - seedGreen) > colorRange) return;
    if (Math.abs(light[next] - light[from]) > edgeLight ||
        Math.hypot(redBlue[next] - redBlue[from], greenBlue[next] - greenBlue[from]) > edgeColor) return;
    mask[next] = 1;
    queue[count++] = next;
  };
  for (let head = 0; head < count; head++) {
    const i = queue[head];
    const x = i % width;
    if (x > 0) visit(i, i - 1);
    if (x < width - 1) visit(i, i + 1);
    if (i >= width) visit(i, i - width);
    if (i < size - width) visit(i, i + width);
  }
  return { mask, count };
}

function writeSketchFillPixel(output, original, offset, color, keepInk) {
  const light = (54 * original[offset] + 183 * original[offset + 1] + 19 * original[offset + 2]) / 256;
  // Treat near-white paper as transparent and retain lighter pencil marks as shading.
  const transmission = keepInk ? Math.max(0, Math.min(1, (light - 16) / 232)) : 1;
  for (let channel = 0; channel < 3; channel++) {
    output[offset + channel] = color[channel] * transmission;
  }
}

function prepareSketchSelection(source, inkThreshold = 85, gapRadius = 1) {
  const { width, height, data } = source;
  const total = width * height;
  const ink = new Uint8Array(total);
  const gray = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    const p = i * 4;
    gray[i] = data[p + 3] < 128 ? 255 : (54 * data[p] + 183 * data[p + 1] + 19 * data[p + 2]) / 256;
  }
  const localContrast = Math.max(12, 38 - inkThreshold / 4);
  const reach = Math.max(2, Math.min(5, Math.round(Math.min(width, height) / 300)));
  const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const light = gray[i];
      if (light < inkThreshold) {
        ink[i] = 1;
        continue;
      }
      if (light > 235) continue;
      // Pencil lines are darker than the paper on both sides. A gray face
      // with just one bright edge should not turn into a solid ink region.
      for (const [dx, dy] of directions) {
        const ax = x - dx * reach, ay = y - dy * reach;
        const bx = x + dx * reach, by = y + dy * reach;
        if (ax < 0 || ax >= width || bx < 0 || bx >= width ||
            ay < 0 || ay >= height || by < 0 || by >= height) continue;
        if (Math.min(gray[ay * width + ax], gray[by * width + bx]) - light >= localContrast) {
          ink[i] = 1;
          break;
        }
      }
    }
  }
  if (gapRadius > 0) {
    const expanded = new Uint8Array(total);
    const scratch = new Uint8Array(total);
    dilateBinaryMask(ink, width, height, gapRadius, expanded, scratch);
    erodeBinaryMask(expanded, width, height, gapRadius, ink, scratch);
  }
  suppressSketchPinholeRegions(ink, width, height);
  const prepared = new Uint8ClampedArray(data);
  for (let i = 0; i < total; i++) {
    const p = i * 4;
    prepared[p] = prepared[p + 1] = prepared[p + 2] = ink[i] ? 0 : 255;
  }
  return { width, height, data: prepared };
}

function suppressSketchPinholeRegions(ink, width, height, maxSpan = Math.max(5, Math.min(10, Math.round(Math.min(width, height) / 100))), maxArea = maxSpan * 3) {
  const seen = new Uint8Array(ink.length);
  const queue = new Uint32Array(ink.length);
  let tail = 0;
  const enqueue = index => {
    if (ink[index] || seen[index]) return;
    seen[index] = 1;
    queue[tail++] = index;
  };
  for (let start = 0; start < ink.length; start++) {
    if (ink[start] || seen[start]) continue;
    tail = 0;
    enqueue(start);
    let minX = width, minY = height, maxX = 0, maxY = 0;
    for (let head = 0; head < tail; head++) {
      const index = queue[head];
      const x = index % width;
      const y = Math.floor(index / width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      if (x > 0) enqueue(index - 1);
      if (x < width - 1) enqueue(index + 1);
      if (y > 0) enqueue(index - width);
      if (y < height - 1) enqueue(index + width);
    }
    const enclosed = minX > 0 && minY > 0 && maxX < width - 1 && maxY < height - 1;
    if (enclosed && tail <= maxArea && maxX - minX < maxSpan && maxY - minY < maxSpan) {
      for (let i = 0; i < tail; i++) ink[queue[i]] = 1;
    }
  }
}

function sketchSelectionTouchesBorder(mask, width, height) {
  const bottom = (height - 1) * width;
  for (let x = 0; x < width; x++) {
    if (mask[x] || mask[bottom + x]) return true;
  }
  for (let y = 1; y < height - 1; y++) {
    const row = y * width;
    if (mask[row] || mask[row + width - 1]) return true;
  }
  return false;
}

function findSketchInteriorPoint(source, x, y) {
  const { width, height, data } = source;
  let point = null;
  let distance = Infinity;
  for (let row = Math.max(0, y - 6); row <= Math.min(height - 1, y + 6); row++) {
    for (let column = Math.max(0, x - 6); column <= Math.min(width - 1, x + 6); column++) {
      const offset = (row * width + column) * 4;
      const candidate = (column - x) ** 2 + (row - y) ** 2;
      if (candidate > 36 || candidate >= distance || data[offset] !== 255 || data[offset + 3] < 128) continue;
      point = { x: column, y: row };
      distance = candidate;
    }
  }
  return point;
}
