'use client'

import { useState, useRef, useCallback, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'
import { normaliseHex, parseColorInput } from '@/lib/color-utils'

interface InlineHexValueInputProps {
    value: string
    onCommit: (nextHex: string) => void
    className?: string
    disabled?: boolean
}

/**
 * Inline hex editor used in paint rows (fill/stroke/effects).
 * - Shows 6-digit uppercase hex without '#'
 * - Enter/blur commits, Escape cancels
 * - Accepts flexible input via parseColorInput (hex/rgb/hsl)
 */
export function InlineHexValueInput({ value, onCommit, className, disabled = false }: InlineHexValueInputProps) {
    const inputRef = useRef<HTMLInputElement>(null)
    const normalizedValue = normaliseHex(value).toUpperCase()
    const [localValue, setLocalValue] = useState(normalizedValue)
    const [isEditing, setIsEditing] = useState(false)

    const revert = useCallback(() => {
        setLocalValue(normalizedValue)
    }, [normalizedValue])

    const commit = useCallback(() => {
        const parsed = parseColorInput(localValue)
        if (!parsed) {
            revert()
            return
        }
        const next = normaliseHex(parsed)
        const prev = normaliseHex(normalizedValue)
        setLocalValue(next.toUpperCase())
        if (next !== prev) onCommit(next)
    }, [localValue, normalizedValue, onCommit, revert])

    const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            commit()
            inputRef.current?.blur()
            return
        }
        if (e.key === 'Escape') {
            revert()
            inputRef.current?.blur()
        }
    }, [commit, revert])

    return (
        <input
            ref={inputRef}
            type="text"
            value={isEditing ? localValue : normalizedValue}
            disabled={disabled}
            maxLength={14}
            className={cn(
                'h-6 px-1.5 text-[11px] font-mono uppercase text-foreground',
                'bg-transparent border border-transparent',
                'hover:bg-muted/40 focus:bg-muted/50 focus:outline-none',
                'transition-colors tabular-nums',
                disabled && 'opacity-40 cursor-not-allowed',
                className,
            )}
            onChange={(e) => setLocalValue(e.target.value.replace('#', '').toUpperCase())}
            onBlur={() => {
                commit()
                setIsEditing(false)
            }}
            onKeyDown={handleKeyDown}
            onFocus={(e) => {
                setIsEditing(true)
                setLocalValue(normalizedValue)
                e.target.select()
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            aria-label="Hex color"
        />
    )
}

interface InlinePercentInputProps {
    value: number
    onCommit: (nextValue: number) => void
    className?: string
    disabled?: boolean
}

/**
 * Inline percent editor for opacity-style fields.
 * value is in 0..1 domain; UI is 0..100.
 */
export function InlinePercentInput({ value, onCommit, className, disabled = false }: InlinePercentInputProps) {
    const inputRef = useRef<HTMLInputElement>(null)
    const normalizedValue = String(Math.round(value * 100))
    const [localValue, setLocalValue] = useState(normalizedValue)
    const [isEditing, setIsEditing] = useState(false)

    const revert = useCallback(() => {
        setLocalValue(normalizedValue)
    }, [normalizedValue])

    const commit = useCallback(() => {
        const parsed = parseInt(localValue, 10)
        if (isNaN(parsed)) {
            revert()
            return
        }
        const clamped = Math.max(0, Math.min(100, parsed))
        setLocalValue(String(clamped))
        const next = clamped / 100
        if (Math.abs(next - value) > 1e-6) onCommit(next)
    }, [localValue, onCommit, revert, value])

    const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            commit()
            inputRef.current?.blur()
            return
        }
        if (e.key === 'Escape') {
            revert()
            inputRef.current?.blur()
            return
        }
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault()
            const delta = (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1)
            const base = parseInt(localValue, 10)
            const start = isNaN(base) ? parseInt(normalizedValue, 10) : base
            const next = Math.max(0, Math.min(100, start + delta))
            setLocalValue(String(next))
            onCommit(next / 100)
        }
    }, [commit, localValue, normalizedValue, onCommit, revert])

    return (
        <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            value={isEditing ? localValue : normalizedValue}
            disabled={disabled}
            className={cn(
                'h-6 px-1 text-[11px] text-center font-mono text-foreground',
                'bg-transparent border border-transparent',
                'hover:bg-muted/40 focus:bg-muted/50 focus:outline-none',
                'transition-colors tabular-nums',
                disabled && 'opacity-40 cursor-not-allowed',
                className,
            )}
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={() => {
                commit()
                setIsEditing(false)
            }}
            onKeyDown={handleKeyDown}
            onFocus={(e) => {
                setIsEditing(true)
                setLocalValue(normalizedValue)
                e.target.select()
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            aria-label="Opacity"
        />
    )
}
