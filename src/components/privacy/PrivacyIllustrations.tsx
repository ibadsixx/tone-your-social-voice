interface IllustrationProps {
  className?: string;
}

export const SharingIllustration = ({ className }: IllustrationProps) => (
  <svg viewBox="0 0 400 200" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="400" height="200" rx="12" fill="#fef3c7" />
    <circle cx="200" cy="100" r="75" fill="#fde68a" opacity="0.5" />
    <ellipse cx="200" cy="100" rx="60" ry="35" fill="#f59e0b" opacity="0.25" />
    <circle cx="200" cy="100" r="28" fill="#f59e0b" opacity="0.4" />
    <circle cx="200" cy="100" r="14" fill="#d97706" />
    <circle cx="200" cy="100" r="5" fill="#fff" opacity="0.8" />
    <g opacity="0.6">
      <circle cx="160" cy="68" r="8" fill="#fbbf24" />
      <circle cx="240" cy="68" r="8" fill="#fbbf24" />
      <circle cx="150" cy="82" r="10" fill="#fbbf24" />
      <circle cx="250" cy="82" r="10" fill="#fbbf24" />
      <circle cx="140" cy="100" r="12" fill="#fbbf24" />
      <circle cx="260" cy="100" r="12" fill="#fbbf24" />
    </g>
  </svg>
);

export const DiscoverabilityIllustration = ({ className }: IllustrationProps) => (
  <svg viewBox="0 0 400 200" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="400" height="200" rx="12" fill="#e0f2fe" />
    <circle cx="200" cy="100" r="80" stroke="#38bdf8" strokeWidth="1.5" strokeDasharray="6 4" opacity="0.4" />
    <circle cx="200" cy="100" r="55" stroke="#38bdf8" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.5" />
    <circle cx="200" cy="100" r="30" stroke="#0ea5e9" strokeWidth="2" opacity="0.6" />
    <circle cx="200" cy="100" r="8" fill="#0ea5e9" />
    <g opacity="0.7">
      <circle cx="200" cy="15" r="5" fill="#38bdf8" />
      <circle cx="200" cy="185" r="5" fill="#38bdf8" />
      <circle cx="115" cy="100" r="5" fill="#38bdf8" />
      <circle cx="285" cy="100" r="5" fill="#38bdf8" />
      <circle cx="140" cy="40" r="4" fill="#7dd3fc" />
      <circle cx="260" cy="40" r="4" fill="#7dd3fc" />
      <circle cx="140" cy="160" r="4" fill="#7dd3fc" />
      <circle cx="260" cy="160" r="4" fill="#7dd3fc" />
    </g>
    <path d="M200 100 L230 70" stroke="#0ea5e9" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
    <path d="M200 100 L160 130" stroke="#0ea5e9" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
    <path d="M200 100 L240 120" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
    <path d="M200 100 L170 75" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
  </svg>
);

export const DataControlsIllustration = ({ className }: IllustrationProps) => (
  <svg viewBox="0 0 400 200" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="400" height="200" rx="12" fill="#d1fae5" />
    <rect x="90" y="50" width="220" height="100" rx="10" fill="#fff" opacity="0.7" stroke="#10b981" strokeWidth="1" strokeOpacity="0.3" />
    <rect x="110" y="68" width="60" height="10" rx="5" fill="#34d399" opacity="0.6" />
    <rect x="180" y="68" width="40" height="10" rx="5" fill="#d1fae5" />
    <rect x="110" y="90" width="80" height="10" rx="5" fill="#10b981" opacity="0.8" />
    <rect x="200" y="90" width="30" height="10" rx="5" fill="#d1fae5" />
    <rect x="110" y="112" width="45" height="10" rx="5" fill="#34d399" opacity="0.5" />
    <rect x="165" y="112" width="55" height="10" rx="5" fill="#d1fae5" />
    <circle cx="260" cy="73" r="8" fill="#10b981" opacity="0.9" />
    <circle cx="250" cy="95" r="8" fill="#10b981" opacity="0.9" />
    <circle cx="255" cy="117" r="8" fill="#10b981" opacity="0.9" />
    <rect x="268" y="70" width="14" height="6" rx="3" fill="#059669" />
    <rect x="258" y="92" width="14" height="6" rx="3" fill="#059669" />
    <rect x="263" y="114" width="14" height="6" rx="3" fill="#059669" />
  </svg>
);

export const SecurityIllustration = ({ className }: IllustrationProps) => (
  <svg viewBox="0 0 400 200" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="400" height="200" rx="12" fill="#dbeafe" />
    <path d="M200 30 L280 65 L280 115 C280 155 200 175 200 175 C200 175 120 155 120 115 L120 65 L200 30Z" fill="#93c5fd" opacity="0.5" />
    <path d="M200 42 L262 70 L262 110 C262 143 200 160 200 160 C200 160 138 143 138 110 L138 70 L200 42Z" fill="#60a5fa" opacity="0.6" />
    <path d="M180 110 L195 125 L220 95" stroke="#3b82f6" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="200" cy="130" r="30" fill="#3b82f6" opacity="0.15" />
    <circle cx="200" cy="130" r="20" fill="#3b82f6" opacity="0.1" />
  </svg>
);

export const AdPreferencesIllustration = ({ className }: IllustrationProps) => (
  <svg viewBox="0 0 400 200" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="400" height="200" rx="12" fill="#fce7f3" />
    <rect x="90" y="55" width="220" height="90" rx="8" fill="#fff" opacity="0.6" stroke="#f472b6" strokeWidth="1" strokeOpacity="0.3" />
    <rect x="108" y="72" width="100" height="8" rx="4" fill="#f472b6" opacity="0.3" />
    <rect x="108" y="88" width="140" height="8" rx="4" fill="#f472b6" opacity="0.5" />
    <rect x="108" y="104" width="80" height="8" rx="4" fill="#f472b6" opacity="0.3" />
    <circle cx="275" cy="76" r="6" fill="#ec4899" opacity="0.5" />
    <circle cx="275" cy="92" r="6" fill="#ec4899" opacity="0.5" />
    <circle cx="275" cy="108" r="6" fill="#ec4899" opacity="0.5" />
    <g opacity="0.7">
      <path d="M310 55 L320 45" stroke="#f472b6" strokeWidth="2" strokeLinecap="round" />
      <path d="M325 62 L340 55" stroke="#f472b6" strokeWidth="2" strokeLinecap="round" />
      <path d="M315 140 L328 150" stroke="#f472b6" strokeWidth="2" strokeLinecap="round" />
      <path d="M90 45 L78 35" stroke="#f472b6" strokeWidth="2" strokeLinecap="round" />
      <path d="M85 145 L72 155" stroke="#f472b6" strokeWidth="2" strokeLinecap="round" />
    </g>
    <circle cx="330" cy="80" r="3" fill="#f472b6" />
    <circle cx="80" cy="50" r="3" fill="#f472b6" />
    <circle cx="75" cy="140" r="3" fill="#f472b6" />
    <circle cx="320" cy="145" r="3" fill="#f472b6" />
  </svg>
);
