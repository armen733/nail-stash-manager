import { useState, useEffect, useRef, useCallback } from 'react';

export const useInfiniteScroll = <T>(items: T[], itemsPerLoad: number = 20) => {
  const [displayCount, setDisplayCount] = useState(itemsPerLoad);
  const loaderRef = useRef<HTMLDivElement>(null);

  const displayedItems = items.slice(0, displayCount);
  const hasMore = displayCount < items.length;

  const loadMore = useCallback(() => {
    if (hasMore) {
      setDisplayCount(prev => Math.min(prev + itemsPerLoad, items.length));
    }
  }, [hasMore, itemsPerLoad, items.length]);

  const reset = useCallback(() => {
    setDisplayCount(itemsPerLoad);
  }, [itemsPerLoad]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore) {
          loadMore();
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    if (loaderRef.current) {
      observer.observe(loaderRef.current);
    }

    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  // Reset when items change significantly (e.g., filter applied)
  useEffect(() => {
    setDisplayCount(itemsPerLoad);
  }, [items.length, itemsPerLoad]);

  return {
    displayedItems,
    hasMore,
    loadMore,
    reset,
    loaderRef,
    totalCount: items.length,
    displayedCount: displayedItems.length,
  };
};
