import type { ReactNode } from 'react'
import type { WindowSection, WindowStyle } from '../types'

/**
 * Parametric exterior-view window/door schematic, drawn from a line item's spec
 * (never a static image). Clean line-art to match NSR's proposal diagrams:
 * outer frame scaled to the W:H aspect, an operation glyph per lite, optional
 * grille grid, mullions between mulled sections, and dimension call-outs.
 */

/* ------------------------------ spec helpers ------------------------------- */

const EIGHTHS: [number, string][] = [
  [0, ''],
  [0.125, '⅛'],
  [0.25, '¼'],
  [0.375, '⅜'],
  [0.5, '½'],
  [0.625, '⅝'],
  [0.75, '¾'],
  [0.875, '⅞'],
]

/** 36.5 -> 36½″. Rounds to the nearest eighth. */
export function formatInches(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return '—'
  let whole = Math.floor(n)
  const frac = n - whole
  let best = EIGHTHS[0]
  let bd = 1
  for (const e of EIGHTHS) {
    const d = Math.abs(frac - e[0])
    if (d < bd) {
      bd = d
      best = e
    }
  }
  // frac rounded up to a whole inch
  if (Math.abs(frac - 1) < bd) {
    whole += 1
    best = EIGHTHS[0]
  }
  return `${whole}${best[1]}″`
}

/** Interior grille lines as lite counts (cols × rows). */
export function parseGrille(grille?: string | null): { cols: number; rows: number } {
  const g = (grille ?? '').trim().toLowerCase()
  if (!g || g.includes('none') || g.includes('no grille') || g.includes('clear')) {
    return { cols: 1, rows: 1 }
  }
  // Grid form: "2W5H" / "2 wide 5 high" -> lite counts.
  const w = g.match(/(\d+)\s*w/)
  const h = g.match(/(\d+)\s*h/)
  const v = g.match(/(\d+)\s*v/)
  if (w && h) return { cols: Math.max(1, +w[1]), rows: Math.max(1, +h[1]) }
  // Bar form: "1H+2V" -> bars, so lites = bars + 1.
  if (v || h) {
    const vBars = v ? +v[1] : 0
    const hBars = h ? +h[1] : 0
    return { cols: vBars + 1, rows: hBars + 1 }
  }
  // Named patterns -> a sensible default colonial grid.
  if (g.includes('colonial') || g.includes('grille') || g.includes('prairie') || g.includes('grid')) {
    return { cols: 3, rows: 2 }
  }
  return { cols: 1, rows: 1 }
}

const STYLE_KEYWORDS: [RegExp, WindowStyle][] = [
  [/storm/, 'storm-door'],
  [/(sliding|gliding)\s*(patio|glass)|patio\s*door/, 'patio-door'],
  [/(french|hinged|entry|swing).*door|door.*(french|hinged|swing)/, 'hinged-door'],
  [/double[\s-]*hung|\bdh\b/, 'double-hung'],
  [/single[\s-]*hung|\bsh\b/, 'single-hung'],
  [/casement|\bcs\b/, 'casement'],
  [/awning|hopper/, 'awning'],
  [/octagon/, 'octagon'],
  [/half[\s-]*(circle|round)|round[\s-]*top|arch|transom/, 'half-circle'],
  [/\bbow\b|\bbay\b/, 'bow'],
  [/garden/, 'garden'],
  [/slider|sliding|glider|gliding/, 'slider'],
  [/picture|fixed|direct\s*set|\bfx\b/, 'picture'],
  [/\bdoor\b/, 'hinged-door'],
]

/** Best-effort style from free-text (catalog series / configuration / label). */
export function inferWindowStyle(text: string | null | undefined): WindowStyle {
  const t = (text ?? '').toLowerCase()
  for (const [re, style] of STYLE_KEYWORDS) if (re.test(t)) return style
  return 'unknown'
}

const DOOR_STYLES: WindowStyle[] = ['patio-door', 'hinged-door', 'storm-door']
export const isDoorStyle = (s: WindowStyle) => DOOR_STYLES.includes(s)

/* -------------------------------- drawing ---------------------------------- */

interface DiagramProps {
  style?: WindowStyle
  widthIn?: number | null
  heightIn?: number | null
  sizeBasis?: string | null
  grille?: string | null
  handing?: 'L' | 'R' | null
  sections?: WindowSection[]
  /** Max px for the longest frame edge. */
  maxFrame?: number
}

const STROKE = 1
const GRILLE_STROKE = 0.5

