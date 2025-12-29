import { useEffect, useRef, useCallback } from "react";

interface SwipeGestureOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number; // Minimum distance for swipe
  edgeWidth?: number; // Width of edge detection zone for swipe-to-open
}

export function useSwipeGesture({
  onSwipeLeft,
  onSwipeRight,
  threshold = 50,
  edgeWidth = 30,
}: SwipeGestureOptions) {
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);
  const isEdgeSwipe = useRef(false);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchEndX.current = null;
    
    // Check if swipe started from left edge (for opening sidebar)
    isEdgeSwipe.current = touchStartX.current <= edgeWidth;
  }, [edgeWidth]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (touchStartX.current === null || touchEndX.current === null) {
      return;
    }

    const deltaX = touchEndX.current - touchStartX.current;
    const absDeltaX = Math.abs(deltaX);

    // Only trigger if horizontal swipe is significant
    if (absDeltaX < threshold) {
      touchStartX.current = null;
      touchEndX.current = null;
      return;
    }

    if (deltaX > 0) {
      // Swipe right - open sidebar (only if started from edge)
      if (isEdgeSwipe.current && onSwipeRight) {
        onSwipeRight();
      }
    } else {
      // Swipe left - close sidebar
      if (onSwipeLeft) {
        onSwipeLeft();
      }
    }

    touchStartX.current = null;
    touchEndX.current = null;
    isEdgeSwipe.current = false;
  }, [threshold, onSwipeLeft, onSwipeRight]);

  useEffect(() => {
    const element = document;

    element.addEventListener("touchstart", handleTouchStart, { passive: true });
    element.addEventListener("touchmove", handleTouchMove, { passive: true });
    element.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      element.removeEventListener("touchstart", handleTouchStart);
      element.removeEventListener("touchmove", handleTouchMove);
      element.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);
}
