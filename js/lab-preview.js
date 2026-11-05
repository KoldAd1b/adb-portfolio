// Research list: hovering a paper shows its Findings diagram in a panel that
// follows the cursor. The panel samples the diagram out of noise with the same
// forward process as the home page, x = alpha * x0 + sigma * eps, with one
// frozen eps and alpha, sigma on a cosine schedule. At t = 0 the panel is exact.
const list = document.querySelector("#papers");

if (list) {
  const pointer = matchMedia("(hover: hover) and (pointer: fine) and (min-width: 900px)");
  const still = matchMedia("(prefers-reduced-motion: reduce)");

  const ENTER_MS = 750;
  const LEAVE_MS = 180;
  const OFFSET = 24;
  const MARGIN = 16;
  const GRAIN = 2; // noise cell, in image pixels

  const panel = document.createElement("div");
  panel.className = "paper-preview";
  panel.setAttribute("aria-hidden", "true");
  const canvas = document.createElement("canvas");
  panel.append(canvas);
  document.body.append(panel);
  const ctx = canvas.getContext("2d");

  const images = new Map();
  let eps = null;
  let epsColumns = 0;
  let epsRows = 0;

  let current = null;
  let frame = null;
  let t = 1;
  let leaving = false;
  let visible = false;
  let raf = 0;
  let last = 0;
  let px = 0;
  let py = 0;
  let x = 0;
  let y = 0;
  let rowBottom = 0;

  const slugOf = (details) => {
    const link = details.querySelector('a[href^="/lab/"]');
    return link ? link.getAttribute("href").slice("/lab/".length) : null;
  };

  const load = (slug) => {
    if (images.has(slug)) return images.get(slug);
    const pending = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const scratch = document.createElement("canvas");
        scratch.width = w;
        scratch.height = h;
        const c = scratch.getContext("2d", { willReadFrequently: true });
        c.drawImage(img, 0, 0);
        const { data } = c.getImageData(0, 0, w, h);
        const x0 = new Float32Array(w * h * 3);
        for (let i = 0, j = 0; i < data.length; i += 4) {
          x0[j++] = data[i] / 127.5 - 1;
          x0[j++] = data[i + 1] / 127.5 - 1;
          x0[j++] = data[i + 2] / 127.5 - 1;
        }
        resolve({ w, h, x0, output: new ImageData(w, h) });
      };
      img.onerror = reject;
      img.src = `/images/lab/${slug}.png`;
    });
    images.set(slug, pending);
    return pending;
  };

  const gaussian = () => {
    const u = 1 - Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
  };

  const ensureNoise = (w, h) => {
    const columns = Math.ceil(w / GRAIN);
    const rows = Math.ceil(h / GRAIN);
    if (eps && columns <= epsColumns && rows <= epsRows) return;
    epsColumns = Math.max(columns, epsColumns);
    epsRows = Math.max(rows, epsRows);
    eps = new Float32Array(epsColumns * epsRows * 3);
    for (let i = 0; i < eps.length; i++) eps[i] = gaussian();
  };

  const draw = () => {
    const { w, h, x0, output } = frame;
    const angle = (t * Math.PI) / 2;
    const alpha = Math.cos(angle);
    const sigma = Math.sin(angle);
    const out = output.data;
    for (let row = 0, i = 0, j = 0; row < h; row++) {
      const cellRow = (row / GRAIN) | 0;
      for (let column = 0; column < w; column++) {
        const cell = (cellRow * epsColumns + ((column / GRAIN) | 0)) * 3;
        out[i++] = (alpha * x0[j++] + sigma * eps[cell] + 1) * 127.5;
        out[i++] = (alpha * x0[j++] + sigma * eps[cell + 1] + 1) * 127.5;
        out[i++] = (alpha * x0[j++] + sigma * eps[cell + 2] + 1) * 127.5;
        out[i++] = 255;
      }
    }
    ctx.putImageData(output, 0, 0);
  };

  const place = (snap) => {
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    let targetX = px + OFFSET;
    if (targetX + width > innerWidth - MARGIN) targetX = px - OFFSET - width;
    // Stay below the hovered entry so its citation remains readable.
    const below = Math.max(py + OFFSET, rowBottom + 8);
    const targetY = Math.max(MARGIN, Math.min(below, innerHeight - MARGIN - height));
    const follow = snap || still.matches ? 1 : 0.18;
    x += (targetX - x) * follow;
    y += (targetY - y) * follow;
    panel.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
  };

  const tick = (now) => {
    const dt = Math.min(now - last, 64);
    last = now;
    if (frame) {
      const before = t;
      if (leaving) t = still.matches ? 1 : Math.min(1, t + dt / LEAVE_MS);
      else t = still.matches ? 0 : Math.max(0, t - dt / ENTER_MS);
      if (t !== before) draw();
    }
    place(false);
    if (leaving && t >= 1) {
      panel.classList.remove("is-visible");
      visible = false;
      current = null;
      frame = null;
      raf = 0;
      return;
    }
    raf = requestAnimationFrame(tick);
  };

  const run = () => {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  };

  const show = (slug) => {
    leaving = false;
    if (slug === current) {
      run();
      return;
    }
    current = slug;
    load(slug).then((image) => {
      if (current !== slug) return;
      frame = image;
      ensureNoise(image.w, image.h);
      canvas.width = image.w;
      canvas.height = image.h;
      canvas.style.width = `${image.w / 2}px`;
      canvas.style.height = `${image.h / 2}px`;
      t = still.matches ? 0 : 1;
      draw();
      panel.classList.add("is-visible");
      if (!visible) {
        visible = true;
        place(true);
      }
      run();
    });
  };

  const hide = () => {
    if (!current) return;
    if (!visible) {
      current = null;
      return;
    }
    leaving = true;
    run();
  };

  const update = (element) => {
    const summary = element && element.closest ? element.closest(".paper summary") : null;
    const details = summary ? summary.parentElement : null;
    if (summary) rowBottom = summary.getBoundingClientRect().bottom;
    const slug = details && !details.open && pointer.matches ? slugOf(details) : null;
    if (slug) show(slug);
    else hide();
  };

  list.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse") return;
    px = event.clientX;
    py = event.clientY;
    update(event.target);
  });

  list.addEventListener("pointerleave", hide);

  list.addEventListener(
    "pointerenter",
    () => {
      if (!pointer.matches) return;
      for (const details of list.querySelectorAll("details.paper")) {
        const slug = slugOf(details);
        if (slug) load(slug).catch(() => images.delete(slug));
      }
    },
    { once: true },
  );

  // Opening an entry hides the panel so it does not cover the summary.
  list.addEventListener(
    "toggle",
    () => update(document.elementFromPoint(px, py)),
    true,
  );

  addEventListener(
    "scroll",
    () => {
      if (current) update(document.elementFromPoint(px, py));
    },
    { passive: true },
  );
}
