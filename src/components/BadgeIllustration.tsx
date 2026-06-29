import React from 'react';

// Warm, muted, professional color palette (soft blues, teals, terracotta, cream)
const COLORS = {
  backgrounds: ['#F4F1DE', '#EBF4F6', '#F2E9E4', '#E0F2FE', '#ECFDF5'],
  fills: ['#8AB4F8', '#80CBC4', '#E07A5F', '#F4A261', '#E9C46A'],
  strokes: ['#3D405B', '#264653', '#1D3557', '#5E503F'], // medium line weights, consistent
};

interface BadgeIllustrationProps {
  seed: string;
  className?: string;
}

export default function BadgeIllustration({ seed, className = 'w-16 h-16' }: BadgeIllustrationProps) {
  // Simple deterministic hash based on seed string
  const hash = seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  
  const bgCol = COLORS.backgrounds[hash % COLORS.backgrounds.length];
  const fillCol = COLORS.fills[(hash + 1) % COLORS.fills.length];
  const strokeCol = COLORS.strokes[(hash + 2) % COLORS.strokes.length];
  
  const shapeType = hash % 3; // 0 = Shield, 1 = Ribbon Medal, 2 = Star

  return (
    <svg viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg">
      {/* Plain solid-color circular background */}
      <circle cx="50" cy="50" r="48" fill={bgCol} />
      
      {/* Central geometric shapes with smooth rounded lines and consistent medium line weight */}
      {shapeType === 0 && (
        <g stroke={strokeCol} strokeWidth="4" strokeLinejoin="round" fill={fillCol}>
          {/* Shield */}
          <path d="M 50 18 L 22 28 L 22 52 C 22 75 50 86 50 86 C 50 86 78 75 78 52 L 78 28 Z" />
          <path d="M 50 18 L 50 86" stroke={strokeCol} strokeWidth="4" opacity="0.3" />
        </g>
      )}
      
      {shapeType === 1 && (
        <g stroke={strokeCol} strokeWidth="4" strokeLinejoin="round" fill={fillCol}>
          {/* Ribbon Medal */}
          <path d="M 32 60 L 25 88 L 50 76 L 75 88 L 68 60" fill={COLORS.fills[(hash + 2) % COLORS.fills.length]} />
          <circle cx="50" cy="40" r="24" />
          <circle cx="50" cy="40" r="10" fill={strokeCol} stroke="none" />
        </g>
      )}
      
      {shapeType === 2 && (
        <g stroke={strokeCol} strokeWidth="4" strokeLinejoin="round" fill={fillCol}>
          {/* Rounded Star */}
          <path d="M 50 16 L 59 36 L 80 39 L 65 54 L 69 75 L 50 64 L 31 75 L 35 54 L 20 39 L 41 36 Z" />
          <circle cx="50" cy="47" r="6" fill={strokeCol} stroke="none" />
        </g>
      )}
    </svg>
  );
}
