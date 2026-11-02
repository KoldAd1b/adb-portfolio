// Samples from the exact diffusion model of a finite dataset: the points of a name.
//
// For x_t = alpha x_0 + sigma eps with x_0 drawn from a set of points, the best
// denoiser has a closed form, a softmax over the points:
//   E[x_0 | x_t] = sum_k w_k c_k,   w_k proportional to exp(-|x_t - alpha c_k|^2 / (2 sigma^2))
// The score follows from it: grad log p_t(x) = (alpha E[x_0 | x] - x) / sigma^2.
// No network is involved, so every path below is what the equations prescribe.

const SCHEDULES = {
  // Variance preserving, the cosine schedule. Drives the SDE and the ODE.
  vp: (t) => [Math.cos((Math.PI / 2) * t), Math.sin((Math.PI / 2) * t)],
  // The straight-line interpolant of flow matching.
  linear: (t) => [1 - t, t],
};

function gaussian() {
  const u = 1 - Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}

function sample({ kind, eps, cx, cy, knots, tMin }) {
  const count = eps.length / 2;
  const centers = cx.length;
  const schedule = SCHEDULES[kind === "flow" ? "linear" : "vp"];
  const stochastic = kind === "sde";
  const keepGuesses = kind === "ode";

  const paths = new Float32Array(2 * count * (knots + 1));
  const guesses = keepGuesses ? new Float32Array(2 * count * (knots + 1)) : null;
  const distance = new Float64Array(centers);

  paths.set(eps);

  for (let step = 0; step <= knots; step++) {
    const t = 1 + ((tMin - 1) * step) / knots;
    const [alpha, sigma] = schedule(t);
    const nextT = 1 + ((tMin - 1) * (step + 1)) / knots;
    const [nextAlpha, nextSigma] = schedule(nextT);

    // One step of ancestral sampling for the SDE, one step of DDIM for the ODE
    // and the flow. Both reduce to the same update when spread is zero.
    let spread = 0;
    if (stochastic && alpha < nextAlpha) {
      const ratio = (alpha * alpha) / (nextAlpha * nextAlpha);
      spread = Math.sqrt(Math.max(0, ((nextSigma * nextSigma) / (sigma * sigma)) * (1 - ratio)));
    }
    const kept = Math.sqrt(Math.max(0, nextSigma * nextSigma - spread * spread));
    const scale = 1 / (2 * sigma * sigma);
    const row = 2 * count * step;
    // At high noise each point's blob is far wider than the gap between points, so
    // every second or fourth point gives the same answer in less time.
    const stride = t > 0.5 ? 4 : t > 0.25 ? 2 : 1;
    const nextRow = row + 2 * count;

    for (let i = 0; i < count; i++) {
      const x = paths[row + 2 * i];
      const y = paths[row + 2 * i + 1];

      let least = Infinity;
      for (let k = 0; k < centers; k += stride) {
        const dx = x - alpha * cx[k];
        const dy = y - alpha * cy[k];
        const d = dx * dx + dy * dy;
        distance[k] = d;
        if (d < least) least = d;
      }

      let total = 0;
      let guessX = 0;
      let guessY = 0;
      for (let k = 0; k < centers; k += stride) {
        const exponent = (distance[k] - least) * scale;
        if (exponent > 18) continue;
        const weight = Math.exp(-exponent);
        total += weight;
        guessX += weight * cx[k];
        guessY += weight * cy[k];
      }
      guessX /= total;
      guessY /= total;

      if (guesses) {
        guesses[row + 2 * i] = guessX;
        guesses[row + 2 * i + 1] = guessY;
      }
      if (step === knots) continue;

      const noiseX = (x - alpha * guessX) / sigma;
      const noiseY = (y - alpha * guessY) / sigma;
      let nextX = nextAlpha * guessX + kept * noiseX;
      let nextY = nextAlpha * guessY + kept * noiseY;
      if (spread > 0) {
        nextX += spread * gaussian();
        nextY += spread * gaussian();
      }
      paths[nextRow + 2 * i] = nextX;
      paths[nextRow + 2 * i + 1] = nextY;
    }
  }

  return { paths, guesses };
}

self.onmessage = ({ data }) => {
  const { paths, guesses } = sample(data);
  const transfer = guesses ? [paths.buffer, guesses.buffer] : [paths.buffer];
  self.postMessage({ round: data.round, kind: data.kind, paths, guesses }, transfer);
};
