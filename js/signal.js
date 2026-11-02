// The home page name is a sample from a diffusion model, and the slider sets t,
// the noise level. Five views of the same process share that slider:
//   SDE, ODE and flow draw particles along paths from sampler.worker.js.
//   One step draws the denoiser's guess E[x_0 | x_t] along the ODE paths.
//   Fokker-Planck draws the density itself: the name scaled by alpha_t and blurred
//   by sigma_t, which is the exact solution for this process.
// The real <h1> holds the text, so the page works without this script.

import { createPicker, createTrack } from "./controls.js";

const PLAY_MS = 2600;
const KNOTS = 40;
const CENTERS = 260;
const NOISE_SCALE = 0.24; // the noise's standard deviation, as a share of the canvas
const TRACE_COUNT = 34;
const SDE_TRACE_COUNT = 10;
const SDE_TRACE_FROM = 12; // the SDE takes huge kicks near t = 1, so its traces start later
const CELL = 3; // device pixels per density cell
const LEVELS = 7;
const PURPLE = [122, 43, 232];
const INK = [31, 10, 77];

const MODES = {
  sde: {
    equation: "d<i>x</i> = [<i>f</i> − <i>g</i>²∇log <i>p<sub>t</sub></i>(<i>x</i>)] d<i>t</i> + <i>g</i> d<i>W̄</i>",
    href: "/academia/diffusion",
    note: "Each particle walks back at random. Sample my name again and you get new paths.",
  },
  ode: {
    equation: "d<i>x</i> = [<i>f</i> − ½<i>g</i>²∇log <i>p<sub>t</sub></i>(<i>x</i>)] d<i>t</i>",
    href: "/academia/diffusion",
    note: "You get the SDE's density without the randomness. Each start has one path.",
  },
  flow: {
    equation: "<i>x<sub>t</sub></i> = (1 − <i>t</i>)<i>x</i><sub>0</sub> + <i>t</i>ε,  d<i>x</i> = <i>u<sub>t</sub></i>(<i>x</i>) d<i>t</i>",
    href: "/academia/diffusion",
    note: "Flow matching uses a straight-line schedule, so paths bend less than the ODE's.",
  },
  step: {
    equation: "<i>x̂</i><sub>0</sub> = E[<i>x</i><sub>0</sub> | <i>x<sub>t</sub></i>]",
    href: "/academia/diffusion",
    note: "One jump to the best guess. At full noise, that guess is the average of my name.",
  },
  density: {
    equation: "∂<sub><i>t</i></sub><i>p<sub>t</sub></i> = −div(<i>p<sub>t</sub> f</i>) + ½<i>g</i>²Δ<i>p<sub>t</sub></i>",
    href: "/academia/fokker-planck",
    note: "These contours show the density the SDE and ODE both follow. Drag toward noise and it spreads.",
  },
};

const root = document.documentElement;
const canvas = document.querySelector(".signal-canvas");
const heading = document.querySelector(".signal-name");
const slider = document.querySelector("[data-noise]");
const readout = document.querySelector("[data-noise-value]");
const modeInputs = [...document.querySelectorAll('input[name="sampler"]')];
const sampleButton = document.querySelector("[data-sample]");
const equation = document.querySelector("[data-equation]");
const note = document.querySelector("[data-note]");
const stillMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

function showNameOnly() {
  root.classList.remove("signal-pending", "has-js");
  heading.style.opacity = "";
}

function gaussian() {
  const u = 1 - Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}

function smooth(x) {
  return x * x * (3 - 2 * x);
}

let worker = null;
let ctx = null;
let image = null;
let pixels = null;
let width = 0;
let height = 0;
let scaleX = 0;
let scaleY = 0;
let dotSize = 2;

let count = 0;
let eps = null;
let cx = null;
let cy = null;
let tMinFor = {};
let results = {};
let round = 0;
let queue = [];
let working = false;

let mode = "ode";
let t = stillMotion ? 0 : 1;
let playStart = null;
let framePending = false;
let track = null;
let picker = null;

// The density view works on a coarse grid of the same canvas.
let gridWidth = 0;
let gridHeight = 0;
let inkX = null;
let inkY = null;
let gridA = null;
let gridB = null;
let gridC = null;
let gridLevel = null;
let gridCanvas = null;
let gridCtx = null;
let gridImage = null;

