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

// 受 e 付 desenhados (contornos da IPAゴシック, licença IPA): nem todo celular tem fonte japonesa,
// e sem ela o selo ficava vazio.
const KANJI_UKE =
  'M569 729Q567 723 561 711Q556 699 553 692Q508 584 453 502L588 461Q667 573 729 729H981Q936 602 856 465L993 430Q1075 564 1138 729H1286Q1369 584 1451 379L1599 424Q1526 588 1435 729H1839V1134H1689V858H357V1134H207V729ZM1172 1566Q1418 1700 1903 1771L1794 1920Q1350 1832 1049 1652Q699 1866 250 1957L160 1820Q600 1752 926 1566Q718 1407 555 1177H443V1048H1512L1585 1114Q1417 1381 1172 1566ZM1047 1486Q1263 1328 1372 1177H713Q850 1346 1047 1486ZM248 313Q1037 291 1575 155L1694 284Q1111 409 313 452Z'
const KANJI_TSUKE =
  'M538 593V1943H388V896Q292 1059 185 1204L101 1079Q397 692 529 141L681 178Q617 399 550 565ZM1627 579H1918V716H1635V1732Q1635 1825 1602 1861Q1564 1902 1448 1902Q1290 1902 1125 1885L1098 1724Q1273 1755 1409 1755Q1483 1755 1483 1677V716H650V579H1475V151H1627ZM1098 1425Q971 1162 815 979L938 897Q1097 1086 1233 1329Z'

function KanjiGlyph({ path }: { path: string }) {
  return (
    <svg viewBox="80 130 1860 1860" width="21" height="21" className="block">
      <path d={path} fill="#c8102e" />
    </svg>
  )
}

/** Selo vermelho (hanko) que carimba o pedido enviado. "受付" = recebido. */
export function HankoStamp({ className = '' }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`pointer-events-none ${className}`}>
      <div className="sf-hanko relative">
      <div className="sf-hanko-seal flex h-[68px] w-[68px] items-center justify-center rounded-[14px] border-[3px] border-[#c8102e] bg-[#fff7ee] shadow-lg shadow-black/20">
        <div className="flex h-[54px] w-[54px] flex-col items-center justify-center gap-[1px] rounded-[9px] border border-[#c8102e]/70">
          <KanjiGlyph path={KANJI_UKE} />
          <KanjiGlyph path={KANJI_TSUKE} />
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
