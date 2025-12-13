import * as React from 'react'

function SVGComponent(props: React.SVGProps<SVGSVGElement> & { width?: number, height?: number }) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <defs>
        <linearGradient id="neon_blue" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop
            offset="0%"
            style={{
              stopColor: '#0ea5e9',
              stopOpacity: 1,
            }}
          />
          <stop
            offset="100%"
            style={{
              stopColor: '#2563eb',
              stopOpacity: 1,
            }}
          />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={100} height={100} rx={22} fill="#0f172a" />
      <rect
        x={38}
        y={24}
        width={40}
        height={56}
        rx={6}
        stroke="url(#neon_blue)"
        strokeWidth={3}
        strokeOpacity={0.15}
        fill="none"
        transform="rotate(-6 58 52)"
      />
      <rect
        x={34}
        y={22}
        width={40}
        height={56}
        rx={6}
        stroke="url(#neon_blue)"
        strokeWidth={3}
        strokeOpacity={0.3}
        fill="none"
        transform="rotate(-3 54 50)"
      />
      <rect
        x={30}
        y={22}
        width={40}
        height={56}
        rx={6}
        fill="#1e293b"
        stroke="url(#neon_blue)"
        strokeWidth={3}
      />
      <path
        d="M58 22H64C67.3137 22 70 24.6863 70 28V36L64 32L58 36V22Z"
        fill="#0ea5e9"
      />
      <path d="M42 42H58" stroke="white" strokeWidth={3} strokeLinecap="round" />
      <path
        d="M38 52H62"
        stroke="white"
        strokeWidth={3}
        strokeLinecap="round"
        strokeOpacity={0.6}
      />
      <path
        d="M38 62H62"
        stroke="white"
        strokeWidth={3}
        strokeLinecap="round"
        strokeOpacity={0.6}
      />
    </svg>
  )
}
export default SVGComponent