function nameMask() {
  const buffer = document.createElement("canvas");
  buffer.width = width;
  buffer.height = height;
  const g = buffer.getContext("2d", { willReadFrequently: true });
  const style = getComputedStyle(heading);
  const origin = canvas.getBoundingClientRect();
  const dpr = width / origin.width;
  g.font = `${style.fontWeight} ${parseFloat(style.fontSize) * dpr}px ${style.fontFamily}`;
  g.textBaseline = "alphabetic";
  g.textAlign = "center";
  // Each letter sits at its own angle and height, so draw it the same way here.
  heading.querySelectorAll(".letter").forEach((letter) => {
    const rect = letter.getBoundingClientRect();
    const metrics = g.measureText(letter.textContent);
    const ascent = metrics.fontBoundingBoxAscent;
    const descent = metrics.fontBoundingBoxDescent;
    const boxHeight = letter.offsetHeight * dpr;
    const angle = parseFloat(letter.style.getPropertyValue("--r")) || 0;
    g.save();
    g.translate(
      (rect.left + rect.width / 2 - origin.left) * dpr,
      (rect.top + rect.height / 2 - origin.top) * dpr,
    );
    g.rotate((angle * Math.PI) / 180);
    g.fillText(letter.textContent, 0, -boxHeight / 2 + (boxHeight - (ascent + descent)) / 2 + ascent);
    g.restore();
  });
  return g.getImageData(0, 0, width, height).data;
}

function inked(mask, x, y) {
  return mask[(y * width + x) * 4 + 3] > 128;
}

function build() {
  const origin = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  width = Math.round(origin.width * dpr);
  height = Math.round(origin.height * dpr);
  if (!width || !height) return false;

  canvas.width = width;
  canvas.height = height;
  ctx = canvas.getContext("2d");
  image = ctx.createImageData(width, height);
  pixels = new Uint32Array(image.data.buffer);
  scaleX = width * NOISE_SCALE;
  scaleY = height * NOISE_SCALE;
  dotSize = Math.max(2, Math.round(2 * dpr));

  const mask = nameMask();
  let solid = 0;
  for (let i = 3; i < mask.length; i += 4) if (mask[i] > 128) solid++;
  if (!solid) return false;

  // Dataset points on a grid that is even in noise units, where the noise is isotropic.
  const spacing = Math.sqrt(solid / (scaleX * scaleY) / CENTERS);
  const stepX = Math.max(1, Math.round(spacing * scaleX));
  const stepY = Math.max(1, Math.round(spacing * scaleY));
  const pointsX = [];
  const pointsY = [];
  for (let y = Math.floor(stepY / 2); y < height; y += stepY) {
    for (let x = Math.floor(stepX / 2); x < width; x += stepX) {
      if (inked(mask, x, y)) {
        pointsX.push((x - width / 2) / scaleX);
        pointsY.push((y - height / 2) / scaleY);
      }
    }
  }
  if (!pointsX.length) return false;
  cx = Float32Array.from(pointsX);
  cy = Float32Array.from(pointsY);

  // Stop once sigma_t / alpha_t matches the point spacing. The name takes over from there.
  const stopAt = spacing * 0.6;
  const vp = (2 / Math.PI) * Math.atan(stopAt);
  tMinFor = { sde: vp, ode: vp, flow: stopAt / (1 + stopAt) };

  count = window.innerWidth < 720 ? 6000 : 12000;
  buildDensity(mask);
  return true;
}

function buildDensity(mask) {
  gridWidth = Math.ceil(width / CELL);
  gridHeight = Math.ceil(height / CELL);
  const xs = [];
  const ys = [];
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const px = Math.min(width - 1, x * CELL + 1);
      const py = Math.min(height - 1, y * CELL + 1);
      if (inked(mask, px, py)) {
        xs.push(x - gridWidth / 2);
        ys.push(y - gridHeight / 2);
      }
    }
  }
  inkX = Float32Array.from(xs);
  inkY = Float32Array.from(ys);
  const size = gridWidth * gridHeight;
  gridA = new Float32Array(size);
  gridB = new Float32Array(size);
  gridC = new Float32Array(size);
  gridLevel = new Float32Array(size);
  gridCanvas = document.createElement("canvas");
  gridCanvas.width = gridWidth;
  gridCanvas.height = gridHeight;
  gridCtx = gridCanvas.getContext("2d");
  gridImage = gridCtx.createImageData(gridWidth, gridHeight);
}

