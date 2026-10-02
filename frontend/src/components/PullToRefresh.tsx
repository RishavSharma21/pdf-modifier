import React, { useState, useEffect, useRef, useCallback } from 'react';

interface PullToRefreshProps {
  disabled?: boolean;
  onRefresh?: () => void;
}

const PULL_THRESHOLD = 64; // Distance in px required to trigger refresh
const MAX_PULL = 90; // Maximum visual travel distance

export const PullToRefresh: React.FC<PullToRefreshProps> = ({
  disabled = false,
  onRefresh,
}) => {
  const [pullDistance, setPullDistance] = useState<number>(0);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const startYRef = useRef<number>(0);
  const startXRef = useRef<number>(0);
  const isPullingRef = useRef<boolean>(false);
  const hasTriggeredHapticRef = useRef<boolean>(false);

  const performRefresh = useCallback(() => {
    setIsRefreshing(true);
    setPullDistance(PULL_THRESHOLD * 0.85);

    // Call custom onRefresh or trigger standard browser reload
    setTimeout(() => {
      if (onRefresh) {
        onRefresh();
        setTimeout(() => {
          setIsRefreshing(false);
          setPullDistance(0);
        }, 500);
      } else {
        window.location.reload();
      }
    }, 450);
  }, [onRefresh]);

  useEffect(() => {
    if (disabled || typeof window === 'undefined') return;

    // Check if current scroll container is at top
    const getActiveScrollTop = (): number => {
      const canvasViewport = document.getElementById('canvas-viewport');
      if (canvasViewport) return canvasViewport.scrollTop;

      const landing = document.querySelector('.landing-container');
      if (landing) return landing.scrollTop;

      return window.scrollY || document.documentElement.scrollTop || 0;
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (isRefreshing || e.touches.length !== 1) return;

      // Don't trigger if user is interacting with form controls or modal dialogs
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.closest('.mobile-text-edit-sheet') ||
          activeEl.closest('.find-replace-panel') ||
          activeEl.closest('.crop-modal-box'))
      ) {
        return;
      }

      if (getActiveScrollTop() <= 2) {
        startYRef.current = e.touches[0].clientY;
        startXRef.current = e.touches[0].clientX;
        isPullingRef.current = false;
        hasTriggeredHapticRef.current = false;
      } else {
        startYRef.current = 0;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (startYRef.current === 0 || isRefreshing || e.touches.length !== 1) return;

      const currentY = e.touches[0].clientY;
      const currentX = e.touches[0].clientX;
      const diffY = currentY - startYRef.current;
      const diffX = currentX - startXRef.current;

      // If user is scrolling up or mostly horizontal, abort pull
      if (diffY <= 0 || Math.abs(diffX) > diffY * 0.85) {
        if (!isPullingRef.current) {
          startYRef.current = 0;
        }
        return;
      }

      // Ensure we are strictly at the top of the container
      if (getActiveScrollTop() > 2) {
        startYRef.current = 0;
        isPullingRef.current = false;
        setPullDistance(0);
        setIsDragging(false);
        return;
      }

      isPullingRef.current = true;
      setIsDragging(true);

      // Prevent native rubber banding when pulling down
      if (e.cancelable) {
        e.preventDefault();
      }

      // Logarithmic / exponential dampening resistance
      const dampened = Math.min(Math.pow(diffY, 0.82) * 1.5, MAX_PULL);
      setPullDistance(dampened);

      // Light haptic tick when crossing threshold
      if (dampened >= PULL_THRESHOLD && !hasTriggeredHapticRef.current) {
        hasTriggeredHapticRef.current = true;
        try {
          if (navigator.vibrate) navigator.vibrate(10);
        } catch {
          // ignore
        }
      } else if (dampened < PULL_THRESHOLD) {
        hasTriggeredHapticRef.current = false;
      }
    };

    const handleTouchEnd = () => {
      if (!isPullingRef.current) {
        startYRef.current = 0;
        return;
      }

      setIsDragging(false);
      isPullingRef.current = false;
      startYRef.current = 0;

      if (pullDistance >= PULL_THRESHOLD) {
        performRefresh();
      } else {
        setPullDistance(0);
      }
    };

    const handleTouchCancel = () => {
      setIsDragging(false);
      isPullingRef.current = false;
      startYRef.current = 0;
      setPullDistance(0);
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    window.addEventListener('touchcancel', handleTouchCancel, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchCancel);
    };
  }, [disabled, isRefreshing, pullDistance, performRefresh]);

  if (pullDistance === 0 && !isRefreshing) return null;

  const progress = Math.min(pullDistance / PULL_THRESHOLD, 1.0);
  const rotation = progress * 320;
  const opacity = Math.min(pullDistance / 24, 1.0);
  const translateY = Math.max(pullDistance, isRefreshing ? PULL_THRESHOLD * 0.8 : 0);

  return (
    <div
      className={`ptr-container ${isDragging ? 'is-dragging' : 'is-releasing'}`}
      style={{
        transform: `translate3d(-50%, ${translateY}px, 0)`,
        opacity,
      }}
      aria-hidden="true"
      id="pull-to-refresh-indicator"
    >
      <div className={`ptr-chip ${isRefreshing ? 'is-refreshing' : ''}`}>
        {isRefreshing ? (
          <svg className="ptr-spinner-svg" viewBox="0 0 24 24">
            <circle
              className="ptr-spinner-track"
              cx="12"
              cy="12"
              r="9.5"
              fill="none"
              strokeWidth="2.5"
            />
            <circle
              className="ptr-spinner-head"
              cx="12"
              cy="12"
              r="9.5"
              fill="none"
              strokeWidth="2.5"
              strokeDasharray="60"
              strokeDashoffset="20"
            />
          </svg>
        ) : (
          <svg
            className="ptr-arrow-svg"
            viewBox="0 0 24 24"
            style={{
              transform: `rotate(${rotation}deg) scale(${0.75 + progress * 0.25})`,
            }}
          >
            <path
              d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"
              fill="currentColor"
            />
          </svg>
        )}
      </div>
    </div>
  );
};
