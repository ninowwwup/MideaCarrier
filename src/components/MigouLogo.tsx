import React from 'react';

interface MigouLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  animated?: boolean;
  onClick?: () => void;
}

const SIZE_MAP = {
  sm: 'w-9 h-9 rounded-xl',
  md: 'w-11 h-11 sm:w-12 sm:h-12 rounded-2xl',
  lg: 'w-14 h-14 sm:w-15 sm:h-15 rounded-2xl',
  xl: 'w-16 h-16 sm:w-18 sm:h-18 rounded-[22px]',
};

/**
 * Logo Oficial MIGOU — "O Passarinho Azul da Operação SAP & WMS"
 * Combina o pássaro azul (símbolo sonoro que marcou a operação entre Time Buiatte e Time Midea)
 * com o fluxo contínuo de transferência de materiais no SAP MIGO (311).
 */
export const MigouLogo: React.FC<MigouLogoProps> = ({
  size = 'md',
  className = '',
  animated = true,
  onClick,
}) => {
  const uniqueId = React.useId().replace(/:/g, '');

  return (
    <div
      onClick={onClick}
      className={`relative inline-flex items-center justify-center select-none group ${SIZE_MAP[size]} ${
        onClick ? 'cursor-pointer' : ''
      } ${className}`}
      title="MIGOU • O Passarinho Azul da Gestão de Transferências SAP & WMS"
    >
      {/* Halo Luminoso Externo Estilo Figma */}
      <div
        className={`absolute -inset-1 rounded-[inherit] bg-gradient-to-tr from-[#0083CA]/45 via-[#38BDF8]/35 to-[#FDE047]/30 blur-md opacity-75 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none ${
          animated ? 'animate-pulse' : ''
        }`}
      />

      {/* SVG Vetorial de Alta Precisão */}
      <svg
        viewBox="0 0 512 512"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`relative w-full h-full drop-shadow-[0_6px_16px_rgba(0,22,64,0.38)] transition-transform duration-300 group-hover:scale-105 ${
          animated ? 'migou-logo-float' : ''
        }`}
      >
        <defs>
          <linearGradient
            id={`bgSquircle-${uniqueId}`}
            x1="32"
            y1="24"
            x2="480"
            y2="488"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#001B4D" />
            <stop offset="48%" stopColor="#00488E" />
            <stop offset="100%" stopColor="#0083CA" />
          </linearGradient>

          <radialGradient
            id={`auroraGlow-${uniqueId}`}
            cx="380"
            cy="115"
            r="290"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.6" />
            <stop offset="55%" stopColor="#249ED5" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#002664" stopOpacity="0" />
          </radialGradient>

          <linearGradient
            id={`birdBody-${uniqueId}`}
            x1="120"
            y1="120"
            x2="390"
            y2="390"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#7DD3FC" />
            <stop offset="45%" stopColor="#38BDF8" />
            <stop offset="100%" stopColor="#0284C7" />
          </linearGradient>

          <linearGradient
            id={`birdWing-${uniqueId}`}
            x1="155"
            y1="115"
            x2="325"
            y2="310"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="55%" stopColor="#E0F2FE" />
            <stop offset="100%" stopColor="#7DD3FC" />
          </linearGradient>

          <linearGradient
            id={`birdBreast-${uniqueId}`}
            x1="250"
            y1="230"
            x2="380"
            y2="380"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.96" />
            <stop offset="100%" stopColor="#BAE6FD" stopOpacity="0.88" />
          </linearGradient>

          <linearGradient
            id={`beakGrad-${uniqueId}`}
            x1="375"
            y1="175"
            x2="440"
            y2="210"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#FDE047" />
            <stop offset="100%" stopColor="#F59E0B" />
          </linearGradient>
        </defs>

        {/* Squircle Base */}
        <rect
          x="12"
          y="12"
          width="488"
          height="488"
          rx="118"
          fill={`url(#bgSquircle-${uniqueId})`}
        />
        <rect
          x="12"
          y="12"
          width="488"
          height="488"
          rx="118"
          fill={`url(#auroraGlow-${uniqueId})`}
        />

        {/* Borda Especular Interna 3D (Glass Highlight) */}
        <rect
          x="18"
          y="18"
          width="476"
          height="476"
          rx="112"
          stroke="#FFFFFF"
          strokeOpacity="0.28"
          strokeWidth="6"
        />

        {/* Hexágono Logístico Sutil (Representando Depósitos e Centros SAP) */}
        <path
          d="M256 64 L414 154 L414 334 L256 424 L98 334 L98 154 Z"
          stroke="#7DD3FC"
          strokeOpacity="0.16"
          strokeWidth="5"
          strokeDasharray="10 10"
        />

        {/* Ondas Sonoras do Canto do Pássaro (Alerta em Tempo Real) */}
        <path
          d="M416 146 A 38 38 0 0 1 446 184"
          stroke="#7DD3FC"
          strokeWidth="11"
          strokeLinecap="round"
          className={animated ? 'migou-wave-1' : ''}
        />
        <path
          d="M432 118 A 70 70 0 0 1 476 182"
          stroke="#FDE047"
          strokeWidth="9"
          strokeLinecap="round"
          className={animated ? 'migou-wave-2' : ''}
        />

        {/* Cauda Dinâmica do Passarinho Azul */}
        <path
          d="M148 312 L72 358 L112 292 L76 268 L156 274 Z"
          fill="#0284C7"
        />

        {/* Bico Dourado */}
        <path
          d="M380 176 L440 190 L384 214 Z"
          fill={`url(#beakGrad-${uniqueId})`}
        />

        {/* Corpo Principal do Passarinho Azul */}
        <path
          d="M324 128 C362 128 392 156 392 194 C392 212 384 228 374 240 C392 276 382 328 344 358 C302 392 232 394 176 358 C142 336 126 302 132 270 C190 278 238 242 262 186 C276 150 296 128 324 128 Z"
          fill={`url(#birdBody-${uniqueId})`}
        />

        {/* Peito Iluminado */}
        <path
          d="M374 240 C392 276 382 328 344 358 C308 386 254 390 204 370 C258 360 308 324 328 272 C338 248 358 240 374 240 Z"
          fill={`url(#birdBreast-${uniqueId})`}
        />

        {/* Asa Elevada em Voo (Agilidade WMS ➔ SAP) */}
        <path
          d="M236 226 C182 192 142 136 136 86 C198 100 258 142 294 198 C314 228 310 272 280 298 C248 326 194 324 156 298 C196 298 234 276 244 248 C248 238 244 232 236 226 Z"
          fill={`url(#birdWing-${uniqueId})`}
          className={animated ? 'migou-wing-glide' : ''}
        />

        {/* Olho Expressivo com Brilho */}
        <circle cx="348" cy="180" r="14" fill="#001B4D" />
        <circle cx="353" cy="175" r="5.5" fill="#FFFFFF" />

        {/* Arco Inferior de Movimentação SAP 311 */}
        <path
          d="M132 414 C204 452 316 452 384 410"
          stroke="#38BDF8"
          strokeWidth="13"
          strokeLinecap="round"
        />
        <path
          d="M366 395 L394 406 L378 432"
          stroke="#38BDF8"
          strokeWidth="13"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};

