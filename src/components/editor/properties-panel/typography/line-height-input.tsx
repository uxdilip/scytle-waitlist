'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

// ── Props ────────────────────────────────────────────────────────────────────

interface LineHeightInputProps {
    value: number | 'auto'
    unit: 'auto' | 'px' | '%'
    fontSize: number
    onChange: (value: number | 'auto', unit: 'auto' | 'px' | '%') => void
}

// ── Line height icon (3 horizontal lines) ───────────────────────────────────

function LineHeightIcon() {
    return (
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" className="text-muted-foreground shrink-0" aria-hidden>
            <rect x="0" y="0.5" width="11" height="1.1" rx="0.4" fill="currentColor" opacity="0.5" />
            <rect x="0" y="4.8" width="11" height="1.1" rx="0.4" fill="currentColor" opacity="0.5" />
            <rect x="0" y="9.1" width="11" height="1.1" rx="0.4" fill="currentColor" opacity="0.5" />
        </svg>
    )
}

// ── Display helpers ──────────────────────────────────────────────────────────

function displayValue(value: number | 'auto', unit: 'auto' | 'px' | '%'): string {
    if (unit === 'auto' || value === 'auto') return ''
    if (unit === '%') return `${value}%`
    return String(value)
}

function placeholderValue(fontSize: number): string {
    return String(Math.round(fontSize * 1.2))
}

// ── Parse committed input → (value, unit) ───────────────────────────────────

function parseInput(raw: string, fontSize: number): { value: number | 'auto'; unit: 'auto' | 'px' | '%' } {
    const trimmed = raw.trim()
    if (trimmed === '' || /^auto$/i.test(trimmed)) {
        return { value: 'auto', unit: 'auto' }
    }
    if (trimmed.endsWith('%')) {
        const num = parseFloat(trimmed)
        if (isNaN(num)) return { value: 'auto', unit: 'auto' }
        return { value: Math.round(num), unit: '%' }
    }
    // Strip "px" suffix if present
    const cleaned = trimmed.replace(/px$/i, '')
    const num = parseFloat(cleaned)
    if (isNaN(num)) return { value: 'auto', unit: 'auto' }
    return { value: Math.round(num * 10) / 10, unit: 'px' }
}

// ── Component ────────────────────────────────────────────────────────────────

export function LineHeightInput({ value, unit, fontSize, onChange }: LineHeightInputProps) {
    const isAuto = unit === 'auto' || value === 'auto'
    const [localValue, setLocalValue] = useState(displayValue(value, unit))
    const [isFocused, setIsFocused] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    // Sync external → local when not focused
    useEffect(() => {
        if (!isFocused) {
            setLocalValue(displayValue(value, unit))
        }
    }, [value, unit, isFocused])

    const commit = useCallback((raw: string) => {
        const parsed = parseInput(raw, fontSize)
        onChange(parsed.value, parsed.unit)
    }, [fontSize, onChange])

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            commit(localValue)
            inputRef.current?.blur()
            return
        }
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault()
            const delta = e.key === 'ArrowUp' ? 1 : -1
            const step = unit === '%' ? 1 : (e.shiftKey ? 10 : 1)
            const cur = typeof value === 'number' ? value : Math.round(fontSize * 1.2)
            const next = Math.max(0, cur + delta * step)
            const nextUnit = unit === 'auto' ? 'px' : unit
            onChange(next, nextUnit)
        }
    }

    return (
        <div className="flex items-center gap-1 flex-1 min-w-0">
            <LineHeightIcon />
            <input
                ref={inputRef}
                type="text"
                value={isFocused ? localValue : (isAuto ? '' : displayValue(value, unit))}
                placeholder={isAuto ? 'Auto' : placeholderValue(fontSize)}
                onChange={(e) => setLocalValue(e.target.value)}
                onFocus={(e) => {
                    setIsFocused(true)
                    if (isAuto) setLocalValue('')
                    e.target.select()
                }}
                onBlur={() => {
                    setIsFocused(false)
                    commit(localValue)
                }}
                onKeyDown={handleKeyDown}
                className={cn(
                    'w-full h-7 px-2 text-[11px] rounded-sm',
                    'bg-transparent border border-transparent',
                    'hover:bg-muted/50',
                    'focus:bg-muted/60 focus:border-border focus:outline-none',
                    'transition-colors tabular-nums',
                    isAuto && !isFocused && 'text-muted-foreground/60',
                )}
            />
        </div>
    )
}
