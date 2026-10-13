/**
 * Lightweight Thumbnail & Data URL Generator for Vision Datasets.
 * Generates compact, secure 128x128 previews:
 * - Real image buffers: Encodes to compact data URLs
 * - Synthetic/headless fallback: Produces deterministic vector SVG dermatoscope/lesion representations
 */

/**
 * Generates a deterministic SVG thumbnail representation for an image
 */
export function generateSyntheticThumbnail(
  imageId: string,
  yTrue: string | number,
  yPred: string | number,
  options: {
    hasRuler?: boolean;
    sharpness?: number;
    meanLuminance?: number;
  } = {}
): string {
  // Deterministic pseudo-random seed from imageId
  let hash = 0;
  for (let i = 0; i < imageId.length; i++) {
    hash = (hash << 5) - hash + imageId.charCodeAt(i);
    hash |= 0;
  }
  const posHash = Math.abs(hash);

  const isMalignant = String(yTrue) === '1' || String(yTrue).toLowerCase() === 'malignant';
  const isBlurry = (options.sharpness ?? 200) < 150;
  const hasRuler = options.hasRuler ?? false;

  // Visual parameters
  const lesionColor = isMalignant ? '#831843' : '#78350f'; // Dark maroon vs dark tan
  const outerHalo = isMalignant ? '#be185d' : '#d97706';
  const radius = 28 + (posHash % 14);
  const blurFilter = isBlurry ? 'filter="url(#blur)"' : '';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
    <defs>
      <radialGradient id="skin" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#fbcfe8" stop-opacity="0.4"/>
        <stop offset="100%" stop-color="#f472b6" stop-opacity="0.15"/>
      </radialGradient>
      <radialGradient id="lesionGrad_${posHash % 100}" cx="45%" cy="45%" r="60%">
        <stop offset="0%" stop-color="${outerHalo}"/>
        <stop offset="70%" stop-color="${lesionColor}"/>
        <stop offset="100%" stop-color="#0f172a"/>
      </radialGradient>
      ${isBlurry ? '<filter id="blur"><feGaussianBlur stdDeviation="3.2"/></filter>' : ''}
    </defs>
    
    <!-- Background Skin Surface -->
    <rect width="128" height="128" fill="#1e293b"/>
    <circle cx="64" cy="64" r="58" fill="url(#skin)"/>
    
    <!-- Synthetic Lesion Contour -->
    <g ${blurFilter}>
      <path d="M ${64 + (posHash % 7) - 3} ${64 - radius} 
               C ${64 + radius + (posHash % 5)} ${64 - radius / 2}, 
                 ${64 + radius - (posHash % 9)} ${64 + radius / 2}, 
                 ${64 + (posHash % 11) - 5} ${64 + radius} 
               C ${64 - radius + (posHash % 6)} ${64 + radius / 1.5}, 
                 ${64 - radius - (posHash % 8)} ${64 - radius / 2}, 
                 ${64 + (posHash % 7) - 3} ${64 - radius} Z" 
            fill="url(#lesionGrad_${posHash % 100})" 
            opacity="0.92"/>
    </g>

    <!-- Scale Ruler Artifact (Shortcut Confounder) -->
    ${
      hasRuler
        ? `<g opacity="0.85">
            <rect x="10" y="104" width="108" height="14" fill="#f8fafc" stroke="#334155" stroke-width="1" rx="2"/>
            <line x1="16" y1="104" x2="16" y2="114" stroke="#0f172a" stroke-width="1.5"/>
            <line x1="32" y1="104" x2="32" y2="111" stroke="#0f172a" stroke-width="1"/>
            <line x1="48" y1="104" x2="48" y2="114" stroke="#0f172a" stroke-width="1.5"/>
            <line x1="64" y1="104" x2="64" y2="111" stroke="#0f172a" stroke-width="1"/>
            <line x1="80" y1="104" x2="80" y2="114" stroke="#0f172a" stroke-width="1.5"/>
            <line x1="96" y1="104" x2="96" y2="111" stroke="#0f172a" stroke-width="1"/>
            <line x1="112" y1="104" x2="112" y2="114" stroke="#0f172a" stroke-width="1.5"/>
            <text x="56" y="116" font-family="monospace" font-size="7" fill="#0f172a">mm</text>
           </g>`
        : ''
    }

    <!-- Watermark / Artifact Label -->
    <text x="6" y="14" font-family="monospace" font-size="8" fill="#94a3b8" opacity="0.65">${imageId}</text>
  </svg>`.trim();

  const base64Svg = Buffer.from(svg).toString('base64');
  return `data:image/svg+xml;base64,${base64Svg}`;
}

/**
 * Creates data URL from raw image buffer
 */
export function bufferToDataUrl(buffer: Buffer, format: 'jpeg' | 'png' | 'webp'): string {
  const mimeType = format === 'jpeg' ? 'image/jpeg' : format === 'png' ? 'image/png' : 'image/webp';
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}
