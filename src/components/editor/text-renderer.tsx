import { memo, type CSSProperties, createElement, useEffect, useCallback, useState } from 'react'
import type { TextNode } from '@/types/canvas'
import { useEditorStore } from '@/store/editor-store'
import { computeBaseStyles } from './render-utils'
import { loadFont, isFontLoaded } from '@/lib/fonts/google-fonts'
import { getTextPaintStyle, getTextPreviewColor } from '@/lib/text-paint'
import type { RevealState } from '@/store/generation-store'

// ============================================================
// Props
// ============================================================

interface TextRendererProps {
    node: TextNode
    isTopLevel?: boolean
    parentDirection?: 'row' | 'column'
    parentLayoutMode?: 'flex' | 'grid' | 'none'
    /** Explicit z-index override (reverse canvas stacking) */
    zIndex?: number
    /** AI generation reveal state — applied as data-gen-state attribute */
    revealState?: RevealState
}

// ============================================================
// TextRenderer — renders text as the appropriate HTML tag
// ============================================================

export const TextRenderer = memo(function TextRenderer({
    node,
    isTopLevel = false,
    parentDirection,
    parentLayoutMode,
    zIndex,
    revealState,
}: TextRendererProps) {
    // ── Inline editing state ──────────────────────────────────
    const editingNodeId = useEditorStore((s) => s.editingNodeId)
    const isEditing = editingNodeId === node.id

    const resolvedFontFamily = node.fontFamily
    const resolvedFontSize = node.fontSize
    const resolvedFontWeight = node.fontWeight
    const textPaintStyle = getTextPaintStyle(node)
    const textCaretColor = getTextPreviewColor(node)

    // ── Google Font loading ────────────────────────────────────
    // Load the font on mount and whenever fontFamily changes.
    // The tick counter forces a re-render once the font finishes loading,
    // so the browser repaints the text in the correct typeface.
    const [, setFontTick] = useState(0)
    useEffect(() => {
        const fontToLoad = resolvedFontFamily
        if (!isFontLoaded(fontToLoad)) {
            loadFont(fontToLoad).then(() => {
                setFontTick((t) => t + 1)
            })
        }
    }, [resolvedFontFamily])

    // Focus + select all when entering edit mode
    useEffect(() => {
        if (isEditing) {
            const el = document.querySelector(`[data-node-id="${node.id}"]`) as HTMLElement | null
            if (!el) return
            el.focus()
            const selection = window.getSelection()
            if (selection) {
                const range = document.createRange()
                range.selectNodeContents(el)
                selection.removeAllRanges()
                selection.addRange(range)
            }
        }
    }, [isEditing, node.id])

    const commitEdit = useCallback((newTextRaw: string) => {
        const newText = newTextRaw || ''
        const isBlankDraft = node.characters.length === 0 && newText.trim().length === 0
        if (isBlankDraft) {
            useEditorStore.getState().discardNode(node.id)
            return
        }
        if (newText !== node.characters) {
            useEditorStore.getState().updateNode(node.id, {
                characters: newText,
                name: newText.slice(0, 32) || 'Text',
            })
        }
        useEditorStore.getState().setEditingNodeId(null)
    }, [node.id, node.characters])

    const handleEditKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            e.preventDefault()
            const text = (e.currentTarget as HTMLElement).textContent || ''
            commitEdit(text)
                ; (e.currentTarget as HTMLElement).blur()
        }
        // Stop bubbling to prevent canvas keyboard shortcuts while typing
        e.stopPropagation()
    }, [commitEdit])

    // ── Styles ────────────────────────────────────────────────
    const baseStyle = computeBaseStyles(node, isTopLevel, parentDirection, parentLayoutMode, zIndex)

    // ── Line height (unit-aware) ───────────────────────────────────────────────
    // Legacy nodes may have lineHeight:'auto' or a unitless ratio (≤4) or absolute px.
    // New nodes use lineHeightUnit to disambiguate.
    const lhUnit = node.lineHeightUnit ?? (node.lineHeight === 'auto' ? 'auto' : 'px')
    const lineHeightCSS: string | number = (() => {
        if (lhUnit === 'auto' || node.lineHeight === 'auto') return 'normal'
        const val = node.lineHeight as number
        if (lhUnit === '%') return `${val}%`
        // 'px' mode — legacy unitless multiplier preservation: values ≤4 treated as ratio
        return val <= 4 ? val : `calc(${val}px * var(--z, 1))`
    })()

    // ── Letter spacing (unit-aware) ───────────────────────────────────────────
    const letterSpacingCSS: string | undefined = (() => {
        if (node.letterSpacing === 0) return undefined
        const lsUnit = node.letterSpacingUnit ?? 'px'
        if (lsUnit === '%') return `${node.letterSpacing / 100}em`
        return `calc(${node.letterSpacing}px * var(--z, 1))`
    })()

    // ── Text transform → CSS textTransform + fontVariantCaps (small-caps) ────
    const isSmallCaps = node.textTransform === 'small-caps'
    const textTransformCSS = (!isSmallCaps && node.textTransform !== 'none')
        ? (node.textTransform as CSSProperties['textTransform'])
        : undefined

    // ── Vertical alignment (flex column on fixed-height box) ─────────────────
    // 'display: flex; flexDirection: column' centers/aligns the anonymous text child.
    const vAlign = node.textAlignVertical ?? 'top'
    const isFixedHeight = node.autoResize === 'none' || node.autoResize === 'truncate'
    const vAlignStyle: CSSProperties = (isFixedHeight && vAlign !== 'top')
        ? {
            display: 'flex',
            flexDirection: 'column',
            justifyContent: vAlign === 'center' ? 'center' : 'flex-end',
        } : {}

    // ── List style ────────────────────────────────────────────────────────────
    const listStyle = node.listStyle ?? 'none'
    const listStyleCSS: CSSProperties = listStyle !== 'none' ? {
        display: 'list-item',
        listStyleType: listStyle === 'ordered' ? 'decimal' : 'disc',
        listStylePosition: node.hangingList ? 'outside' : 'inside',
        ...(node.hangingList ? { paddingLeft: `calc(1.2em * var(--z, 1))` } : {}),
    } : {}

    // ── OpenType feature settings ─────────────────────────────────────────────
    const opentypeCSS = node.opentypeFlags && Object.keys(node.opentypeFlags).length > 0
        ? Object.entries(node.opentypeFlags).map(([tag, val]) => `"${tag}" ${val}`).join(', ')
        : undefined

    const style: CSSProperties = {
        ...baseStyle,
        ...vAlignStyle,
        ...listStyleCSS,
        // Typography core
        fontFamily: `"${resolvedFontFamily}", sans-serif`,
        fontWeight: resolvedFontWeight,
        fontStyle: node.fontStyle === 'italic' ? 'italic' : undefined,
        fontSize: `calc(${resolvedFontSize}px * var(--z, 1))`,
        lineHeight: lineHeightCSS,
        letterSpacing: letterSpacingCSS,
        textAlign: node.textAlign as CSSProperties['textAlign'],
        textTransform: textTransformCSS,
        fontVariantCaps: isSmallCaps ? 'small-caps' : undefined,
        textDecoration: node.textDecoration !== 'none' ? node.textDecoration : undefined,
        ...textPaintStyle,
        // Paragraph indent — CSS text-indent applies to first line of each paragraph
        textIndent: node.paragraphIndent ? `calc(${node.paragraphIndent}px * var(--z, 1))` : undefined,
        // Hanging punctuation (CSS, limited browser support but gracefully degrades)
        hangingPunctuation: (node.hangingPunctuation ? 'first last' : undefined) as CSSProperties['hangingPunctuation'],
        // OpenType features
        fontFeatureSettings: opentypeCSS,
        // Auto-resize modes:
        // 'width-and-height' = no wrapping, grows in both axes (Figma "Auto width")
        // 'height'           = fixed width, grows vertically (Figma "Auto height")
        // 'none'|'truncate'  = fully fixed dimensions
        whiteSpace: node.autoResize === 'width-and-height' ? 'nowrap' : 'pre-wrap',
        wordBreak: node.autoResize === 'width-and-height' ? undefined : 'break-word',
        ...(node.autoResize === 'width-and-height' ? { width: 'auto', minWidth: 1 } : {}),
        ...(node.autoResize === 'height' ? { height: 'auto', minHeight: 1 } : {}),
        // Reset browser default margins on headings/paragraphs, but preserve
        // auto margins and explicit margins already set by computeBaseStyles
        ...(!baseStyle.margin ? { margin: 0 } : {}),
        // Editing overrides
        ...(isEditing ? { outline: 'none', cursor: 'text', caretColor: textCaretColor } : {}),
        // Truncation mode (disabled during editing to allow text selection)
        ...(node.autoResize === 'truncate' && !isEditing
            ? {
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap' as const,
                ...(node.maxLines && node.maxLines > 1
                    ? {
                        display: '-webkit-box',
                        WebkitLineClamp: node.maxLines,
                        WebkitBoxOrient: 'vertical' as const,
                        whiteSpace: 'normal' as const,
                    }
                    : {}),
            }
            : {}),
    }

    // Use the semantic HTML tag if specified, otherwise <p>
    const tag = node.htmlTag || 'p'

    let content: React.ReactNode = node.characters
    if (node.segments && node.segments.length > 0 && !isEditing) {
        const result: React.ReactNode[] = []
        let lastIndex = 0
        const sortedSegments = [...node.segments].sort((a, b) => a.start - b.start)
        
        sortedSegments.forEach((seg, i) => {
            if (seg.start > lastIndex) {
                result.push(node.characters.slice(lastIndex, seg.start))
            }
            
            const segStyle: CSSProperties = {}
            if (seg.fills && seg.fills[0] && seg.fills[0].type === 'solid') {
                segStyle.color = seg.fills[0].color
                segStyle.opacity = seg.fills[0].opacity ?? 1
            }
            if (seg.fontStyle) segStyle.fontStyle = seg.fontStyle
            if (seg.fontWeight) segStyle.fontWeight = seg.fontWeight
            if (seg.fontFamily) segStyle.fontFamily = `"${seg.fontFamily}", sans-serif`
            if (seg.fontSize) segStyle.fontSize = `calc(${seg.fontSize}px * var(--z, 1))`
            if (seg.textDecoration) segStyle.textDecoration = seg.textDecoration
            
            result.push(
                createElement('span', { key: i, style: segStyle }, node.characters.slice(seg.start, seg.end))
            )
            lastIndex = seg.end
        })
        if (lastIndex < node.characters.length) {
            result.push(node.characters.slice(lastIndex))
        }
        content = result
    }

    return createElement(tag, {
        'data-node-id': node.id,
        'data-gen-state': revealState,
        style,
        ...(isEditing
            ? {
                contentEditable: true,
                suppressContentEditableWarning: true,
                onBlur: (e: React.FocusEvent<HTMLElement>) => commitEdit(e.currentTarget.textContent || ''),
                onKeyDown: handleEditKeyDown,
                // Prevent canvas from intercepting pointer events during editing
                onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
            }
            : {}),
    }, content)
})
