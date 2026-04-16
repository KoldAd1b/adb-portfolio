import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

// configuration
const CONFIG = {
  iconCount: 10,
  cloneCount: 10,
  gapMin: 1,
  gapMax: 10,
  rowThreshold: 25,
  mobileBreakpoint: 1000,
};

let currentIconIndex = 1;
let lastCenteredRow = null;
let gapScrollTriggers = [];
let isMobile = window.innerWidth < CONFIG.mobileBreakpoint;

// initialization
document.addEventListener("DOMContentLoaded", () => {
  const contactVisual = document.querySelector(".contact-visual");
  const contactVisualIcon = document.querySelector(".contact-visual-icon img");
  const contactInfo = document.querySelector(".contact-info");

  updateClocks();
  setInterval(updateClocks, 1000);

  createClones(contactInfo);

  waitForLenis(() => {
    initGapAnimations(contactVisual);
    trackCenterRow(contactVisualIcon);
  });

  window.addEventListener("resize", () => handleResize(contactVisual));
});

// clock - updates all contact clocks with Central time
function getCentralTime() {
  const now = new Date();
  const centralTime = new Date(
    now.toLocaleString("en-US", { timeZone: "America/Chicago" }),
  );
  const hours = String(centralTime.getHours()).padStart(2, "0");
  const minutes = String(centralTime.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes} CT`;
}

function updateClocks() {
  const timeString = getCentralTime();
  document.querySelectorAll(".contact-clock").forEach((clock) => {
    clock.textContent = timeString;
  });
}

// clone contact info rows for infinite scroll
function createClones(contactInfo) {
  for (let i = 0; i < CONFIG.cloneCount; i++) {
    const clone = contactInfo.cloneNode(true);
    contactInfo.parentElement.appendChild(clone);
  }
}

// icon cycling - changes icon when new row enters center
function changeIcon(contactVisualIcon) {
  currentIconIndex = (currentIconIndex % CONFIG.iconCount) + 1;
  contactVisualIcon.src = `/contact/icon_${currentIconIndex}.svg`;
}

function trackCenterRow(contactVisualIcon) {
  window.lenis.on("scroll", () => {
    const viewportCenter = window.innerHeight / 2;
    const rows = document.querySelectorAll(".contact-info-row");

    let closestRow = null;
    let minDistance = Infinity;

    rows.forEach((row) => {
      const rect = row.getBoundingClientRect();
      const rowCenter = rect.top + rect.height / 2;
      const distance = Math.abs(rowCenter - viewportCenter);

      if (distance < minDistance && distance < CONFIG.rowThreshold) {
        minDistance = distance;
        closestRow = row;
      }
    });

    if (closestRow && closestRow !== lastCenteredRow) {
      lastCenteredRow = closestRow;
      changeIcon(contactVisualIcon);
    }
  });
}

// gap animations - expand/collapse rows as they pass visual center
function getVisualCenter(contactVisual) {
  return contactVisual.offsetTop + contactVisual.offsetHeight / 2;
}

function resetRowGaps() {
  document.querySelectorAll(".contact-info-row").forEach((row) => {
    row.style.gap = `${CONFIG.gapMin}rem`;
  });
}

function killGapAnimations() {
  gapScrollTriggers.forEach((trigger) => trigger.kill());
  gapScrollTriggers = [];
  resetRowGaps();
}

function initGapAnimations(contactVisual) {
  killGapAnimations();

  if (isMobile) return;

  const visualCenter = getVisualCenter(contactVisual);

  document.querySelectorAll(".contact-info-row").forEach((row) => {
    const expandTrigger = ScrollTrigger.create({
      trigger: row,
      start: () => `top+=${visualCenter - 550} center`,
      end: () => `top+=${visualCenter - 450} center`,
      scrub: true,
      onUpdate: (self) => {
        const currentGap =
          CONFIG.gapMin + (CONFIG.gapMax - CONFIG.gapMin) * self.progress;
        row.style.gap = `${currentGap}rem`;
      },
    });

    const collapseTrigger = ScrollTrigger.create({
      trigger: row,
      start: () => `top+=${visualCenter - 400} center`,
      end: () => `top+=${visualCenter - 300} center`,
      scrub: true,
      onUpdate: (self) => {
        const currentGap =
          CONFIG.gapMax - (CONFIG.gapMax - CONFIG.gapMin) * self.progress;
        row.style.gap = `${currentGap}rem`;
      },
    });

    gapScrollTriggers.push(expandTrigger, collapseTrigger);
  });
}

// resize handler - reinit gap animations on breakpoint change
function handleResize(contactVisual) {
  const wasMobile = isMobile;
  isMobile = window.innerWidth < CONFIG.mobileBreakpoint;

  if (wasMobile !== isMobile) {
    initGapAnimations(contactVisual);
  }
}

// wait for Lenis to be available and enable infinite scroll
function waitForLenis(callback) {
  const checkLenis = setInterval(() => {
    if (window.lenis) {
      clearInterval(checkLenis);
      window.lenis.options.infinite = true;
      callback();
    }
  }, 100);
}
