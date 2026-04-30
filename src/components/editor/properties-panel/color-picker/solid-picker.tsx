'use client'

import { useRef, useCallback } from 'react'
import { GradientField } from './gradient-field'
import { HueSlider } from './hue-slider'
import { OpacitySlider } from './opacity-slider'
import { ColorInput } from './color-input'
import { normaliseHex, hexToHsb, hsbToHex, type ColorFormat } from '@/lib/color-utils'

interface SolidPickerProps {
    /** 6-digit hex without '#' */
    hex: string
    /** 0-1 */
    opacity: number
    onHexChange: (hex: string) => void
    onOpacityChange: (opacity: number) => void
    /** Persisted across picker sessions via parent */
    colorFormat: ColorFormat
    onColorFormatChange: (fmt: ColorFormat) => void
}

/**
 * Full solid color picker body — matches Figma's Custom solid tab:
 * gradient field + hue slider + opacity slider + color input row.
 */
export function SolidPicker({
    hex,
    opacity,
    onHexChange,
    onOpacityChange,
    colorFormat,
    onColorFormatChange,
}: SolidPickerProps) {
    const normHex = normaliseHex(hex)
    const hsb = hexToHsb(normHex)

    // Preserve hue across hex roundtrips (hex→HSB loses hue when S=0 or B=0).
    // We store our "canonical" hue in a ref and only update it from the derived
    // value when the derived saturation is >0 (i.e., hue is meaningful).
    const hueRef = useRef(hsb.h)
    if (hsb.s > 0 && hsb.b > 0) {
        hueRef.current = hsb.h
    }
    const stableHue = hsb.s > 0 && hsb.b > 0 ? hsb.h : hueRef.current

    // Use refs for latest values so callbacks never go stale
    const latestRef = useRef({ h: stableHue, s: hsb.s, b: hsb.b, onHexChange })
    latestRef.current = { h: stableHue, s: hsb.s, b: hsb.b, onHexChange }

    // RAF-throttled field change — prevents re-render storms during drag
    const fieldRafId = useRef<number | null>(null)
    const pendingField = useRef<{ s: number; b: number } | null>(null)

    const handleFieldChange = useCallback((s: number, b: number) => {
        pendingField.current = { s, b }
        if (fieldRafId.current !== null) return
        fieldRafId.current = requestAnimationFrame(() => {
            fieldRafId.current = null
            const pf = pendingField.current
            if (!pf) return
            const { h, onHexChange: cb } = latestRef.current
            cb(hsbToHex(h, pf.s, pf.b))
        })
    }, [])

    const handleHueChange = useCallback((h: number) => {
        hueRef.current = h
        const { s, b, onHexChange: cb } = latestRef.current
        cb(hsbToHex(h, s, b))
    }, [])

    return (
        <div className="flex flex-col gap-2.5">
            {/* 2D gradient field */}
            <GradientField
                hue={stableHue}
                saturation={hsb.s}
                brightness={hsb.b}
                onChange={handleFieldChange}
                className="h-[168px] w-full"
            />

            {/* Sliders row: eyedropper | hue + opacity */}
            <div className="flex items-center gap-2">
                {/* Eyedropper button */}
                <button
                    className="shrink-0 w-7 h-7 flex items-center justify-center rounded-sm
                        text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                    title="Sample color (I)"
                    onClick={async () => {
                        // Browser EyeDropper API (Chrome 95+)
                        if (!('EyeDropper' in window)) return
                        try {
                            // @ts-expect-error EyeDropper not in TS types
                            const eyeDropper = new window.EyeDropper()
                            const result = await eyeDropper.open()
                            const parsed = result.sRGBHex?.replace('#', '')
                            if (parsed) onHexChange(normaliseHex(parsed))
                        } catch {
                            // User cancelled or unsupported
                        }
                    }}
                >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M11.5 2.5L8.5 5.5M3 9L1 13L5 11L11 5L9 3L3 9Z"
                            stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </button>

                {/* Hue + Opacity sliders stacked */}
                <div className="flex-1 flex flex-col gap-2">
                    <HueSlider value={stableHue} onChange={handleHueChange} />
                    <OpacitySlider value={opacity} hex={normHex} onChange={onOpacityChange} />
                </div>
            </div>

            {/* Color input row */}
            <ColorInput
                hex={normHex}
                opacity={opacity}
                onHexChange={onHexChange}
                onOpacityChange={onOpacityChange}
                format={colorFormat}
                onFormatChange={onColorFormatChange}
            />
        </div>
    )
}
