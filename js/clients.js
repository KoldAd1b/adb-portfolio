import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

// systems ledger
const clientsData = [
  "Production Voice Agent",
  "Research Systems",
  "Multi-Agent Thematic Analysis",
  "ConfliBERT Adaptation",
  "Multilingual Conflict NLP",
  "County Disparities Study",
  "Vaccine Hesitancy Paper",
  "Indigenous Food Security Paper",
  "SauceBros Sales Forecaster",
  "CodeCollab Real-Time Editor",
  "Small Language Model from Scratch",
];

// initialization
document.addEventListener("DOMContentLoaded", () => {
  generateClientsList();

  setTimeout(() => {
    ScrollTrigger.refresh();
    initClientsAnimation();
  }, 100);
});

// generate client rows from data
function generateClientsList() {
  const clientsList = document.querySelector(".clients-list");
  if (!clientsList) return;

  clientsData.forEach((client) => {
    const row = document.createElement("div");
    row.className = "client-row";

    const nameP = document.createElement("p");
    nameP.className = "type-mono";
    nameP.textContent = client;

    row.appendChild(nameP);
    clientsList.appendChild(row);
  });
}

// scroll animation - gap closes and opacity fades in
function initClientsAnimation() {
  const clientRows = document.querySelectorAll(".client-row");

  clientRows.forEach((row) => {
    const paragraphs = row.querySelectorAll("p");

    ScrollTrigger.create({
      trigger: row,
      start: "top 75%",
      end: "top 65%",
      scrub: true,
      onUpdate: (self) => {
        const progress = self.progress;
        gsap.set(row, { gap: `${25 - progress * 25}%` });
        paragraphs.forEach((p) => gsap.set(p, { opacity: progress }));
      },
    });
  });
}
