import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        work: resolve(__dirname, "lab.html"),
        culture: resolve(__dirname, "work.html"),
        directors: resolve(__dirname, "project.html"),
        voiceAgent: resolve(__dirname, "case/voice-agent.html"),
        researchSystems: resolve(__dirname, "case/research-systems.html"),
        saucebros: resolve(__dirname, "case/saucebros.html"),
        codecollab: resolve(__dirname, "case/codecollab.html"),
        scratchLm: resolve(__dirname, "case/scratch-lm.html"),
        contact: resolve(__dirname, "contact.html"),
      },
    },
    assetsInclude: [
      "**/*.jpeg",
      "**/*.jpg",
      "**/*.png",
      "**/*.svg",
      "**/*.gif",
    ],
    copyPublicDir: true,
  },
});
