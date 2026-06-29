import React from 'react';

// Warm, muted, professional color palette (soft blues, teals, terracotta, cream)
const COLORS = {
  backgrounds: ['#F4F1DE', '#EBF4F6', '#F2E9E4', '#E0F2FE', '#ECFDF5'],
  skinTones: ['#FFC8A2', '#E2A973', '#C78B58', '#FFD1B3', '#D49A6A'],
  clothes: ['#8AB4F8', '#80CBC4', '#E07A5F', '#F4A261', '#E9C46A'],
  hair: ['#3D405B', '#264653', '#1D3557', '#5E503F', '#D4A373', '#A0522D'], 
  strokes: ['#3D405B', '#264653', '#1D3557', '#5E503F'], // medium line weights, consistent
};

interface AvatarIllustrationProps {
  seed: string;
  className?: string;
}

export default function AvatarIllustration({ seed, className = 'w-12 h-12' }: AvatarIllustrationProps) {
  // Simple deterministic hash based on seed string
  const hash = seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  
  const bgCol = COLORS.backgrounds[hash % COLORS.backgrounds.length];
  const skinCol = COLORS.skinTones[(hash + 1) % COLORS.skinTones.length];
  const clothCol = COLORS.clothes[(hash + 2) % COLORS.clothes.length];
  const hairCol = COLORS.hair[(hash + 3) % COLORS.hair.length];
  const strokeCol = COLORS.strokes[(hash + 4) % COLORS.strokes.length];
  
  const hairType = hash % 3;
  const accessoryType = (hash + 1) % 3;

  return (
    <svg viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg">
      {/* Plain solid-color circular background */}
      <circle cx="50" cy="50" r="48" fill={bgCol} />
      
      {/* Central geometric shapes with smooth rounded lines and consistent medium line weight */}
      <g stroke={strokeCol} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round">
        
        {/* Body/Shoulders */}
        <path d="M 25 90 C 25 70 35 60 50 60 C 65 60 75 70 75 90" fill={clothCol} />
        
        {/* Head */}
        <path d="M 35 45 C 35 25 65 25 65 45 C 65 65 35 65 35 45" fill={skinCol} />

        {/* Hair Variations */}
        {hairType === 0 && (
          // Short hair
          <path d="M 32 45 C 32 20 68 20 68 45 C 68 35 50 25 32 45 Z" fill={hairCol} />
        )}
        {hairType === 1 && (
          // Spiky/Messy hair
          <path d="M 32 40 L 40 25 L 45 35 L 55 20 L 60 35 L 68 40 C 68 20 32 20 32 40 Z" fill={hairCol} />
        )}
        {hairType === 2 && (
          // Long/Bob hair
          <path d="M 32 35 C 32 15 68 15 68 35 L 68 55 C 68 60 62 60 62 55 L 62 35 C 62 25 38 25 38 35 L 38 55 C 38 60 32 60 32 55 Z" fill={hairCol} />
        )}

        {/* Accessory Variations (Glasses, etc.) */}
        {accessoryType === 1 && (
          // Glasses
          <g>
            <circle cx="43" cy="45" r="4" fill="none" />
            <circle cx="57" cy="45" r="4" fill="none" />
            <line x1="47" y1="45" x2="53" y2="45" />
          </g>
        )}
        {accessoryType === 2 && (
          // Hat / Beanie
          <path d="M 34 35 C 34 15 66 15 66 35 Z" fill={clothCol} />
        )}
      </g>
    </svg>
  );
}
