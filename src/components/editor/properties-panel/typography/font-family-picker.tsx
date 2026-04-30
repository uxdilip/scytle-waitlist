'use client'

import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type PointerEvent as ReactPointerEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { X, Check, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { searchFonts, loadFont, isFontLoaded, getRecentFonts, addRecentFont } from '@/lib/fonts/google-fonts'
import type { FontMeta } from '@/lib/fonts/font-manifest'

// ── Constants ────────────────────────────────────────────────────────────────

const PICKER_W = 252
const PICKER_H = 420
const ITEM_H = 32
const VISIBLE_BUFFER = 8 // extra items to render above/below viewport

// ── Props ────────────────────────────────────────────────────────────────────

interface FontFamilyPickerProps {
    /** Currently selected font family */
    currentFamily: string
    /** Anchor element used for positioning */
    anchorEl: HTMLElement | null
    /** Called when user commits a font (click, enter) */
    onSelect: (family: string) => void
    /** Called when user hovers a font for live preview — null to revert */
    onPreview?: (family: string | null) => void
    /** Called to close the picker */
    onClose: () => void
}

// ── Component ────────────────────────────────────────────────────────────────

export function FontFamilyPicker({ currentFamily, anchorEl, onSelect, onPreview, onClose }: FontFamilyPickerProps) {
    const pickerRef = useRef<HTMLDivElement>(null)
    const listRef = useRef<HTMLDivElement>(null)
    const searchRef = useRef<HTMLInputElement>(null)
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<FontMeta[]>(() => searchFonts('', 200))
    const [highlightIdx, setHighlightIdx] = useState(-1)

    // Track original font for checkmark + escape revert
    const initialFamilyRef = useRef(currentFamily)

    // Virtualization state
    const [scrollTop, setScrollTop] = useState(0)

    // ── Drag-to-reposition (same pattern as ColorPicker) ──
    const posRef = useRef({ left: 0, top: 0 })
    const dragOffsetRef = useRef({ x: 0, y: 0 })
    const isDraggingHeader = useRef(false)
    const dragStart = useRef({ pointerX: 0, pointerY: 0, offsetX: 0, offsetY: 0 })

    // ── Position picker — always run on mount (empty deps) ──
    // Using [] instead of [anchorEl] so it re-runs every time the component
    // mounts (second+ open), even when anchorEl is the same DOM reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useLayoutEffect(() => {
        if (!anchorEl || !pickerRef.current) return
        const anchorRect = anchorEl.getBoundingClientRect()
        let baseLeft = anchorRect.left - PICKER_W - 8
        let baseTop = anchorRect.top
        if (baseLeft < 8) baseLeft = anchorRect.right + 8
        if (baseTop + PICKER_H > window.innerHeight - 8) baseTop = window.innerHeight - PICKER_H - 8
        if (baseTop < 8) baseTop = 8
        posRef.current = { left: baseLeft, top: baseTop }
        dragOffsetRef.current = { x: 0, y: 0 }
        pickerRef.current.style.left = `${baseLeft}px`
        pickerRef.current.style.top = `${baseTop}px`
    }, []) // eslint-disable-line

    // Focus search on mount
    useEffect(() => {
        requestAnimationFrame(() => searchRef.current?.focus())
    }, [])

    // ── Search ──
    useEffect(() => {
        const res = searchFonts(query, 200)
        setResults(res)
        setHighlightIdx(-1)
        // Reset scroll when query changes
        if (listRef.current) listRef.current.scrollTop = 0
        setScrollTop(0)
    }, [query])

    // ── Eager font loading for visible items ──
    const totalHeight = results.length * ITEM_H
    const visibleStart = Math.max(0, Math.floor(scrollTop / ITEM_H) - VISIBLE_BUFFER)
    const visibleEnd = Math.min(results.length, Math.ceil((scrollTop + 320) / ITEM_H) + VISIBLE_BUFFER)
    const visibleItems = results.slice(visibleStart, visibleEnd)

    // Load fonts that are about to be visible
    useEffect(() => {
        for (const font of visibleItems) {
            if (!isFontLoaded(font.family)) {
                loadFont(font.family)
            }
        }
    }, [visibleItems])

    // ── Commit handler ──
    const commit = useCallback(
        (family: string) => {
            addRecentFont(family)
            onSelect(family)
            onClose()
        },
        [onSelect, onClose],
    )

    // ── Keyboard navigation ──
    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault()
                const next = Math.min(highlightIdx + 1, results.length - 1)
                setHighlightIdx(next)
                scrollToIdx(next)
                if (results[next]) {
                    loadFont(results[next].family)
                    onPreview?.(results[next].family)
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                const next = Math.max(highlightIdx - 1, 0)
                setHighlightIdx(next)
                scrollToIdx(next)
                if (results[next]) {
                    loadFont(results[next].family)
                    onPreview?.(results[next].family)
                }
            } else if (e.key === 'Enter') {
                e.preventDefault()
                if (highlightIdx >= 0 && highlightIdx < results.length) {
                    commit(results[highlightIdx].family)
                } else if (results.length > 0) {
                    commit(results[0].family)
                }
            } else if (e.key === 'Escape') {
                e.preventDefault()
                onClose()
            }
        },
        [results, highlightIdx, commit, onPreview, onClose],
    )

    const scrollToIdx = (idx: number) => {
        if (!listRef.current) return
        const itemTop = idx * ITEM_H
        const itemBottom = itemTop + ITEM_H
        const viewTop = listRef.current.scrollTop
        const viewBottom = viewTop + listRef.current.clientHeight
        if (itemTop < viewTop) {
            listRef.current.scrollTop = itemTop
        } else if (itemBottom > viewBottom) {
            listRef.current.scrollTop = itemBottom - listRef.current.clientHeight
        }
    }

    // ── Close on outside click ──
    useEffect(() => {
        const handleMouseDown = (e: MouseEvent) => {
            if (
                pickerRef.current &&
                !pickerRef.current.contains(e.target as Node) &&
                anchorEl &&
                !anchorEl.contains(e.target as Node)
            ) {
                onClose()
            }
        }
        document.addEventListener('mousedown', handleMouseDown)
        return () => document.removeEventListener('mousedown', handleMouseDown)
    }, [onClose, anchorEl])

    // ── Close on Escape (global) ──
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', handleKey)
        return () => document.removeEventListener('keydown', handleKey)
    }, [onClose])

    // ── Scroll handler for virtualization ──
    const handleScroll = useCallback(() => {
        if (listRef.current) setScrollTop(listRef.current.scrollTop)
    }, [])

    // ── Drag handlers (identical to ColorPicker) ──
    const handleHeaderPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
        if ((e.target as HTMLElement).closest('button')) return
        e.preventDefault()
        e.stopPropagation()
        isDraggingHeader.current = true
        dragStart.current = {
            pointerX: e.clientX,
            pointerY: e.clientY,
            offsetX: dragOffsetRef.current.x,
            offsetY: dragOffsetRef.current.y,
        }
            ; (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
    }

    const handleHeaderPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
        if (!isDraggingHeader.current) return
        if (e.buttons === 0) {
            isDraggingHeader.current = false
            return
        }
        const newX = dragStart.current.offsetX + (e.clientX - dragStart.current.pointerX)
        const newY = dragStart.current.offsetY + (e.clientY - dragStart.current.pointerY)
        dragOffsetRef.current = { x: newX, y: newY }
        if (pickerRef.current) {
            pickerRef.current.style.left = `${posRef.current.left + newX}px`
            pickerRef.current.style.top = `${posRef.current.top + newY}px`
        }
    }

    const handleHeaderPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
        if (!isDraggingHeader.current) return
        isDraggingHeader.current = false
        const el = e.currentTarget as HTMLDivElement
        if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
    }

    // ── Recent fonts ──
    const recentFonts = getRecentFonts()

    const picker = (
        <div
            ref={pickerRef}
            className={cn(
                'fixed z-[9999] rounded-lg shadow-2xl',
                'bg-popover border border-border/60',
                'flex flex-col overflow-hidden',
            )}
            style={{ left: 0, top: 0, width: PICKER_W, maxHeight: PICKER_H }}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerMove={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onKeyDown={handleKeyDown}
        >
            {/* Header — draggable */}
            <div
                className="flex items-center gap-1.5 px-2.5 pt-2.5 pb-1.5 cursor-move select-none"
                onPointerDown={handleHeaderPointerDown}
                onPointerMove={handleHeaderPointerMove}
                onPointerUp={handleHeaderPointerUp}
            >
                <span className="text-[11px] font-medium text-muted-foreground flex-1">Fonts</span>
                <button
                    className="w-6 h-6 flex items-center justify-center rounded-sm
                        text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-colors"
                    onClick={onClose}
                >
                    <X size={12} />
                </button>
            </div>

            {/* Search */}
            <div className="px-2.5 pb-1.5">
                <div className="relative">
                    <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
                    <input
                        ref={searchRef}
                        type="text"
                        value={query}
                        placeholder="Search fonts…"
                        className={cn(
                            'w-full h-7 pl-7 pr-2 text-[11px] rounded-sm',
                            'bg-muted/50 border border-transparent',
                            'focus:bg-muted/60 focus:border-border focus:outline-none',
                            'transition-colors placeholder:text-muted-foreground/40',
                        )}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                </div>
            </div>

            {/* Recent fonts (only when no query) */}
            {!query && recentFonts.length > 0 && (
                <div className="px-2.5 pb-1">
                    <div className="text-[9px] text-muted-foreground/50 uppercase tracking-wider mb-1">Recent</div>
                    <div className="flex flex-col">
                        {recentFonts.slice(0, 4).map((family) => (
                            <button
                                key={family}
                                className={cn(
                                    'h-7 px-2 flex items-center gap-2 rounded-sm text-[11px] text-left transition-colors',
                                    'hover:bg-muted/60',
                                    family === initialFamilyRef.current && 'text-primary',
                                )}
                                style={{ fontFamily: `"${family}", sans-serif` }}
                                onClick={() => commit(family)}
                                onPointerEnter={() => {
                                    loadFont(family)
                                    onPreview?.(family)
                                }}
                                onPointerLeave={() => onPreview?.(null)}
                            >
                                {family === initialFamilyRef.current && <Check size={10} className="shrink-0" />}
                                <span className={family !== initialFamilyRef.current ? 'pl-[18px]' : ''}>{family}</span>
                            </button>
                        ))}
                    </div>
                    <div className="h-px bg-border/30 mt-1" />
                </div>
            )}

            {/* Font list — virtualized */}
            <div
                ref={listRef}
                className="flex-1 overflow-y-auto min-h-0"
                onScroll={handleScroll}
                onPointerLeave={() => onPreview?.(null)}
            >
                <div style={{ height: totalHeight, position: 'relative' }}>
                    {visibleItems.map((font, i) => {
                        const actualIdx = visibleStart + i
                        const isSelected = font.family === initialFamilyRef.current
                        const isHighlighted = actualIdx === highlightIdx
                        return (
                            <button
                                key={font.family}
                                className={cn(
                                    'absolute left-0 right-0 h-8 px-2.5 flex items-center gap-2 text-[11px] text-left transition-colors',
                                    isHighlighted && 'bg-muted/60',
                                    !isHighlighted && 'hover:bg-muted/40',
                                    isSelected && 'text-primary font-medium',
                                )}
                                style={{
                                    top: actualIdx * ITEM_H,
                                    fontFamily: `"${font.family}", ${font.category}`,
                                }}
                                onClick={() => commit(font.family)}
                                onPointerEnter={() => {
                                    loadFont(font.family)
                                    setHighlightIdx(actualIdx)
                                    onPreview?.(font.family)
                                }}
                            >
                                <span className="w-3 shrink-0">
                                    {isSelected && <Check size={10} />}
                                </span>
                                <span className="truncate">{font.family}</span>
                                <span className="ml-auto text-[9px] text-muted-foreground/40 shrink-0">
                                    {font.category === 'sans-serif'
                                        ? 'Sans'
                                        : font.category === 'serif'
                                            ? 'Serif'
                                            : font.category === 'monospace'
                                                ? 'Mono'
                                                : font.category === 'display'
                                                    ? 'Display'
                                                    : 'Hand'}
                                </span>
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Footer — font count */}
            <div className="px-2.5 py-1.5 border-t border-border/30 text-[9px] text-muted-foreground/40">
                {results.length} font{results.length !== 1 ? 's' : ''}
            </div>
        </div>
    )

    return createPortal(picker, document.body)
}
