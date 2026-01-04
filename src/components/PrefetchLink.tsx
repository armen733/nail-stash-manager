import { memo, useCallback } from 'react';
import { NavLink, NavLinkProps } from 'react-router-dom';
import { prefetchRoute } from '@/lib/prefetch';

interface PrefetchLinkProps extends NavLinkProps {
  prefetchOnHover?: boolean;
}

/**
 * Enhanced NavLink that prefetches route chunks on hover
 * Improves perceived navigation speed by loading code before user clicks
 */
const PrefetchLinkComponent = ({ 
  to, 
  prefetchOnHover = true,
  onMouseEnter,
  children,
  ...props 
}: PrefetchLinkProps) => {
  const handleMouseEnter = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    if (prefetchOnHover && typeof to === 'string') {
      prefetchRoute(to);
    }
    onMouseEnter?.(e);
  }, [to, prefetchOnHover, onMouseEnter]);

  return (
    <NavLink
      to={to}
      onMouseEnter={handleMouseEnter}
      {...props}
    >
      {children}
    </NavLink>
  );
};

export const PrefetchLink = memo(PrefetchLinkComponent);
