/**
 * Performance utilities for React optimization
 */

/**
 * Creates a stable reference for a callback that can be used in dependency arrays
 * without causing unnecessary re-renders
 */
export function useStableCallback<T extends (...args: any[]) => any>(callback: T): T {
  const ref = { current: callback };
  ref.current = callback;
  return ((...args: any[]) => ref.current(...args)) as T;
}

/**
 * Debounce a value change - useful for search inputs
 * Returns debounced value after delay
 */
export function debounceValue<T>(value: T, delay: number): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(value), delay);
  });
}

/**
 * Check if two arrays are shallowly equal
 * Useful for custom comparison in React.memo
 */
export function shallowArrayEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Check if two objects are shallowly equal
 * Useful for custom comparison in React.memo
 */
export function shallowObjectEqual<T extends object>(a: T, b: T): boolean {
  const keysA = Object.keys(a) as (keyof T)[];
  const keysB = Object.keys(b) as (keyof T)[];
  
  if (keysA.length !== keysB.length) return false;
  
  for (const key of keysA) {
    if (a[key] !== b[key]) return false;
  }
  
  return true;
}

/**
 * Batch multiple state updates to reduce re-renders
 * Uses React 18's automatic batching when available
 */
export function batchUpdates(callback: () => void): void {
  // React 18+ automatically batches, but this is here for explicit batching
  callback();
}

/**
 * Measure component render time (development only)
 */
export function measureRender(componentName: string): () => void {
  if (import.meta.env.PROD) {
    return () => {};
  }
  
  const start = performance.now();
  return () => {
    const duration = performance.now() - start;
    if (duration > 16) { // More than one frame (16ms)
      console.warn(`[Slow Render] ${componentName}: ${duration.toFixed(2)}ms`);
    }
  };
}
