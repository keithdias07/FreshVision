// Local, in-browser image heuristics. These are hand-crafted colour/texture
// measurements — NOT a trained spoilage detector.

export interface Indicator {
  key: string;
  label: string;
  value: number; // raw measurement (fraction or normalised metric)
  display: string;
  contribution: number; // 0-100 sub-score after normalisation
  weight: number;
  note: string;
}

export interface VisionResult {
  visualScore: number; // 0-100 heuristic
  indicators: Indicator[];
  foregroundPct: number;
  segmentationFallback: boolean;
  hueHistogram: number[]; // 12 bins, normalised
  overlayUrl: string;
  boxes: { x: number; y: number; w: number; h: number; kind: string }[];
  width: number;
  height: number;
  ms: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : d / max, max];
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode this image. Try a JPG or PNG.'));
    img.src = src;
  });
}

export async function analyzeImage(img: HTMLImageElement): Promise<VisionResult> {
  const t0 = performance.now();
  const maxSide = 320;
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const W = Math.max(8, Math.round(img.naturalWidth * scale));
  const H = Math.max(8, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas not available in this browser.');
  ctx.drawImage(img, 0, 0, W, H);
  const { data } = ctx.getImageData(0, 0, W, H);
  const N = W * H;

  // 1) Background model from the border frame
  const border = Math.max(2, Math.round(Math.min(W, H) * 0.04));
  let br = 0, bg = 0, bb = 0, bn = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (x < border || y < border || x >= W - border || y >= H - border) {
      const i = (y * W + x) * 4;
      br += data[i]; bg += data[i + 1]; bb += data[i + 2]; bn++;
    }
  }
  br /= bn; bg /= bn; bb /= bn;
  let bvar = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (x < border || y < border || x >= W - border || y >= H - border) {
      const i = (y * W + x) * 4;
      bvar += (data[i] - br) ** 2 + (data[i + 1] - bg) ** 2 + (data[i + 2] - bb) ** 2;
    }
  }
  const bstd = Math.sqrt(bvar / bn / 3);
  const thr = Math.max(38, 2.5 * bstd);

  const fg = new Uint8Array(N);
  const gray = new Float32Array(N);
  const hsv = new Float32Array(N * 3);
  let fgCount = 0;
  for (let p = 0; p < N; p++) {
    const i = p * 4;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const dist = Math.sqrt(((r - br) ** 2 + (g - bg) ** 2 + (b - bb) ** 2) / 3);
    if (dist > thr) { fg[p] = 1; fgCount++; }
    gray[p] = 0.299 * r + 0.587 * g + 0.114 * b;
    const [h, s, v] = rgbToHsv(r, g, b);
    hsv[p * 3] = h; hsv[p * 3 + 1] = s; hsv[p * 3 + 2] = v;
  }
  let fallback = false;
  if (fgCount < N * 0.08 || fgCount > N * 0.97) {
    // Busy or close-up image: treat the full frame as produce.
    fallback = true;
    fg.fill(1); fgCount = N;
  }

  // 2) Pixel-level indicators inside the foreground
  const flag = new Uint8Array(N); // 1 dark, 2 brown, 3 pale
  let dark = 0, brown = 0, pale = 0;
  let sx = 0, sy = 0, vSum = 0, vSq = 0;
  const hist = new Array(12).fill(0);
  for (let p = 0; p < N; p++) {
    if (!fg[p]) continue;
    const h = hsv[p * 3], s = hsv[p * 3 + 1], v = hsv[p * 3 + 2];
    vSum += v; vSq += v * v;
    if (s > 0.15) {
      const rad = (h * Math.PI) / 180;
      sx += Math.cos(rad) * s; sy += Math.sin(rad) * s;
      hist[Math.floor(h / 30) % 12] += 1;
    }
    if (v < 0.22) { flag[p] = 1; dark++; }
    else if (h >= 12 && h <= 42 && s > 0.35 && v < 0.5) { flag[p] = 2; brown++; }
    else if (s < 0.12 && v > 0.55 && v < 0.93) { flag[p] = 3; pale++; }
  }
  const fgN = Math.max(1, fgCount);
  const darkF = dark / fgN, brownF = brown / fgN, paleF = pale / fgN;
  // circular hue dispersion (0 = uniform colour, 1 = very mixed)
  const satCount = hist.reduce((a, b) => a + b, 0) || 1;
  const R = Math.sqrt(sx * sx + sy * sy) / satCount;
  const hueDispersion = clamp01(1 - R / 0.6);
  const vMean = vSum / fgN;
  const vStd = Math.sqrt(Math.max(0, vSq / fgN - vMean * vMean));

  // 3) Texture: mean |Laplacian| inside foreground (wrinkling, pitting, mould fuzz)
  let lap = 0, lapN = 0;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const p = y * W + x;
    if (!fg[p]) continue;
    const l = Math.abs(4 * gray[p] - gray[p - 1] - gray[p + 1] - gray[p - W] - gray[p + W]);
    lap += l; lapN++;
  }
  const texture = lapN ? lap / lapN : 0;

  const indicators: Indicator[] = [
    { key: 'dark', label: 'Dark lesions', value: darkF, display: `${(darkF * 100).toFixed(1)}% of produce area`, contribution: clamp01(darkF / 0.06) * 100, weight: 0.32, note: 'Very low-brightness pixels (V < 0.22). Can also be shadows or naturally dark skin.' },
    { key: 'brown', label: 'Brown discoloration', value: brownF, display: `${(brownF * 100).toFixed(1)}% of produce area`, contribution: clamp01(brownF / 0.1) * 100, weight: 0.28, note: 'Orange-brown hue (12–42°) at mid-low brightness — typical of bruising/oxidation.' },
    { key: 'pale', label: 'Pale / whitish patches', value: paleF, display: `${(paleF * 100).toFixed(1)}% of produce area`, contribution: clamp01(paleF / 0.15) * 100, weight: 0.14, note: 'Desaturated light pixels. Possible mould bloom — or simply glare/packaging.' },
    { key: 'hue', label: 'Colour variation', value: hueDispersion, display: `dispersion ${hueDispersion.toFixed(2)} · brightness σ ${vStd.toFixed(2)}`, contribution: clamp01(hueDispersion * 0.7 + vStd / 0.3 * 0.3) * 100, weight: 0.12, note: 'Uneven colour across the surface. Mixed-colour produce (e.g. apples) scores higher naturally.' },
    { key: 'texture', label: 'Surface texture', value: texture, display: `mean |∇²| ${texture.toFixed(1)}`, contribution: clamp01((texture - 6) / 22) * 100, weight: 0.14, note: 'Local Laplacian energy. Wrinkling or fuzz increases it; image noise/JPEG artefacts also do.' },
  ];
  const visualScore = Math.round(indicators.reduce((a, i) => a + i.contribution * i.weight, 0));

  // 4) Annotation overlay + boxes over the densest suspicious cells
  const ov = document.createElement('canvas');
  ov.width = W; ov.height = H;
  const octx = ov.getContext('2d')!;
  const od = octx.createImageData(W, H);
  const colors: Record<number, [number, number, number]> = { 1: [220, 38, 38], 2: [234, 140, 20], 3: [96, 165, 250] };
  for (let p = 0; p < N; p++) {
    const f = flag[p];
    if (!f) continue;
    const c = colors[f];
    od.data[p * 4] = c[0]; od.data[p * 4 + 1] = c[1]; od.data[p * 4 + 2] = c[2]; od.data[p * 4 + 3] = 150;
  }
  octx.putImageData(od, 0, 0);

  const G = 12, cw = W / G, ch = H / G;
  const cells: { x: number; y: number; frac: number; kind: string }[] = [];
  for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
    let n = 0, f = 0; const kinds = [0, 0, 0, 0];
    for (let y = Math.floor(gy * ch); y < Math.floor((gy + 1) * ch); y++)
      for (let x = Math.floor(gx * cw); x < Math.floor((gx + 1) * cw); x++) {
        const p = y * W + x;
        if (!fg[p]) continue;
        n++;
        if (flag[p] === 1 || flag[p] === 2) { f++; kinds[flag[p]]++; }
      }
    if (n > (cw * ch) * 0.3 && f / n > 0.2) cells.push({ x: gx, y: gy, frac: f / n, kind: kinds[1] >= kinds[2] ? 'dark' : 'brown' });
  }
  cells.sort((a, b) => b.frac - a.frac);
  const boxes = cells.slice(0, 6).map(c => ({ x: c.x / G, y: c.y / G, w: 1 / G, h: 1 / G, kind: c.kind }));

  return {
    visualScore, indicators,
    foregroundPct: Math.round((fgCount / N) * 100),
    segmentationFallback: fallback,
    hueHistogram: hist.map(h => h / satCount),
    overlayUrl: ov.toDataURL(),
    boxes, width: W, height: H,
    ms: Math.round(performance.now() - t0),
  };
}