// Operation glyph + grille within a single lite's glass area.
function lite(x: number, y: number, w: number, h: number, s: WindowSection, key: string) {
  const els: ReactNode[] = []
  const inset = Math.min(3, w / 6, h / 6)
  const gx = x + inset
  const gy = y + inset
  const gw = w - inset * 2
  const gh = h - inset * 2
  const cx = x + w / 2
  const cy = y + h / 2

  const operize = (style: WindowStyle) => {
    switch (style) {
      case 'single-hung':
        els.push(<line key={`${key}-mr`} x1={x} y1={cy} x2={x + w} y2={cy} stroke="currentColor" strokeWidth={STROKE} />)
        break
      case 'double-hung':
        els.push(<line key={`${key}-mr`} x1={x} y1={cy} x2={x + w} y2={cy} stroke="currentColor" strokeWidth={STROKE} />)
        els.push(<rect key={`${key}-s1`} x={gx} y={y + inset} width={gw} height={h / 2 - inset * 1.5} fill="none" stroke="currentColor" strokeWidth={GRILLE_STROKE} />)
        els.push(<rect key={`${key}-s2`} x={gx} y={cy + inset / 2} width={gw} height={h / 2 - inset * 1.5} fill="none" stroke="currentColor" strokeWidth={GRILLE_STROKE} />)
        break
      case 'casement': {
        const hingeLeft = s.handing !== 'R' // default hinge left, apex at hinge
        const apexX = hingeLeft ? x : x + w
        els.push(<line key={`${key}-c1`} x1={hingeLeft ? x + w : x} y1={y} x2={apexX} y2={cy} stroke="currentColor" strokeWidth={GRILLE_STROKE} />)
        els.push(<line key={`${key}-c2`} x1={hingeLeft ? x + w : x} y1={y + h} x2={apexX} y2={cy} stroke="currentColor" strokeWidth={GRILLE_STROKE} />)
        break
      }
      case 'awning':
      case 'garden':
        els.push(<line key={`${key}-a1`} x1={x} y1={y + h} x2={cx} y2={y} stroke="currentColor" strokeWidth={GRILLE_STROKE} />)
        els.push(<line key={`${key}-a2`} x1={x + w} y1={y + h} x2={cx} y2={y} stroke="currentColor" strokeWidth={GRILLE_STROKE} />)
        break
      case 'slider':
        els.push(<line key={`${key}-ms`} x1={cx} y1={y} x2={cx} y2={y + h} stroke="currentColor" strokeWidth={STROKE} />)
        break
      case 'patio-door': {
        els.push(<line key={`${key}-ms`} x1={cx} y1={y} x2={cx} y2={y + h} stroke="currentColor" strokeWidth={STROKE} />)
        els.push(<circle key={`${key}-hdl`} cx={cx - 2} cy={cy} r={0.8} fill="currentColor" />)
        break
      }
      case 'hinged-door':
        els.push(<circle key={`${key}-hdl`} cx={x + w - inset - 2} cy={cy} r={0.9} fill="currentColor" />)
        break
      case 'storm-door':
        els.push(<line key={`${key}-mr`} x1={x} y1={y + h * 0.62} x2={x + w} y2={y + h * 0.62} stroke="currentColor" strokeWidth={STROKE} />)
        els.push(<circle key={`${key}-hdl`} cx={x + w - inset - 2} cy={cy} r={0.9} fill="currentColor" />)
        break
      case 'picture':
      default:
        break
    }
  }
  operize(s.style)

  // Grille grid across the glass.
  const { cols, rows } = parseGrille(s.grille)
  for (let i = 1; i < cols; i++) {
    const lx = gx + (gw * i) / cols
    els.push(<line key={`${key}-gv${i}`} x1={lx} y1={gy} x2={lx} y2={gy + gh} stroke="currentColor" strokeWidth={GRILLE_STROKE} opacity={0.7} />)
  }
  for (let j = 1; j < rows; j++) {
    const ly = gy + (gh * j) / rows
    els.push(<line key={`${key}-gh${j}`} x1={gx} y1={ly} x2={gx + gw} y2={ly} stroke="currentColor" strokeWidth={GRILLE_STROKE} opacity={0.7} />)
  }
  return els
}

