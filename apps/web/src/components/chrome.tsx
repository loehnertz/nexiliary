import type { ReactNode } from 'react'
import type { Tone } from '@nexiliary/engine'

export function Frame({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`frame ${className}`}>
      <div className="frame-inner">{children}</div>
    </div>
  )
}

export function Rule() {
  return <div className="rule" />
}

export function toneClass(tone: Tone): string {
  return `tone-${tone}`
}

export function glowClass(tone: Tone): string {
  return `glow-${tone}`
}

export function Stat({ value, label, tone }: { value: string; label: string; tone?: Tone }) {
  return (
    <span className="flex-1 text-center">
      <b className={`block text-sm font-bold numerals ${tone === undefined ? '' : toneClass(tone)}`}>{value}</b>
      <span className="label-tight">{label}</span>
    </span>
  )
}
