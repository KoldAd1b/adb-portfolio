import { defineConfig } from "vite";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

function serveLinkedCss() {
  return {
    name: "serve-linked-css",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = new URL(req.url || "/", "http://localhost").pathname;

        if (!pathname.endsWith(".css")) {
          next();
          return;
        }

        const root = server.config.root;
        const filePath = resolve(root, `.${pathname}`);

        if (!filePath.startsWith(root) || !existsSync(filePath)) {
          next();
          return;
        }

        res.setHeader("Content-Type", "text/css; charset=utf-8");
        res.end(readFileSync(filePath));
      });
    },
  };
}

export default defineConfig({
  plugins: [serveLinkedCss()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        blog: resolve(__dirname, "blog.html"),
        academia: resolve(__dirname, "academia.html"),
        maya: resolve(__dirname, "blog/maya.html"),
        work: resolve(__dirname, "lab.html"),
        culture: resolve(__dirname, "work.html"),
        directors: resolve(__dirname, "project.html"),
        voiceAgent: resolve(__dirname, "case/voice-agent.html"),
        researchSystems: resolve(__dirname, "case/research-systems.html"),
        saucebros: resolve(__dirname, "case/saucebros.html"),
        codecollab: resolve(__dirname, "case/codecollab.html"),
        scratchLm: resolve(__dirname, "case/scratch-lm.html"),
        torching: resolve(__dirname, "case/torching.html"),
        tabbyCat: resolve(__dirname, "case/tabby-cat.html"),
        miniSeek: resolve(__dirname, "case/mini-seek.html"),
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