/** Procedurally drawn sample images so the demo works offline without assets. */
export function makeSampleImage(kind: 'fresh' | 'bruised' | 'mouldy'): string {
  const c = document.createElement('canvas');
  c.width = 480; c.height = 360;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f3efe4'; g.fillRect(0, 0, 480, 360);
  let seed = kind === 'fresh' ? 7 : kind === 'bruised' ? 13 : 29;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const drawFruit = (cx: number, cy: number, r: number) => {
    const grad = g.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
    grad.addColorStop(0, '#f2685a'); grad.addColorStop(0.7, '#c8281f'); grad.addColorStop(1, '#8d1712');
    g.fillStyle = grad; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.ellipse(cx - r * 0.35, cy - r * 0.4, r * 0.18, r * 0.1, -0.6, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#5b3a1a'; g.lineWidth = 5; g.beginPath(); g.moveTo(cx, cy - r + 4); g.lineTo(cx + 6, cy - r - 18); g.stroke();
    if (kind !== 'fresh') {
      const spots = kind === 'bruised' ? 5 : 3;
      for (let i = 0; i < spots; i++) {
        const a = rnd() * Math.PI * 2, d = rnd() * r * 0.6;
        const sr = r * (0.12 + rnd() * 0.18);
        const sg = g.createRadialGradient(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1, cx + Math.cos(a) * d, cy + Math.sin(a) * d, sr);
        sg.addColorStop(0, '#2b1607'); sg.addColorStop(0.6, '#6b3a12'); sg.addColorStop(1, 'rgba(120,60,20,0)');
        g.fillStyle = sg; g.beginPath(); g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, sr, 0, Math.PI * 2); g.fill();
      }
    }
    if (kind === 'mouldy') {
      for (let i = 0; i < 900; i++) {
        const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * r * 0.35;
        const x = cx + r * 0.25 + Math.cos(a) * d, y = cy + r * 0.2 + Math.sin(a) * d;
        g.fillStyle = `rgba(${220 + rnd() * 30},${225 + rnd() * 25},${215 + rnd() * 30},0.8)`;
        g.fillRect(x, y, 2, 2);
      }
    }
  };
  drawFruit(160, 190, 105);
  drawFruit(330, 175, 95);
  return c.toDataURL('image/png');
}
