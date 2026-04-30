'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getFontStyles } from '@/lib/fonts/google-fonts'

// ── Props ────────────────────────────────────────────────────────────────────────

interface FontStylePickerProps {
    /** Current font family (to query available styles) */
    fontFamily: string
    /** Currently selected style name */
    currentStyle: string
    /** Anchor element for positioning */
    anchorEl: HTMLElement | null
    /** Called when user selects a style */
    onSelect: (styleName: string) => void
    /** Called on hover to preview a style; null = revert */
    onPreview?: (styleName: string | null) => void
    /** Called to close the popover */
    onClose: () => void
}

// ── Component ────────────────────────────────────────────────────────────────────

export function FontStylePicker({
    fontFamily,
    currentStyle,
    anchorEl,
    onSelect,
    onPreview,
    onClose,
}: FontStylePickerProps) {
    const popoverRef = useRef<HTMLDivElement>(null)
    const [styles, setStyles] = useState<string[]>([])
    // Capture style at mount so hover preview doesn't re-scroll
    const initialStyleRef = useRef(currentStyle)

    // Query available styles for this font
    useEffect(() => {
        setStyles(getFontStyles(fontFamily))
    }, [fontFamily])

    // Position popover — flip above anchor when not enough space below
    useEffect(() => {
        if (!anchorEl || !popoverRef.current) return
        const rect = anchorEl.getBoundingClientRect()
        const popH = popoverRef.current.offsetHeight
        const spaceBelow = window.innerHeight - rect.bottom - 8
        const top = spaceBelow >= popH
            ? rect.bottom + 2
            : rect.top - popH - 2
        popoverRef.current.style.left = `${rect.left}px`
        popoverRef.current.style.top = `${Math.max(8, top)}px`
        popoverRef.current.style.minWidth = `${Math.max(rect.width, 160)}px`

        // Auto-scroll to selected style (uses initial value, not hover-preview value)
        const selectedIdx = styles.indexOf(initialStyleRef.current)
        if (selectedIdx > -1) {
            const itemH = 28 // h-7 = 28px
            const target = Math.max(0, selectedIdx * itemH - popoverRef.current.clientHeight / 2 + itemH / 2)
            popoverRef.current.scrollTop = target
        }
    }, [anchorEl, styles])

    // Close on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (
                popoverRef.current &&
                !popoverRef.current.contains(e.target as Node) &&
                anchorEl &&
                !anchorEl.contains(e.target as Node)
            ) {
                onClose()
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [onClose, anchorEl])

    // Close on Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', handler)
        return () => document.removeEventListener('keydown', handler)
    }, [onClose])

    const popover = (
        <div
            ref={popoverRef}
            className={cn(
                'fixed z-[9999] py-1 rounded-lg shadow-xl',
                'bg-popover border border-border/60',
                'max-h-52 overflow-y-auto scrollbar-none',
            )}
            style={{ left: 0, top: 0 }}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerLeave={() => onPreview?.(null)}
        >
            {styles.map((style) => {
                const isSelected = style === currentStyle
                return (
                    <button
                        key={style}
                        className={cn(
                            'w-full h-7 px-3 flex items-center gap-2 text-[11px] text-left transition-colors',
                            'text-foreground/80 hover:bg-muted/50',
                            isSelected && 'text-foreground font-medium',
                        )}
                        onPointerEnter={() => onPreview?.(style)}
                        onClick={() => {
                            onSelect(style)
                            onClose()
                        }}
                    >
                        <span className="w-3 shrink-0">
                            {isSelected && <Check size={10} />}
                        </span>
                        <span>{style}</span>
                    </button>
                )
            })}
            {styles.length === 0 && (
                <div className="px-3 py-2 text-[10px] text-muted-foreground/50">No styles available</div>
            )}
        </div>
    )

    return createPortal(popover, document.body)
}
