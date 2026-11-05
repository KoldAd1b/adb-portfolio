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

// Vite only reloads an HTML edit when the browser URL matches the file path.
// This site serves extensionless clean URLs (/blog) while the file is blog.html,
// so that match never happens. Force a full reload on any .html change instead.
function reloadOnHtmlChange() {
  return {
    name: "reload-on-html-change",
    handleHotUpdate({ file, server }) {
      if (file.endsWith(".html")) {
        server.ws.send({ type: "full-reload", path: "*" });
        return [];
      }
    },
  };
}

export default defineConfig({
  plugins: [serveLinkedCss(), reloadOnHtmlChange()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        blog: resolve(__dirname, "blog.html"),
        esoterica: resolve(__dirname, "esoterica.html"),
        maya: resolve(__dirname, "esoterica/maya.html"),
        academia: resolve(__dirname, "academia.html"),
        vaeElbo: resolve(__dirname, "academia/vae-elbo.html"),
        diffusion: resolve(__dirname, "academia/diffusion.html"),
        fokkerPlanck: resolve(__dirname, "academia/fokker-planck.html"),
        work: resolve(__dirname, "lab.html"),
        contact: resolve(__dirname, "contact.html"),
        paperKvCache: resolve(__dirname, "lab/kv-cache.html"),
        paperStallbound: resolve(__dirname, "lab/stallbound.html"),
        paperFirmvla: resolve(__dirname, "lab/firmvla.html"),
        paperEntitlement: resolve(__dirname, "lab/entitlement.html"),
        paperLetItSettle: resolve(__dirname, "lab/let-it-settle.html"),
        paperExpertInterventions: resolve(__dirname, "lab/expert-interventions.html"),
        paperReliabilityGatedTransport: resolve(__dirname, "lab/reliability-gated-transport.html"),
        paperUnseenMode: resolve(__dirname, "lab/unseen-mode.html"),
        paperWorldModelSearch: resolve(__dirname, "lab/world-model-search.html"),
        paperQuanta: resolve(__dirname, "lab/quanta.html"),
        paperAgriculture: resolve(__dirname, "lab/agriculture.html"),
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
