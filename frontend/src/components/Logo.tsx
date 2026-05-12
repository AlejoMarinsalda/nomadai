const DARK   = '#1C1917'
const ACCENT = '#C84B1A'

function CompassIcon({ size = 24 }: { size?: number }) {
  return (
    <svg viewBox="0 0 104 104" width={size} height={size} fill="none" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(2,2)">
        <circle cx="50" cy="50" r="48" fill="none" stroke={DARK} strokeWidth="2.5"/>
        <circle cx="50" cy="50" r="38" fill="#F2EDE4" stroke={DARK} strokeWidth="1"/>
        <rect x="49" y="6" width="2" height="8" fill={DARK} transform="rotate(0 50 50)"/>
        <rect x="49" y="6" width="2" height="8" fill={DARK} transform="rotate(90 50 50)"/>
        <rect x="49" y="6" width="2" height="8" fill={DARK} transform="rotate(180 50 50)"/>
        <rect x="49" y="6" width="2" height="8" fill={DARK} transform="rotate(270 50 50)"/>
        <path d="M 50 14 L 58 50 L 50 86 L 42 50 Z" fill={DARK}/>
        <path d="M 50 14 L 58 50 L 50 50 Z" fill={ACCENT}/>
        <circle cx="50" cy="50" r="4" fill="#F2EDE4" stroke={DARK} strokeWidth="1.5"/>
      </g>
    </svg>
  )
}

export default function Logo({ size = 24 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2">
      <CompassIcon size={size} />
      <span
        style={{
          fontFamily: 'Cormorant Garamond, serif',
          fontSize: size * 0.6,
          fontWeight: 700,
          color: DARK,
          lineHeight: 1,
        }}
      >
        nomadai
      </span>
    </div>
  )
}

export { CompassIcon }