function startWorker() {
  worker = new Worker(new URL("./sampler.worker.js", import.meta.url), { type: "module" });
  worker.onerror = showNameOnly;
  worker.onmessage = ({ data }) => {
    working = false;
    if (data.round === round) {
      results[data.kind] = data;
      wake();
    }
    nextJob();
  };
}

// Puts this view's sampler first, unless it is done or already running.
function prioritize(view) {
  const wanted = sourceOf(view);
  if (view === "density" || !queue.includes(wanted)) return;
  queue = [wanted, ...queue.filter((kind) => kind !== wanted)];
}

function nextJob() {
  if (working || !queue.length) return;
  const kind = queue.shift();
  working = true;
  // The worker takes copies, so eps stays here for the other samplers.
  worker.postMessage({ round, kind, eps, cx, cy, knots: KNOTS, tMin: tMinFor[kind] });
}

// New noise for every sampler. They all start from the same eps.
function newRound(first) {
  round += 1;
  eps = new Float32Array(2 * count);
  for (let i = 0; i < eps.length; i++) eps[i] = gaussian();
  results = {};
  // A job from the old noise is no use. Drop it instead of waiting for it.
  if (working) {
    worker.terminate();
    startWorker();
    working = false;
  }
  const wanted = sourceOf(first);
  queue = [wanted, ...["ode", "sde", "flow"].filter((kind) => kind !== wanted)];
  nextJob();
}

function sourceOf(view) {
  return view === "step" || view === "density" ? "ode" : view;
}

function paint(r, g, b, a) {
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

// Paths are stored from t = 1 to t = tMin. Returns the fractional knot for t.
function knotAt(kind) {
  const tMin = tMinFor[kind];
  return Math.min(KNOTS, Math.max(0, ((1 - t) / (1 - tMin)) * KNOTS));
}

function drawParticles(data, position, fade) {
  const low = Math.floor(position);
  const high = Math.min(KNOTS, low + 1);
  const mix = position - low;
  const lowRow = 2 * count * low;
  const highRow = 2 * count * high;
  const halfW = width / 2;
  const halfH = height / 2;
  const color = paint(PURPLE[0], PURPLE[1], PURPLE[2], Math.round(255 * fade));

  pixels.fill(0);
  for (let i = 0; i < count; i++) {
    const a = 2 * i;
    const ux = data[lowRow + a] + (data[highRow + a] - data[lowRow + a]) * mix;
    const uy = data[lowRow + a + 1] + (data[highRow + a + 1] - data[lowRow + a + 1]) * mix;
    const x = (halfW + ux * scaleX) | 0;
    const y = (halfH + uy * scaleY) | 0;
    if (x < 0 || y < 0 || x + dotSize >= width || y + dotSize >= height) continue;
    for (let row = 0; row < dotSize; row++) {
      const start = (y + row) * width + x;
      for (let col = 0; col < dotSize; col++) pixels[start + col] = color;
    }
  }
  ctx.putImageData(image, 0, 0);
}

// A few particles draw the road they took, so the samplers differ even at rest.
function drawTraces(data, position) {
  const stochastic = mode === "sde";
  const traces = stochastic ? SDE_TRACE_COUNT : TRACE_COUNT;
  const first = stochastic ? SDE_TRACE_FROM : 0;
  if (position <= first) return;
  const stride = Math.floor(count / traces);
  const halfW = width / 2;
  const halfH = height / 2;
  const last = Math.floor(position);
  const mix = position - last;
  ctx.lineWidth = Math.max(1, width / canvas.getBoundingClientRect().width);
  ctx.lineJoin = "round";
  ctx.strokeStyle = `rgba(${INK[0]}, ${INK[1]}, ${INK[2]}, 0.42)`;
  ctx.beginPath();
  for (let n = 0; n < traces; n++) {
    const a = 2 * n * stride;
    const start = 2 * count * first;
    ctx.moveTo(halfW + data[start + a] * scaleX, halfH + data[start + a + 1] * scaleY);
    for (let k = first + 1; k <= last; k++) {
      const row = 2 * count * k;
      ctx.lineTo(halfW + data[row + a] * scaleX, halfH + data[row + a + 1] * scaleY);
    }
    if (last < KNOTS) {
      const low = 2 * count * last;
      const high = low + 2 * count;
      ctx.lineTo(
        halfW + (data[low + a] + (data[high + a] - data[low + a]) * mix) * scaleX,
        halfH + (data[low + a + 1] + (data[high + a + 1] - data[low + a + 1]) * mix) * scaleY,
      );
    }
  }
  ctx.stroke();
}

// Blurs along the rows of src into dst with a running sum, so any radius costs the same.
function boxRows(src, dst, w, h, radius) {
  const span = 2 * radius + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    for (let x = -radius; x <= radius; x++) sum += x >= 0 && x < w ? src[row + x] : 0;
    for (let x = 0; x < w; x++) {
      dst[row + x] = sum / span;
      const leaving = x - radius;
      const entering = x + radius + 1;
      if (leaving >= 0) sum -= src[row + leaving];
      if (entering < w) sum += src[row + entering];
    }
  }
}

