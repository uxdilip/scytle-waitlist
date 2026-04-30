'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

// ── Props ────────────────────────────────────────────────────────────────────

interface LetterSpacingInputProps {
    value: number
    unit: 'px' | '%'
    onChange: (value: number, unit: 'px' | '%') => void
}

// ── Letter spacing icon (two A's) ───────────────────────────────────────────

function LetterSpacingIcon() {
    return (
        <svg width="13" height="11" viewBox="0 0 13 11" fill="none" className="text-muted-foreground shrink-0" aria-hidden>
            <path d="M0.5 10L2.5 3L4.5 10" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.55" />
            <line x1="1.3" y1="7.8" x2="3.7" y2="7.8" stroke="currentColor" strokeWidth="0.9" opacity="0.55" />
            <path d="M8.5 10L10.5 3L12.5 10" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.55" />
            <line x1="9.3" y1="7.8" x2="11.7" y2="7.8" stroke="currentColor" strokeWidth="0.9" opacity="0.55" />
        </svg>
    )
}

// ── Display / parse helpers ─────────────────────────────────────────────────

function displayValue(value: number, unit: 'px' | '%'): string {
    if (unit === '%') return `${value}%`
    return `${value}px`
}

function parseInput(raw: string, currentUnit: 'px' | '%'): { value: number; unit: 'px' | '%' } {
    const trimmed = raw.trim()
    if (trimmed === '') return { value: 0, unit: currentUnit }

    if (trimmed.endsWith('%')) {
        const num = parseFloat(trimmed)
        if (isNaN(num)) return { value: 0, unit: '%' }
        return { value: Math.round(num * 10) / 10, unit: '%' }
    }
    if (/px$/i.test(trimmed)) {
        const num = parseFloat(trimmed)
        if (isNaN(num)) return { value: 0, unit: 'px' }
        return { value: Math.round(num * 10) / 10, unit: 'px' }
    }
    // No suffix → keep current unit
    const num = parseFloat(trimmed)
    if (isNaN(num)) return { value: 0, unit: currentUnit }
    return { value: Math.round(num * 10) / 10, unit: currentUnit }
}

// ── Component ────────────────────────────────────────────────────────────────

export function LetterSpacingInput({ value, unit, onChange }: LetterSpacingInputProps) {
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
        const parsed = parseInput(raw, unit)
        onChange(parsed.value, parsed.unit)
    }, [unit, onChange])

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            commit(localValue)
            inputRef.current?.blur()
            return
        }
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault()
            const delta = e.key === 'ArrowUp' ? 1 : -1
            const step = unit === '%' ? 1 : 0.1
            const next = Math.round((value + delta * step) * 10) / 10
            onChange(next, unit)
        }
    }

    return (
        <div className="flex items-center gap-1 flex-1 min-w-0">
            <LetterSpacingIcon />
            <input
                ref={inputRef}
                type="text"
                value={isFocused ? localValue : displayValue(value, unit)}
                onChange={(e) => setLocalValue(e.target.value)}
                onFocus={(e) => {
                    setIsFocused(true)
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
                )}
            />
        </div>
    )
}
