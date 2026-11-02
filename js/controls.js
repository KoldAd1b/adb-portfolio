// The home page controls: a track you drag along, drawn in the shape of each
// sampler's equation, and a blob that slides between the sampler shapes.
// The native range input and radios stay in the page for keyboards and screen readers.

const POINTS = 121;
const HEIGHT = 116;
const PAD_X = 18;
const PAD_Y = 16;
const SVG_NS = "http://www.w3.org/2000/svg";

const stillMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

function make(parent, name, attributes = {}) {
  const node = document.createElementNS(SVG_NS, name);
  Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
  parent.append(node);
  return node;
}

function sigmaAt(t) {
  return Math.sin((Math.PI / 2) * t);
}

function randomWalk() {
  // A Brownian bridge, so the jagged track still meets its two ends.
  const walk = new Float32Array(POINTS);
  for (let i = 1; i < POINTS; i++) walk[i] = walk[i - 1] + (Math.random() - 0.5);
  const end = walk[POINTS - 1];
  for (let i = 0; i < POINTS; i++) walk[i] -= (end * i) / (POINTS - 1);
  return walk;
}

export function createTrack({ root, onInput }) {
  const svg = make(root, "svg", { "aria-hidden": "true" });
  const tube = make(svg, "path", { class: "track-tube" });
  const done = make(svg, "path", { class: "track-done" });
  const overlay = make(svg, "path", { class: "track-overlay" });
  const start = make(svg, "circle", { class: "track-start", r: 5 });
  const thumb = make(svg, "ellipse", { class: "track-thumb" });
  const readout = root.querySelector("output");

  let width = 0;
  let mode = "ode";
  let t = 0;
  let walk = randomWalk();
  let stretch = 0;
  let angle = 0;
  let dragging = false;
  let glide = 0;
  let lastMove = 0;
  let lastValue = 0;
  let running = false;
  let lastFrame = 0;

  const shape = new Float32Array(POINTS);
  const velocity = new Float32Array(POINTS);
  const goal = new Float32Array(POINTS);

  // Height of the track at noise level u, from 0 to 1. Each shape is the sampler's own.
  function heightAt(i) {
    const u = i / (POINTS - 1);
    if (mode === "flow") return u; // sigma_t = t
    if (mode === "density") return 0.02;
    const sigma = sigmaAt(u); // sigma_t = sin(pi t / 2)
    if (mode === "sde") return Math.min(1, Math.max(0, sigma + walk[i] * 0.13));
    return sigma;
  }

  function setGoal() {
    for (let i = 0; i < POINTS; i++) goal[i] = heightAt(i);
  }

  function xAt(u) {
    return PAD_X + (width - 2 * PAD_X) * u;
  }

  function yAt(value) {
    return HEIGHT - PAD_Y - value * (HEIGHT - 2 * PAD_Y);
  }

  function shapeAt(u) {
    const position = u * (POINTS - 1);
    const low = Math.min(POINTS - 2, Math.floor(position));
    return shape[low] + (shape[low + 1] - shape[low]) * (position - low);
  }

  function draw() {
    if (!width) return;
    let line = "";
    let finished = "";
    const stop = t * (POINTS - 1);
    for (let i = 0; i < POINTS; i++) {
      const point = `${xAt(i / (POINTS - 1)).toFixed(1)} ${yAt(shape[i]).toFixed(1)}`;
      line += `${i ? "L" : "M"}${point}`;
      if (i <= stop) finished += `${i ? "L" : "M"}${point}`;
    }
    const x = xAt(t);
    const y = yAt(shapeAt(t));
    tube.setAttribute("d", line);
    done.setAttribute("d", `${finished || `M${xAt(0)} ${yAt(shape[0])}`}L${x.toFixed(1)} ${y.toFixed(1)}`);
    start.setAttribute("cx", xAt(0));
    start.setAttribute("cy", yAt(shape[0]));

    // One step: the jump from here straight to the name.
    if (mode === "step" && t > 0.01) {
      const originX = xAt(0);
      const originY = yAt(shape[0]);
      const lift = Math.max(6, y - 26 * t - 8);
      overlay.setAttribute("d", `M${x} ${y}Q${(x + originX) / 2} ${lift} ${originX} ${originY}`);
      overlay.dataset.kind = "jump";
    } else if (mode === "density") {
      // Fokker-Planck: a bell that keeps its area while it spreads with sigma_t.
      const span = width - 2 * PAD_X;
      const spread = span * (0.018 + 0.14 * sigmaAt(t));
      const peak = Math.min(HEIGHT - 2 * PAD_Y, (0.014 * span * (HEIGHT - 2 * PAD_Y)) / spread);
      const base = yAt(shape[0]);
      let bell = "";
      for (let k = -30; k <= 30; k++) {
        const dx = (k / 10) * spread;
        const px = Math.min(width - 4, Math.max(4, x + dx));
        bell += `${k === -30 ? "M" : "L"}${px.toFixed(1)} ${(base - peak * Math.exp((-dx * dx) / (2 * spread * spread))).toFixed(1)}`;
      }
      overlay.setAttribute("d", bell);
      overlay.dataset.kind = "bell";
    } else {
      overlay.setAttribute("d", "");
    }

    const squash = Math.min(0.42, Math.abs(stretch));
    thumb.setAttribute("rx", (dragging ? 15 : 13) * (1 + squash));
    thumb.setAttribute("ry", (dragging ? 15 : 13) * (1 - squash * 0.6));
    thumb.setAttribute("transform", `translate(${x} ${y}) rotate(${angle})`);

    if (readout) {
      readout.style.transform = `translate(${x.toFixed(1)}px, ${(y - 32).toFixed(1)}px) translateX(-50%)`;
    }
  }

  function settle(now) {
    running = false;
    const dt = Math.min(1 / 30, (now - lastFrame) / 1000 || 1 / 60);
    lastFrame = now;
    let moving = false;

    // Each point is its own spring. Stiffness grows along the track, so a change
    // of sampler passes through it like a wave.
    for (let i = 0; i < POINTS; i++) {
      const stiffness = 70 + (150 * i) / POINTS;
      velocity[i] += (stiffness * (goal[i] - shape[i]) - 11 * velocity[i]) * dt;
      shape[i] += velocity[i] * dt;
      if (Math.abs(goal[i] - shape[i]) > 0.0015 || Math.abs(velocity[i]) > 0.01) moving = true;
    }

    // A flick keeps sliding along the curve until friction stops it.
    if (!dragging && Math.abs(glide) > 0.02) {
      const next = Math.min(1, Math.max(0, t + glide * dt));
      glide = next === 0 || next === 1 ? 0 : glide * 0.93;
      onInput(next);
      moving = true;
    } else if (!dragging) {
      glide = 0;
    }

    stretch *= 0.88;
    if (Math.abs(stretch) > 0.004) moving = true;

    const ahead = shapeAt(Math.min(1, t + 0.02));
    const behind = shapeAt(Math.max(0, t - 0.02));
    const slope = ((behind - ahead) * (HEIGHT - 2 * PAD_Y)) / (0.04 * (width - 2 * PAD_X) || 1);
    angle = (Math.atan(slope) * 180) / Math.PI;

    draw();
    if (moving) wake();
  }

  function wake() {
    if (running) return;
    running = true;
    requestAnimationFrame(settle);
  }

  function valueAt(event) {
    const box = svg.getBoundingClientRect();
    return Math.min(1, Math.max(0, (event.clientX - box.left - PAD_X) / (box.width - 2 * PAD_X)));
  }

  function move(event) {
    const now = performance.now();
    const value = valueAt(event);
    const elapsed = (now - lastMove) / 1000;
    if (elapsed > 0.002) {
      const speed = (value - lastValue) / elapsed;
      glide = glide * 0.6 + speed * 0.4;
      stretch = Math.min(0.42, Math.abs(speed) * 0.09);
      lastMove = now;
      lastValue = value;
    }
    onInput(value);
    wake();
  }

  root.addEventListener("pointerdown", (event) => {
    if (event.button) return;
    root.setPointerCapture(event.pointerId);
    dragging = true;
    root.classList.add("is-dragging");
    glide = 0;
    lastMove = performance.now();
    lastValue = valueAt(event);
    onInput(lastValue);
    wake();
    event.preventDefault();
    root.querySelector("input")?.focus({ preventScroll: true });
  });

  root.addEventListener("pointermove", (event) => {
    if (dragging) move(event);
  });

  function release() {
    if (!dragging) return;
    dragging = false;
    root.classList.remove("is-dragging");
    if (stillMotion || performance.now() - lastMove > 90) glide = 0;
    wake();
  }
  root.addEventListener("pointerup", release);
  root.addEventListener("pointercancel", release);

  function measure() {
    width = root.getBoundingClientRect().width;
    svg.setAttribute("viewBox", `0 0 ${width} ${HEIGHT}`);
    draw();
  }
  new ResizeObserver(measure).observe(root);

  setGoal();
  shape.set(goal);
  measure();

  return {
    update(value) {
      t = value;
      if (dragging || running) return;
      draw();
    },
    setMode(next) {
      mode = next;
      setGoal();
      root.dataset.mode = next;
      if (stillMotion) {
        shape.set(goal);
        draw();
      } else {
        wake();
      }
    },
    reseed() {
      walk = randomWalk();
      setGoal();
      if (stillMotion) {
        shape.set(goal);
        draw();
      } else {
        wake();
      }
    },
    halt() {
      glide = 0;
    },
  };
}

// Slides the blob to the checked sampler and gives it a new outline at each stop.
export function createPicker(fieldset) {
  const blob = document.createElement("span");
  blob.className = "mode-blob";
  blob.setAttribute("aria-hidden", "true");
  fieldset.prepend(blob);
  const labels = [...fieldset.querySelectorAll("label")];
  const outlines = [
    "58% 42% 55% 45% / 48% 60% 40% 52%",
    "44% 56% 40% 60% / 62% 42% 58% 38%",
    "62% 38% 48% 52% / 40% 56% 44% 60%",
    "40% 60% 62% 38% / 55% 38% 62% 45%",
    "52% 48% 38% 62% / 44% 62% 38% 56%",
  ];

  function place() {
    const index = labels.findIndex((label) => label.querySelector("input").checked);
    if (index < 0) return;
    const label = labels[index];
    blob.style.width = `${label.offsetWidth}px`;
    blob.style.height = `${label.offsetHeight}px`;
    blob.style.transform = `translate(${label.offsetLeft}px, ${label.offsetTop}px)`;
    blob.style.borderRadius = outlines[index % outlines.length];
  }

  new ResizeObserver(place).observe(fieldset);
  place();
  return { place };
}
