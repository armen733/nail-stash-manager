import { lazy, type ComponentType } from "react";

const RELOAD_KEY = "__chunk_reload_at";

const isChunkLoadError = (msg: string) =>
  /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|error loading dynamically imported module|Unable to preload CSS/i.test(
    msg
  );

/**
 * React.lazy that survives stale deploys.
 * Retries the import once (cache-busted); if it still fails, reloads the page
 * at most once per 10s so the browser picks up the fresh asset manifest.
 */
export function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (err) {
      const msg = (err as Error)?.message || String(err);
      if (!isChunkLoadError(msg)) throw err;

      // Second chance: the deploy may have just finished propagating.
      try {
        return await factory();
      } catch {
        const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
        if (Date.now() - last > 10_000) {
          sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
          window.location.reload();
        }
        // Keep Suspense pending while the reload happens.
        return await new Promise<{ default: T }>(() => {});
      }
    }
  });
}
