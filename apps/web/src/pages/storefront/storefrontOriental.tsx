import { useEffect, useMemo, useState } from 'react'
import { prefersReducedMotion } from './storefrontMotion'

// Toques japoneses do cardápio online: pétalas de sakura ao abrir e o selo (hanko) no pedido
// enviado. Só transform/opacity e somem com "reduzir movimento".

const PETAL_COUNT = 14
const PETALS_VISIBLE_MS = 9000

interface Petal {
  left: number
  size: number
  delay: number
  duration: number
  drift: number
  spin: number
  hue: number
}

function randomBetween(minimum: number, maximum: number): number {
  return minimum + Math.random() * (maximum - minimum)
}

/** Pétalas caindo devagar sobre o topo por alguns segundos ao abrir a página. */
export function SakuraPetals() {
  const [visible, setVisible] = useState(() => !prefersReducedMotion())
  const petals = useMemo<Petal[]>(
    () =>
      Array.from({ length: PETAL_COUNT }, () => ({
        left: randomBetween(-5, 100),
        size: randomBetween(10, 18),
        delay: randomBetween(0, 2.2),
        duration: randomBetween(4.8, 7.2),
        drift: randomBetween(30, 110),
        spin: randomBetween(1.6, 3),
        hue: randomBetween(0, 1),
      })),
    []
  )

  useEffect(() => {
    if (!visible) return
    const timer = window.setTimeout(() => setVisible(false), PETALS_VISIBLE_MS)
    return () => window.clearTimeout(timer)
  }, [visible])

  if (!visible) return null
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {petals.map((petal, index) => (
        <span
          key={index}
          className="sf-petal-fall absolute top-0 block"
          style={{
            left: `${petal.left}%`,
            animationDuration: `${petal.duration}s`,
            animationDelay: `${petal.delay}s`,
            ['--sf-drift' as string]: `${petal.drift}px`,
          }}
        >
          <svg
            viewBox="0 0 20 20"
            width={petal.size}
            height={petal.size}
            className="sf-petal-spin block"
            style={{ animationDuration: `${petal.spin}s` }}
          >
            <path
              d="M10 1c3.6 2.6 6 6 6 9.6A6 6 0 0 1 10 19a6 6 0 0 1-6-8.4C4 7 6.4 3.6 10 1Zm0 0 1 3.2"
              fill={petal.hue > 0.5 ? '#ffd0df' : '#ffe3ec'}
              stroke="#f7a8c2"
              strokeWidth=".6"
            />
          </svg>
        </span>
      ))}
      <style>{`
        .sf-petal-fall { opacity: 0; animation-name: sfPetalFall; animation-timing-function: linear; animation-fill-mode: both; }
        .sf-petal-spin { animation: sfPetalSpin 2s ease-in-out infinite alternate; }
        @keyframes sfPetalFall {
          0% { transform: translate3d(0, -24px, 0); opacity: 0 }
          10% { opacity: .95 }
          80% { opacity: .9 }
          100% { transform: translate3d(var(--sf-drift, 60px), 540px, 0); opacity: 0 }
        }
        @keyframes sfPetalSpin { from { transform: rotate(-35deg) rotateY(0deg) } to { transform: rotate(40deg) rotateY(60deg) } }
        @media (prefers-reduced-motion: reduce) { .sf-petal-fall, .sf-petal-spin { animation: none; display: none } }
      `}</style>
    </div>
  )
}

/** Selo vermelho (hanko) que carimba o pedido enviado. "受付" = recebido. */
export function HankoStamp({ className = '' }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`pointer-events-none ${className}`}>
      <div className="sf-hanko relative">
      <div className="sf-hanko-seal flex h-[68px] w-[68px] items-center justify-center rounded-[14px] border-[3px] border-[#c8102e] bg-[#fff7ee] shadow-lg shadow-black/20">
        <div className="flex h-[54px] w-[54px] flex-col items-center justify-center rounded-[9px] border border-[#c8102e]/70 font-serif text-[22px] font-bold leading-[1.05] text-[#c8102e]">
          <span>受</span>
          <span>付</span>
        </div>
      </div>
      </div>
      <style>{`
        .sf-hanko-seal { transform: rotate(-10deg); animation: sfStamp .7s cubic-bezier(.2,.9,.3,1.2) .35s both; }
        .sf-hanko::after { content: ''; position: absolute; inset: 0; border-radius: 16px; border: 3px solid rgba(200,16,46,.45); opacity: 0; animation: sfStampInk .6s ease-out .72s both; }
        @keyframes sfStamp {
          0% { transform: scale(2.6) rotate(-24deg); opacity: 0 }
          55% { transform: scale(.9) rotate(-10deg); opacity: 1 }
          72% { transform: scale(1.05) rotate(-10deg) }
          100% { transform: scale(1) rotate(-10deg); opacity: 1 }
        }
        @keyframes sfStampInk { from { transform: rotate(-10deg) scale(1); opacity: .9 } to { transform: rotate(-10deg) scale(1.6); opacity: 0 } }
        @media (prefers-reduced-motion: reduce) { .sf-hanko-seal { animation: none } .sf-hanko::after { animation: none; display: none } }
      `}</style>
    </div>
  )
}
