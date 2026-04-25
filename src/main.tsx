import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Auto-recover from stale chunk errors after a new deploy.
// When a lazy-loaded route chunk no longer exists (renamed by a new build),
// the dynamic import throws. Reload once to fetch the fresh asset manifest.
const isChunkLoadError = (msg: string) =>
  /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|error loading dynamically imported module|Unable to preload CSS/i.test(
    msg
  );

const tryReload = () => {
  const key = "__chunk_reload_at";
  const last = Number(sessionStorage.getItem(key) || 0);
  // Only reload at most once per 10s to avoid loops
  if (Date.now() - last > 10_000) {
    sessionStorage.setItem(key, String(Date.now()));
    window.location.reload();
  }
};

window.addEventListener("error", (e) => {
  if (e?.message && isChunkLoadError(e.message)) tryReload();
});

window.addEventListener("unhandledrejection", (e) => {
  const msg = e?.reason?.message || String(e?.reason || "");
  if (isChunkLoadError(msg)) tryReload();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
