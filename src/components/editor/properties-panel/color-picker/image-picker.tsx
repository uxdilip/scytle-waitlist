'use client'

import { useCallback, useRef, useState } from 'react'
import { Upload, Link2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ImageFill } from '@/types/canvas'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface ImagePickerProps {
    fill: ImageFill
    onChange: (fill: ImageFill) => void
}

// ─────────────────────────────────────────────────────────────
// Scale mode config
// ─────────────────────────────────────────────────────────────

const FIT_OPTIONS: { id: ImageFill['fit']; label: string }[] = [
    { id: 'cover', label: 'Fill' },
    { id: 'contain', label: 'Fit' },
    { id: 'crop', label: 'Crop' },
    { id: 'tile', label: 'Tile' },
    { id: 'fill', label: 'Stretch' },
]

// ─────────────────────────────────────────────────────────────
// Adjustment slider config
// ─────────────────────────────────────────────────────────────

type AdjustmentKey = 'exposure' | 'contrast' | 'saturation' | 'temperature' | 'tint' | 'highlights' | 'shadows'

const ADJUSTMENTS: { key: AdjustmentKey; label: string }[] = [
    { key: 'exposure', label: 'Exposure' },
    { key: 'contrast', label: 'Contrast' },
    { key: 'saturation', label: 'Saturation' },
    { key: 'temperature', label: 'Temperature' },
    { key: 'tint', label: 'Tint' },
    { key: 'highlights', label: 'Highlights' },
    { key: 'shadows', label: 'Shadows' },
]

// ─────────────────────────────────────────────────────────────
// AdjustmentSlider — single labeled slider row
// ─────────────────────────────────────────────────────────────

