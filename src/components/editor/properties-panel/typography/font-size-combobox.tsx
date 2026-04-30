'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Preset sizes (matches Figma's list) ─────────────────────────────────────

const PRESET_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72, 96, 120]

// ── Props ────────────────────────────────────────────────────────────────────

interface FontSizeComboboxProps {
    value: number
    onChange: (size: number) => void
    /** Called on hover for live preview — null to revert */
    onPreview?: (size: number | null) => void
    className?: string
}

// ── Component ────────────────────────────────────────────────────────────────

export function FontSizeCombobox({ value, onChange, onPreview, className }: FontSizeComboboxProps) {
    const [localValue, setLocalValue] = useState(String(value))
    const [open, setOpen] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)
    const wrapperRef = useRef<HTMLDivElement>(null)
    const popoverRef = useRef<HTMLDivElement>(null)

    // Sync external value → local when not focused
    useEffect(() => {
        if (document.activeElement !== inputRef.current) {
            setLocalValue(String(value))
        }
    }, [value])

    const commit = useCallback((raw: string) => {
        const num = parseFloat(raw)
        if (isNaN(num) || num < 1) {
            setLocalValue(String(value))
            return
        }
        const clamped = Math.round(Math.max(1, Math.min(999, num)))
        setLocalValue(String(clamped))
        onChange(clamped)
    }, [value, onChange])

    // Capture value at open-time so hover preview doesn't re-scroll
    const openValueRef = useRef(value)
    useEffect(() => {
        if (open) openValueRef.current = value
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open])

    // Position popover — flip above anchor when not enough space below
    useEffect(() => {
        if (!open || !wrapperRef.current || !popoverRef.current) return
        const rect = wrapperRef.current.getBoundingClientRect()
        const popH = popoverRef.current.offsetHeight
        const spaceBelow = window.innerHeight - rect.bottom - 8
        const top = spaceBelow >= popH
            ? rect.bottom + 2
            : rect.top - popH - 2
        popoverRef.current.style.left = `${rect.left}px`
        popoverRef.current.style.top = `${Math.max(8, top)}px`
        popoverRef.current.style.minWidth = `${Math.max(rect.width, 80)}px`

        // Auto-scroll to center around value when dropdown opened
        const idx = PRESET_SIZES.findIndex((s) => s >= openValueRef.current)
        const clampedIdx = Math.max(0, idx === -1 ? PRESET_SIZES.length - 1 : idx)
        const itemH = 24 // h-6 = 24px
        const target = Math.max(0, clampedIdx * itemH - popoverRef.current.clientHeight / 2 + itemH / 2)
        popoverRef.current.scrollTop = target
    }, [open])

    // Close on outside click
    useEffect(() => {
        if (!open) return
        const handler = (e: MouseEvent) => {
            if (
                popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
                wrapperRef.current && !wrapperRef.current.contains(e.target as Node)
            ) {
                onPreview?.(null)
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [open, onPreview])

    // Close on Escape — revert preview
    useEffect(() => {
        if (!open) return
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onPreview?.(null)
                setOpen(false)
            }
        }
        document.addEventListener('keydown', handler)
        return () => document.removeEventListener('keydown', handler)
    }, [open, onPreview])

    // Scrub with arrow keys (±1, shift ±10)
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            commit(localValue)
            inputRef.current?.blur()
            return
        }
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault()
            const delta = e.key === 'ArrowUp' ? 1 : -1
            const step = e.shiftKey ? 10 : 1
            const next = Math.max(1, value + delta * step)
            onChange(next)
            setLocalValue(String(next))
        }
    }

    const dropdown = open ? createPortal(
        <div
            ref={popoverRef}
            className={cn(
                'fixed z-[9999] py-1 rounded-lg shadow-xl',
                'bg-popover border border-border/60',
                'max-h-48 overflow-y-auto scrollbar-none',
            )}
            style={{ left: 0, top: 0 }}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerLeave={() => onPreview?.(null)}
        >
            {PRESET_SIZES.map((size) => {
                const isSelected = size === value
                return (
                    <button
                        key={size}
                        className={cn(
                            'w-full h-6 px-3 flex items-center gap-2 text-[11px] text-left transition-colors',
                            'text-foreground/80 hover:bg-muted/50',
                            isSelected && 'text-foreground font-medium',
                        )}
                        onPointerEnter={() => onPreview?.(size)}
                        onClick={() => {
                            onPreview?.(null)
                            onChange(size)
                            setLocalValue(String(size))
                            setOpen(false)
                        }}
                    >
                        <span className="w-3 shrink-0">
                            {isSelected && <Check size={10} />}
                        </span>
                        <span>{size}</span>
                    </button>
                )
            })}
        </div>,
        document.body,
    ) : null

    return (
        <>
            <div ref={wrapperRef} className={cn('flex items-center', className)}>
                <input
                    ref={inputRef}
                    type="text"
                    inputMode="numeric"
                    value={localValue}
                    onChange={(e) => setLocalValue(e.target.value)}
                    onBlur={() => commit(localValue)}
                    onKeyDown={handleKeyDown}
                    onFocus={(e) => e.target.select()}
                    className={cn(
                        'w-full h-7 pl-2 pr-0 text-[11px] rounded-l-sm',
                        'bg-transparent border border-transparent border-r-0',
                        'hover:bg-muted/50',
                        'focus:bg-muted/60 focus:border-border focus:outline-none',
                        'transition-colors tabular-nums',
                    )}
                />
                <button
                    onClick={() => setOpen((v) => !v)}
                    className={cn(
                        'shrink-0 w-5 h-7 flex items-center justify-center rounded-r-sm',
                        'text-muted-foreground/50 hover:text-foreground',
                        'hover:bg-muted/50 transition-colors',
                        open && 'bg-muted/60 text-foreground',
                    )}
                    title="Font size presets"
                >
                    <ChevronDown size={9} />
                </button>
            </div>
            {dropdown}
        </>
    )
}