function boxColumns(src, dst, w, h, radius) {
  const span = 2 * radius + 1;
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -radius; y <= radius; y++) sum += y >= 0 && y < h ? src[y * w + x] : 0;
    for (let y = 0; y < h; y++) {
      dst[y * w + x] = sum / span;
      const leaving = y - radius;
      const entering = y + radius + 1;
      if (leaving >= 0) sum -= src[leaving * w + x];
      if (entering < h) sum += src[entering * w + x];
    }
  }
}

// Three box blurs of this radius have the variance of a Gaussian with this sigma.
function boxRadius(sigma) {
  return Math.round((Math.sqrt(4 * sigma * sigma + 1) - 1) / 2);
}

// p_t is p_0 scaled by alpha_t and convolved with N(0, sigma_t^2).
function drawDensity(fade) {
  const alpha = Math.cos((Math.PI / 2) * t);
  const sigma = Math.sin((Math.PI / 2) * t);
  const w = gridWidth;
  const h = gridHeight;
  const halfW = w / 2;
  const halfH = h / 2;

  gridA.fill(0);
  for (let i = 0; i < inkX.length; i++) {
    const x = Math.round(halfW + alpha * inkX[i]);
    const y = Math.round(halfH + alpha * inkY[i]);
    if (x >= 0 && y >= 0 && x < w && y < h) gridA[y * w + x] += 1;
  }

  const radiusX = boxRadius((sigma * scaleX) / CELL);
  const radiusY = boxRadius((sigma * scaleY) / CELL);
  let field = gridA;
  if (radiusX > 0) {
    boxRows(field, gridB, w, h, radiusX);
    boxRows(gridB, gridC, w, h, radiusX);
    boxRows(gridC, gridB, w, h, radiusX);
    field = gridB;
  }
  if (radiusY > 0) {
    const other = field === gridB ? gridA : gridB;
    boxColumns(field, gridC, w, h, radiusY);
    boxColumns(gridC, other, w, h, radiusY);
    boxColumns(other, gridC, w, h, radiusY);
    field = gridC;
  }

  // Each contour is half the density of the one inside it. Dividing the distance to
  // the nearest contour by the local slope gives a line of even width at any angle.
  const data = new Uint32Array(gridImage.data.buffer);
  const level = gridLevel;
  for (let i = 0; i < level.length; i++) {
    level[i] = field[i] > 0 ? Math.log2(field[i]) + LEVELS : -1;
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const here = level[i];
      if (here < 0) {
        data[i] = 0;
        continue;
      }
      const clipped = Math.min(here, LEVELS);
      const share = Math.floor(clipped) / LEVELS;
      const fill = 235 * share * share;
      const slope = Math.max(
        x + 1 < w ? Math.abs(level[i + 1] - here) : 0,
        y + 1 < h ? Math.abs(level[i + w] - here) : 0,
      );
      const near = Math.abs(clipped - Math.round(clipped)) / (slope + 1e-5);
      const line = here < LEVELS ? Math.max(0, 1 - near) : 0;
      const r = PURPLE[0] + (INK[0] - PURPLE[0]) * line;
      const g = PURPLE[1] + (INK[1] - PURPLE[1]) * line;
      const b = PURPLE[2] + (INK[2] - PURPLE[2]) * line;
      data[i] = paint(r | 0, g | 0, b | 0, Math.round(Math.max(fill, 170 * line) * fade));
    }
  }
  gridCtx.putImageData(gridImage, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(gridCanvas, 0, 0, w * CELL, h * CELL);
}

