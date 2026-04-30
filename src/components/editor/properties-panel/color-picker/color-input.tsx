'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
    normaliseHex, parseColorInput, hexToRgb, rgbToHex,
    hexToHsl, hslToHex, hexToHsb, hsbToHex, type ColorFormat,
} from '@/lib/color-utils'

interface ColorInputProps {
    /** 6-digit hex without '#' */
    hex: string
    /** 0-1 */
    opacity: number
    onHexChange: (hex: string) => void
    onOpacityChange: (opacity: number) => void
    format: ColorFormat
    onFormatChange: (fmt: ColorFormat) => void
}

const FORMATS: ColorFormat[] = ['HEX', 'RGB', 'HSL', 'HSB']

/** Small single numeric field with label */
function NumField({
    label, value, min = 0, max = 255, onChange,
}: {
    label: string; value: number; min?: number; max?: number
    onChange: (v: number) => void
}) {
    const [local, setLocal] = useState(String(value))
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (document.activeElement !== inputRef.current) setLocal(String(value))
    }, [value])

    const commit = useCallback(() => {
        const n = parseInt(local, 10)
        if (!isNaN(n)) onChange(Math.max(min, Math.min(max, n)))
        else setLocal(String(value))
    }, [local, value, min, max, onChange])

    return (
        <div className="flex flex-col items-center gap-0.5 flex-1 min-w-0">
            <input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                value={local}
                className={cn(
                    'w-full h-6 px-1 text-[11px] text-center rounded-sm font-mono text-foreground',
                    'bg-transparent border border-transparent',
                    'hover:bg-muted/50 focus:bg-muted/60 focus:border-border focus:outline-none',
                    'transition-colors tabular-nums'
                )}
                onChange={(e) => setLocal(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') { commit(); inputRef.current?.blur() }
                    if (e.key === 'Escape') { setLocal(String(value)); inputRef.current?.blur() }
                    if (e.key === 'ArrowUp') {
                        e.preventDefault()
                        const v = Math.min(max, (parseInt(local, 10) || 0) + (e.shiftKey ? 10 : 1))
                        setLocal(String(v)); onChange(v)
                    }
                    if (e.key === 'ArrowDown') {
                        e.preventDefault()
                        const v = Math.max(min, (parseInt(local, 10) || 0) - (e.shiftKey ? 10 : 1))
                        setLocal(String(v)); onChange(v)
                    }
                }}
                onFocus={(e) => e.target.select()}
            />
            <span className="text-[9px] text-muted-foreground/50 leading-none">{label}</span>
        </div>
    )
}

/**
 * Format-aware color input row — Figma-style.
 * Hex format shows a single hex field + opacity %.
 * RGB/HSL/HSB show per-channel fields.
 */