function AdjustmentSlider({
    label,
    value,
    onChange,
}: {
    label: string
    value: number
    onChange: (v: number) => void
}) {
    return (
        <div className="flex items-center gap-2 h-6">
            <span className="w-20 text-[10px] text-muted-foreground/70 shrink-0">{label}</span>
            <div className="flex-1 relative flex items-center h-3">
                {/* Track */}
                <div className="absolute inset-0 rounded-full bg-muted/80" />
                {/* Center marker */}
                <div className="absolute left-1/2 top-1/2 -translate-y-1/2 w-px h-2 bg-border/60" />
                <input
                    type="range"
                    min={-100}
                    max={100}
                    step={1}
                    value={value}
                    onChange={(e) => onChange(Number(e.target.value))}
                    className="relative w-full h-3 appearance-none bg-transparent cursor-pointer
                        [&::-webkit-slider-thumb]:appearance-none
                        [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                        [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white
                        [&::-webkit-slider-thumb]:shadow-[0_0_0_1.5px_rgba(0,0,0,0.25)]
                        [&::-webkit-slider-thumb]:cursor-grab
                        [&::-webkit-slider-thumb:active]:cursor-grabbing"
                />
            </div>
            {/* Numeric input */}
            <input
                type="number"
                value={value}
                min={-100}
                max={100}
                onChange={(e) => {
                    const n = parseInt(e.target.value)
                    if (!isNaN(n)) onChange(Math.max(-100, Math.min(100, n)))
                }}
                onKeyDown={(e) => {
                    if (e.key === 'ArrowUp') { e.preventDefault(); onChange(Math.min(100, value + (e.shiftKey ? 10 : 1))) }
                    if (e.key === 'ArrowDown') { e.preventDefault(); onChange(Math.max(-100, value - (e.shiftKey ? 10 : 1))) }
                }}
                onFocus={(e) => e.target.select()}
                className={cn(
                    'w-10 h-5 px-1 text-[10px] text-center font-mono rounded-sm',
                    'bg-muted/60 border border-transparent',
                    'hover:border-border/50 focus:border-border focus:outline-none',
                    'transition-colors tabular-nums',
                    '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none',
                )}
            />
        </div>
    )
}

// ─────────────────────────────────────────────────────────────
// ImagePicker
// ─────────────────────────────────────────────────────────────

// Helper to detect if src is a URL (not data URI)
function isUrl(src: string | undefined): boolean {
    if (!src) return false
    return src.startsWith('http://') || src.startsWith('https://')
}

// Helper to detect if src is a data URI
function isDataUri(src: string | undefined): boolean {
    if (!src) return false
    return src.startsWith('data:')
}

export function ImagePicker({ fill, onChange }: ImagePickerProps) {
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [urlInput, setUrlInput] = useState('')
    const [urlError, setUrlError] = useState<string | null>(null)

    // Sync URL input when fill.src changes to a URL
    const displayUrl = isUrl(fill.src) ? fill.src : ''

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = (ev) => {
            const src = ev.target?.result as string
            if (src) {
                onChange({ ...fill, src })
                setUrlInput('')
                setUrlError(null)
            }
        }
        reader.readAsDataURL(file)
        // Reset so same file can be re-picked
        e.target.value = ''
    }, [fill, onChange])

    const handleUrlSubmit = useCallback(() => {
        const trimmed = urlInput.trim()
        if (!trimmed) return

        // Basic URL validation
        if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
            setUrlError('URL must start with http:// or https://')
            return
        }

        // Apply the URL
        onChange({ ...fill, src: trimmed })
        setUrlError(null)
    }, [urlInput, fill, onChange])

    const handleUrlKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            handleUrlSubmit()
        }
        if (e.key === 'Escape') {
            setUrlInput(displayUrl)
            setUrlError(null)
        }
    }, [handleUrlSubmit, displayUrl])

    const handleClearUrl = useCallback(() => {
        onChange({ ...fill, src: '' })
        setUrlInput('')
        setUrlError(null)
    }, [fill, onChange])

    const handleAdjust = useCallback((key: AdjustmentKey, value: number) => {
        onChange({ ...fill, [key]: value })
    }, [fill, onChange])

    const hasAdjustments = ADJUSTMENTS.some(({ key }) => (fill[key] ?? 0) !== 0)

    return (
        <div className="flex flex-col gap-2.5">
            {/* ── Image thumbnail + upload ── */}
            <div className="flex flex-col gap-1.5">
                {/* Large thumbnail */}
                <div
                    className={cn(
                        'w-full h-24 rounded-md border border-border/40 overflow-hidden relative',
                        !fill.src && 'bg-muted/40 flex items-center justify-center',
                    )}
                >
                    {fill.src ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={fill.src} alt="" className="w-full h-full object-cover" />
                    ) : (
                        <div className="flex flex-col items-center gap-1.5">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-muted-foreground/25">
                                <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.4" />
                                <path d="M3 16L8.5 10.5L12.5 14.5L16 11L21 16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                                <circle cx="15.5" cy="8.5" r="2" stroke="currentColor" strokeWidth="1.4" />
                            </svg>
                            <span className="text-[10px] text-muted-foreground/35">No image</span>
                        </div>
                    )}
                </div>

                {/* Upload button */}
                <button
                    className={cn(
                        'w-full h-7 flex items-center justify-center gap-1.5 rounded-sm text-[11px]',
                        'bg-muted/50 border border-border/30',
                        'hover:bg-muted hover:border-border/60 transition-colors',
                        'text-muted-foreground hover:text-foreground',
                    )}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <Upload size={11} />
                    {fill.src ? 'Replace image' : 'Upload from computer'}
                </button>

                {/* Hidden file input */}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileSelect}
                />

                {/* Or divider */}
                <div className="flex items-center gap-2 my-0.5">
                    <div className="flex-1 h-px bg-border/30" />
                    <span className="text-[10px] text-muted-foreground/40">or</span>
                    <div className="flex-1 h-px bg-border/30" />
                </div>

                {/* URL input */}
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1">
                        <div className="relative flex-1">
                            <Link2
                                size={12}
                                className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground/50"
                            />
                            <input
                                type="text"
                                placeholder="Paste image URL..."
                                value={urlInput || displayUrl}
                                onChange={(e) => {
                                    setUrlInput(e.target.value)
                                    setUrlError(null)
                                }}
                                onKeyDown={handleUrlKeyDown}
                                onBlur={() => {
                                    // Auto-submit on blur if changed
                                    if (urlInput && urlInput !== displayUrl) {
                                        handleUrlSubmit()
                                    }
                                }}
                                className={cn(
                                    'w-full h-7 pl-7 pr-7 text-[11px] rounded-sm',
                                    'bg-muted/50 border',
                                    urlError
                                        ? 'border-destructive/50 focus:border-destructive'
                                        : 'border-border/30 focus:border-border/60',
                                    'placeholder:text-muted-foreground/40',
                                    'focus:outline-none transition-colors',
                                )}
                            />
                            {(urlInput || displayUrl) && (
                                <button
                                    onClick={handleClearUrl}
                                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded-sm
                                        text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted
                                        transition-colors"
                                >
                                    <X size={12} />
                                </button>
                            )}
                        </div>
                    </div>
                    {urlError && (
                        <p className="text-[10px] text-destructive/80">{urlError}</p>
                    )}
                    {isDataUri(fill.src) && (
                        <p className="text-[10px] text-muted-foreground/50">
                            Current image is uploaded locally
                        </p>
                    )}
                </div>
            </div>

            {/* ── Scale mode buttons — 5 modes ── */}
            <div className="grid grid-cols-5 gap-1">
                {FIT_OPTIONS.map((opt) => (
                    <button
                        key={opt.id}
                        onClick={() => onChange({ ...fill, fit: opt.id })}
                        className={cn(
                            'h-6 rounded-sm text-[10px] transition-colors',
                            fill.fit === opt.id
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground',
                        )}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>

            {/* ── Crop hint ── */}
            {fill.fit === 'crop' && (
                <p className="text-[10px] text-muted-foreground/50 text-center leading-4">
                    Drag the image on the canvas to reposition
                </p>
            )}

            {/* ── Adjustments ── */}
            <div className="flex flex-col gap-0.5">
                <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[10px] text-muted-foreground/60 font-medium">Adjustments</span>
                    {hasAdjustments && (
                        <button
                            className="text-[10px] text-primary/70 hover:text-primary transition-colors"
                            onClick={() => {
                                const reset = { ...fill }
                                for (const { key } of ADJUSTMENTS) reset[key] = 0
                                onChange(reset)
                            }}
                        >
                            Reset
                        </button>
                    )}
                </div>
                {ADJUSTMENTS.map(({ key, label }) => (
                    <AdjustmentSlider
                        key={key}
                        label={label}
                        value={fill[key] ?? 0}
                        onChange={(v) => handleAdjust(key, v)}
                    />
                ))}
            </div>
        </div>
    )
}