function render() {
  // Near t = 0 the real heading takes over from the particles.
  const name = 1 - smooth(Math.min(1, Math.max(0, (t - 0.012) / 0.06)));
  const fade = 1 - name;
  heading.style.opacity = name.toFixed(3);
  root.classList.remove("signal-pending");

  if (mode === "density") {
    if (fade > 0) drawDensity(fade);
    else ctx.clearRect(0, 0, width, height);
    return;
  }

  const source = results[sourceOf(mode)];
  if (!source) {
    // Until the sampler answers, the only known position is the noise itself.
    if (mode !== "step" && t >= 1) drawParticles(eps, 0, 1);
    return;
  }

  const kind = sourceOf(mode);
  const position = knotAt(kind);
  const data = mode === "step" ? source.guesses : source.paths;
  drawParticles(data, position, fade);
  drawTraces(data, position);
}

function setSlider() {
  slider.value = t.toFixed(2);
  readout.textContent = t.toFixed(2);
  track?.update(t);
}

function frame(now) {
  framePending = false;
  if (playStart !== null) {
    if (results[sourceOf(mode)] || mode === "density") {
      if (playStart === 0) playStart = now;
      const progress = Math.min((now - playStart) / PLAY_MS, 1);
      t = 1 - smooth(progress);
      setSlider();
      if (progress >= 1) playStart = null;
    }
  }
  render();
  if (playStart !== null) wake();
}

function wake() {
  if (framePending) return;
  framePending = true;
  requestAnimationFrame(frame);
}

// Runs t from 1 to 0, or jumps there when the visitor prefers no motion.
function play() {
  track?.halt();
  if (stillMotion) {
    t = 0;
    playStart = null;
  } else {
    t = 1;
    playStart = 0;
  }
  setSlider();
  wake();
}

function describe() {
  const info = MODES[mode];
  equation.innerHTML = info.equation;
  equation.href = info.href;
  note.textContent = info.note;
  sampleButton.classList.toggle("is-away", mode === "density");
  sampleButton.disabled = mode === "density";
  track?.setMode(mode);
  picker?.place();
  if (!stillMotion) {
    for (const node of [note, equation]) {
      node.animate(
        [
          { opacity: 0, transform: "translateY(5px)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: 320, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
      );
    }
  }
}

function listen() {
  const setNoise = (value) => {
    playStart = null;
    t = value;
    setSlider();
    wake();
  };
  slider.addEventListener("input", () => setNoise(parseFloat(slider.value)));
  track = createTrack({ root: document.querySelector("[data-track]"), onInput: setNoise });
  picker = createPicker(document.querySelector("[data-modes]"));

  modeInputs.forEach((input) => {
    input.addEventListener("change", () => {
      if (!input.checked) return;
      mode = input.value;
      prioritize(mode);
      describe();
      play();
    });
  });

  sampleButton.addEventListener("click", () => {
    newRound(mode);
    track.reseed();
    play();
  });

  let resizeTimer = 0;
  let lastWidth = window.innerWidth;
  window.addEventListener("resize", () => {
    // Phones fire resize when the address bar moves. Only a new width changes the type.
    if (window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!build()) return showNameOnly();
      newRound(mode);
      wake();
    }, 180);
  });
}

function start() {
  if (!build()) return showNameOnly();

  startWorker();

  const checked = modeInputs.find((input) => input.checked);
  if (checked) mode = checked.value;
  listen();
  describe();
  newRound(mode);
  setSlider();
  if (stillMotion) t = 0;
  else playStart = 0;
  wake();
}

if (!canvas || !heading || !slider) {
  if (heading) showNameOnly();
} else {
  // The name must not depend on the animation.
  setTimeout(() => {
    if (!ctx) showNameOnly();
  }, 2500);
  document.fonts.load(`400 100px "Fredoka"`).then(start).catch(showNameOnly);
}
