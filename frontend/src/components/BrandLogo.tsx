import React from 'react';

interface BrandLogoProps {
  size?: number;
  className?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ size = 26, className = '' }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="PDF Modifier Logo"
    >
      <defs>
        <linearGradient id="blBgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#1d4ed8" />
        </linearGradient>

        <linearGradient id="blDocGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#f8fafc" />
        </linearGradient>

        <linearGradient id="blFoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#93c5fd" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>

        <linearGradient id="blAccentGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2563eb" />
          <stop offset="100%" stopColor="#1e40af" />
        </linearGradient>

        <filter id="blDropShadow" x="-15%" y="-15%" width="130%" height="130%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodColor="#0f172a" floodOpacity="0.3" />
        </filter>
      </defs>

      {/* Rounded Squircle Base */}
      <rect width="32" height="32" rx="8" fill="url(#blBgGrad)" />
      <rect
        x="0.5"
        y="0.5"
        width="31"
        height="31"
        rx="7.5"
        stroke="rgba(255, 255, 255, 0.3)"
        strokeWidth="1"
        fill="none"
      />

      {/* Folded Document Page Silhouette */}
      <g filter="url(#blDropShadow)">
        <path
          d="M9 7C9 5.89543 9.89543 5 11 5H18L23 10V25C23 26.1046 22.1046 27 21 27H11C9.89543 27 9 26.1046 9 25V7Z"
          fill="url(#blDocGrad)"
        />

        {/* Folded Corner Flap */}
        <path
          d="M18 5V9.5C18 9.77614 18.2239 10 18.5 10H23L18 5Z"
          fill="url(#blFoldGrad)"
        />
      </g>

      {/* Stylized Monogram P (Vector Edit Motif) */}
      <rect x="12" y="10" width="2.4" height="12" rx="1.2" fill="url(#blAccentGrad)" />
      
      <path
        d="M13.2 10H16.8C18.4569 10 19.8 11.3431 19.8 13C19.8 14.6569 18.4569 16 16.8 16H13.2V10Z"
        fill="url(#blAccentGrad)"
      />
      <path
        d="M14.4 11.8H16.6C17.2627 11.8 17.8 12.3373 17.8 13C17.8 13.6627 17.2627 14.2 16.6 14.2H14.4V11.8Z"
        fill="#ffffff"
      />

      {/* Vector Precision Edit Spark */}
      <circle cx="18.8" cy="20" r="1.6" fill="#3b82f6" />
      <circle cx="18.8" cy="20" r="0.8" fill="#ffffff" />
    </svg>
  );
};