export function ColorInput({
    hex,
    opacity,
    onHexChange,
    onOpacityChange,
    format,
    onFormatChange,
}: ColorInputProps) {
    const [localHex, setLocalHex] = useState(hex.toUpperCase())
    const hexInputRef = useRef<HTMLInputElement>(null)
    const [opacityLocal, setOpacityLocal] = useState(String(Math.round(opacity * 100)))
    const opacityRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (document.activeElement !== hexInputRef.current) setLocalHex(hex.toUpperCase())
    }, [hex])

    useEffect(() => {
        if (document.activeElement !== opacityRef.current)
            setOpacityLocal(String(Math.round(opacity * 100)))
    }, [opacity])

    const commitHex = useCallback(() => {
        const parsed = parseColorInput(localHex)
        if (parsed) onHexChange(parsed)
        else setLocalHex(hex.toUpperCase())
    }, [localHex, hex, onHexChange])

    const commitOpacity = useCallback(() => {
        const n = parseInt(opacityLocal, 10)
        if (!isNaN(n)) onOpacityChange(Math.max(0, Math.min(100, n)) / 100)
        else setOpacityLocal(String(Math.round(opacity * 100)))
    }, [opacityLocal, opacity, onOpacityChange])

    // ── RGB values ────────────────────────────────────────────
    const { r, g, b } = hexToRgb(hex)
    // ── HSL values ────────────────────────────────────────────
    const hsl = hexToHsl(hex)
    // ── HSB values ────────────────────────────────────────────
    const hsb = hexToHsb(hex)

    return (
        <div className="flex items-end gap-1">
            {/* Format selector */}
            <div className="relative shrink-0">
                <select
                    value={format}
                    className={cn(
                        'h-6 pl-1.5 pr-4 text-[10px] rounded-sm appearance-none cursor-pointer',
                        'bg-muted/40 border border-transparent',
                        'hover:bg-muted/70 focus:outline-none focus:bg-muted/70',
                        'text-muted-foreground transition-colors'
                    )}
                    onChange={(e) => onFormatChange(e.target.value as ColorFormat)}
                >
                    {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
                <ChevronDown size={9} className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground/50" />
            </div>

            {/* Format-specific inputs */}
            {format === 'HEX' && (
                <>
                    <input
                        ref={hexInputRef}
                        type="text"
                        value={localHex}
                        maxLength={8}
                        className={cn(
                            'flex-1 h-6 px-2 text-[11px] font-mono rounded-sm text-foreground',
                            'bg-transparent border border-transparent',
                            'hover:bg-muted/50 focus:bg-muted/60 focus:border-border focus:outline-none',
                            'transition-colors tabular-nums uppercase min-w-0'
                        )}
                        onChange={(e) => setLocalHex(e.target.value.replace('#', '').toUpperCase())}
                        onBlur={commitHex}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') { commitHex(); hexInputRef.current?.blur() }
                            if (e.key === 'Escape') { setLocalHex(hex.toUpperCase()); hexInputRef.current?.blur() }
                        }}
                        onFocus={(e) => e.target.select()}
                    />
                    {/* Opacity % — inline, Figma-style */}
                    <div className="flex items-center shrink-0">
                        <input
                            ref={opacityRef}
                            type="text"
                            inputMode="numeric"
                            value={opacityLocal}
                            className={cn(
                                'w-9 h-6 px-1 text-[11px] text-center font-mono rounded-sm text-foreground',
                                'bg-transparent border border-transparent',
                                'hover:bg-muted/50 focus:bg-muted/60 focus:border-border focus:outline-none',
                                'transition-colors tabular-nums'
                            )}
                            onChange={(e) => setOpacityLocal(e.target.value)}
                            onBlur={commitOpacity}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') { commitOpacity(); opacityRef.current?.blur() }
                                if (e.key === 'Escape') {
                                    setOpacityLocal(String(Math.round(opacity * 100)))
                                    opacityRef.current?.blur()
                                }
                            }}
                            onFocus={(e) => e.target.select()}
                        />
                        <span className="text-[10px] text-muted-foreground/50 pl-0.5">%</span>
                    </div>
                </>
            )}

            {format === 'RGB' && (
                <>
                    <NumField label="R" value={r} onChange={(v) => onHexChange(rgbToHex(v, g, b))} />
                    <NumField label="G" value={g} onChange={(v) => onHexChange(rgbToHex(r, v, b))} />
                    <NumField label="B" value={b} onChange={(v) => onHexChange(rgbToHex(r, g, v))} />
                    <NumField label="A" value={Math.round(opacity * 100)} min={0} max={100}
                        onChange={(v) => onOpacityChange(v / 100)} />
                </>
            )}

            {format === 'HSL' && (
                <>
                    <NumField label="H" value={hsl.h} min={0} max={360}
                        onChange={(v) => onHexChange(hslToHex(v, hsl.s, hsl.l))} />
                    <NumField label="S" value={hsl.s} min={0} max={100}
                        onChange={(v) => onHexChange(hslToHex(hsl.h, v, hsl.l))} />
                    <NumField label="L" value={hsl.l} min={0} max={100}
                        onChange={(v) => onHexChange(hslToHex(hsl.h, hsl.s, v))} />
                    <NumField label="A" value={Math.round(opacity * 100)} min={0} max={100}
                        onChange={(v) => onOpacityChange(v / 100)} />
                </>
            )}

            {format === 'HSB' && (
                <>
                    <NumField label="H" value={hsb.h} min={0} max={360}
                        onChange={(v) => onHexChange(hsbToHex(v, hsb.s, hsb.b))} />
                    <NumField label="S" value={hsb.s} min={0} max={100}
                        onChange={(v) => onHexChange(hsbToHex(hsb.h, v, hsb.b))} />
                    <NumField label="B" value={hsb.b} min={0} max={100}
                        onChange={(v) => onHexChange(hsbToHex(hsb.h, hsb.s, v))} />
                    <NumField label="A" value={Math.round(opacity * 100)} min={0} max={100}
                        onChange={(v) => onOpacityChange(v / 100)} />
                </>
            )}
        </div>
    )
}