export function WindowDiagram({
  style = 'unknown',
  widthIn,
  heightIn,
  sizeBasis,
  grille,
  handing,
  sections,
  maxFrame = 78,
}: DiagramProps) {
  const aw = widthIn && widthIn > 0 ? widthIn : 1
  const ah = heightIn && heightIn > 0 ? heightIn : 1
  const ratio = aw / ah
  let fw = maxFrame
  let fh = maxFrame
  if (ratio >= 1) fh = maxFrame / ratio
  else fw = maxFrame * ratio

  const padX = 18
  const padTop = 15
  const padBottom = 15
  const svgW = padX + fw + 6
  const svgH = padTop + fh + padBottom
  const fx = padX
  const fy = padTop

  const secs: WindowSection[] =
    sections && sections.length > 0
      ? sections
      : style === 'bow'
        ? // Approximate a bow/bay as three side-by-side lites.
          [
            { style: 'picture' as WindowStyle, grille },
            { style: 'picture' as WindowStyle, grille },
            { style: 'picture' as WindowStyle, grille },
          ]
        : [{ style, grille, handing }]
  const totalWeight = secs.reduce((s, x) => s + (x.width ?? 1), 0)

  const body: ReactNode[] = []

  // Specialty frame shapes that replace the rectangle.
  if (secs.length === 1 && (style === 'octagon' || style === 'half-circle')) {
    if (style === 'octagon') {
      const k = Math.min(fw, fh) * 0.29
      const pts = [
        [fx + k, fy], [fx + fw - k, fy], [fx + fw, fy + k], [fx + fw, fy + fh - k],
        [fx + fw - k, fy + fh], [fx + k, fy + fh], [fx, fy + fh - k], [fx, fy + k],
      ].map((p) => p.join(',')).join(' ')
      body.push(<polygon key="oct" points={pts} fill="none" stroke="currentColor" strokeWidth={STROKE} />)
      const { cols, rows } = parseGrille(grille)
      for (let i = 1; i < cols; i++) body.push(<line key={`ov${i}`} x1={fx + (fw * i) / cols} y1={fy + 4} x2={fx + (fw * i) / cols} y2={fy + fh - 4} stroke="currentColor" strokeWidth={GRILLE_STROKE} opacity={0.7} />)
      for (let j = 1; j < rows; j++) body.push(<line key={`oh${j}`} x1={fx + 4} y1={fy + (fh * j) / rows} x2={fx + fw - 4} y2={fy + (fh * j) / rows} stroke="currentColor" strokeWidth={GRILLE_STROKE} opacity={0.7} />)
    } else {
      // half-circle: semicircle sitting on its diameter
      const r = fw / 2
      body.push(
        <path
          key="hc"
          d={`M ${fx} ${fy + fh} L ${fx} ${fy + fh} A ${r} ${r} 0 0 1 ${fx + fw} ${fy + fh} Z`}
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE}
        />,
      )
      const { cols } = parseGrille(grille)
      for (let i = 1; i < cols; i++) {
        const a = Math.PI * (i / cols)
        body.push(<line key={`hr${i}`} x1={fx + r} y1={fy + fh} x2={fx + r - r * Math.cos(a)} y2={fy + fh - r * Math.sin(a)} stroke="currentColor" strokeWidth={GRILLE_STROKE} opacity={0.7} />)
      }
    }
  } else {
    // Rectangular frame, possibly split into mulled sections.
    body.push(<rect key="frame" x={fx} y={fy} width={fw} height={fh} fill="none" stroke="currentColor" strokeWidth={STROKE * 1.4} />)
    let cursor = fx
    secs.forEach((sec, idx) => {
      const sw = (fw * (sec.width ?? 1)) / totalWeight
      if (idx > 0) {
        // heavier mullion between sections
        body.push(<line key={`mull${idx}`} x1={cursor} y1={fy} x2={cursor} y2={fy + fh} stroke="currentColor" strokeWidth={STROKE * 1.6} />)
      }
      body.push(...lite(cursor, fy, sw, fh, sec, `s${idx}`))
      if (secs.length > 1 && sec.label) {
        body.push(
          <text key={`lbl${idx}`} x={cursor + sw / 2} y={fy + fh / 2} textAnchor="middle" dominantBaseline="middle" fontSize={5.5} fill="currentColor" opacity={0.65}>
            {sec.label}
          </text>,
        )
      }
      cursor += sw
    })
  }

  const wLabel = `${sizeBasis ? sizeBasis + ' ' : ''}${formatInches(widthIn)}`
  const hLabel = formatInches(heightIn)

  return (
    <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} className="text-slate-700" role="img" aria-label="Exterior view diagram">
      {body}
      {/* Width call-out (top) */}
      <text x={fx + fw / 2} y={fy - 5} textAnchor="middle" fontSize={6} fill="currentColor">{wLabel}</text>
      {/* Height call-out (left, rotated) */}
      <text x={fx - 6} y={fy + fh / 2} textAnchor="middle" fontSize={6} fill="currentColor" transform={`rotate(-90 ${fx - 6} ${fy + fh / 2})`}>{hLabel}</text>
      {/* Caption */}
      <text x={fx + fw / 2} y={svgH - 4} textAnchor="middle" fontSize={5.5} fill="currentColor" opacity={0.6}>Exterior view</text>
    </svg>
  )
}
