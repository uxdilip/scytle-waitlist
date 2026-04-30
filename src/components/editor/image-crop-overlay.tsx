'use client'

import { useRef, useCallback, useEffect, useState } from 'react'
import { useEditorStore } from '@/store/editor-store'
import { findNodeById } from '@/types/canvas'
import type { ImageFill } from '@/types/canvas'

// ─────────────────────────────────────────────────────────────
// DOM helper — same as GradientHandleOverlay
// ─────────────────────────────────────────────────────────────

interface ScreenRect {
    x: number
    y: number
    width: number
    height: number
}

function getNodeScreenRect(nodeId: string, viewportEl: HTMLElement | null): ScreenRect | null {
    if (!viewportEl) return null
    const el = viewportEl.querySelector(`[data-node-id="${nodeId}"]`)
    if (!el) return null
    const nodeRect = el.getBoundingClientRect()
    const vRect = viewportEl.getBoundingClientRect()
    return {
        x: nodeRect.left - vRect.left,
        y: nodeRect.top - vRect.top,
        width: nodeRect.width,
        height: nodeRect.height,
    }
}

// ─────────────────────────────────────────────────────────────
// Handle descriptors — 4 corner handles (matching frame style)
// ─────────────────────────────────────────────────────────────

type HandleId = 'tl' | 'tr' | 'bl' | 'br'

interface HandleDesc {
    id: HandleId
    cursor: string
    /** Outward direction from image center */
    nx: number
    ny: number
}

const HANDLES: HandleDesc[] = [
    { id: 'tl', cursor: 'nwse-resize', nx: -1, ny: -1 },
    { id: 'tr', cursor: 'nesw-resize', nx:  1, ny: -1 },
    { id: 'bl', cursor: 'nesw-resize', nx: -1, ny:  1 },
    { id: 'br', cursor: 'nwse-resize', nx:  1, ny:  1 },
]

const HANDLE_SIZE = 8
const HALF = HANDLE_SIZE / 2

function handlePos(id: HandleId, imgX: number, imgY: number, imgW: number, imgH: number) {
    switch (id) {
        case 'tl': return { x: imgX - HALF, y: imgY - HALF }
        case 'tr': return { x: imgX + imgW - HALF, y: imgY - HALF }
        case 'bl': return { x: imgX - HALF, y: imgY + imgH - HALF }
        case 'br': return { x: imgX + imgW - HALF, y: imgY + imgH - HALF }
    }
}

// ─────────────────────────────────────────────────────────────
// ImageCropOverlay — Figma-style crop mode
// ─────────────────────────────────────────────────────────────

interface ImageCropOverlayProps {
    viewportRef: React.RefObject<HTMLDivElement | null>
}

export function ImageCropOverlay({ viewportRef }: ImageCropOverlayProps) {
    // Subscribe to viewport transforms for re-render on pan/zoom
    const zoom = useEditorStore((s) => s.zoom)
    const panX = useEditorStore((s) => s.panX)
    const panY = useEditorStore((s) => s.panY)
    void panX; void panY

    const selectedIds = useEditorStore((s) => s.selectedIds)
    const nodes = useEditorStore((s) => s.nodes)
    const updateNode = useEditorStore((s) => s.updateNode)
    const imageCropEditingFillIdx = useEditorStore((s) => s.imageCropEditingFillIdx)
    const setImageCropEditingFillIdx = useEditorStore((s) => s.setImageCropEditingFillIdx)

    const nodeId = selectedIds[0] ?? null
    const node = nodeId ? findNodeById(nodes, nodeId) : null
    const cropFillIdx = imageCropEditingFillIdx
    const cropFill =
        node && cropFillIdx !== null && cropFillIdx >= 0 && cropFillIdx < node.fills.length
            ? (node.fills[cropFillIdx] as ImageFill | undefined)
            : null
    const isActive = !!(cropFill && cropFill.type === 'image' && cropFill.fit === 'crop' && cropFill.src)

    // ── Natural image dimensions ──
    const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null)
    const prevSrc = useRef('')

    useEffect(() => {
        const src = isActive && cropFill ? cropFill.src : ''
        if (src === prevSrc.current) return
        prevSrc.current = src
        if (!src) { setImgSize(null); return }
        const img = new window.Image()
        img.onload = () => setImgSize({ w: img.naturalWidth, h: img.naturalHeight })
        img.src = src
    }, [isActive, cropFill])

    // ── Original crop values for cancel (Escape) ──
    const originalRef = useRef<{ cropX: number; cropY: number; cropZoom: number } | null>(null)
    useEffect(() => {
        if (isActive && originalRef.current === null && cropFill) {
            originalRef.current = {
                cropX: cropFill.cropX ?? 50,
                cropY: cropFill.cropY ?? 50,
                cropZoom: cropFill.cropZoom ?? 1,
            }
        } else if (!isActive) {
            originalRef.current = null
        }
    }, [isActive, cropFill])

    // ── Cursor state ──
    const [panCursor, setPanCursor] = useState<'grab' | 'grabbing'>('grab')

    // ── Screen rect from RAF polling (prevents stale positions during canvas zoom/pan) ──
    const [screenRect, setScreenRect] = useState<ScreenRect | null>(null)

    // ── RAF ref for throttling store commits ──
    const rafRef = useRef<number | null>(null)

    // ── Pan drag state ──
    const isPanning = useRef(false)
    const panStart = useRef({ clientX: 0, clientY: 0 })
    const panStartCrop = useRef({ x: 50, y: 50 })
    const panOverflow = useRef({ x: 0, y: 0 })

    // ── Resize drag state ──
    const isResizing = useRef(false)
    const resizeHandle = useRef<HandleDesc | null>(null)
    const resizeStartClient = useRef({ x: 0, y: 0 })
    const resizeStartZoom = useRef(1)
    const resizeRefDim = useRef(1)

    // ── Cleanup RAF on unmount ──
    useEffect(() => {
        return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current) }
    }, [])

    // ── Store commit helpers ──
    const commitCropPos = useCallback((newX: number, newY: number) => {
        if (!nodeId || !node || cropFillIdx === null || cropFillIdx < 0) return
        const newFills = node.fills.map((f, i) =>
            i === cropFillIdx ? { ...f, cropX: newX, cropY: newY } : f,
        )
        updateNode(nodeId, { fills: newFills })
    }, [nodeId, node, cropFillIdx, updateNode])

    const commitZoom = useCallback((newZoom: number) => {
        if (!nodeId || !node || cropFillIdx === null || cropFillIdx < 0) return
        const clamped = Math.max(1, Math.min(10, newZoom))
        const newFills = node.fills.map((f, i) =>
            i === cropFillIdx ? { ...f, cropZoom: clamped } : f,
        )
        updateNode(nodeId, { fills: newFills })
    }, [nodeId, node, cropFillIdx, updateNode])

    const scheduleRAF = useCallback((fn: () => void) => {
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
        rafRef.current = requestAnimationFrame(() => { fn(); rafRef.current = null })
    }, [])

    // ── Confirm / Cancel ──
    const confirmCrop = useCallback(() => {
        originalRef.current = null
        setImageCropEditingFillIdx(null)
    }, [setImageCropEditingFillIdx])

    const cancelCrop = useCallback(() => {
        if (originalRef.current && nodeId && node && cropFillIdx !== null && cropFillIdx >= 0) {
            const orig = originalRef.current
            const newFills = node.fills.map((f, i) =>
                i === cropFillIdx
                    ? { ...f, cropX: orig.cropX, cropY: orig.cropY, cropZoom: orig.cropZoom }
                    : f,
            )
            updateNode(nodeId, { fills: newFills })
        }
        originalRef.current = null
        setImageCropEditingFillIdx(null)
    }, [nodeId, node, cropFillIdx, updateNode, setImageCropEditingFillIdx])

    // ── Keyboard: Enter = confirm, Escape = cancel ──
    useEffect(() => {
        if (!isActive) return
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Enter') { e.preventDefault(); confirmCrop() }
            if (e.key === 'Escape') { e.preventDefault(); cancelCrop() }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [isActive, confirmCrop, cancelCrop])

    // ── RAF-based position polling (reads DOM after layout, not during render) ──
    useEffect(() => {
        if (!isActive || !nodeId) { setScreenRect(null); return }
        let mounted = true
        let pollRaf: number
        const poll = () => {
            if (!mounted) return
            const rect = getNodeScreenRect(nodeId, viewportRef.current)
            setScreenRect(prev => {
                if (!rect) return null
                if (prev &&
                    Math.abs(prev.x - rect.x) < 0.3 &&
                    Math.abs(prev.y - rect.y) < 0.3 &&
                    Math.abs(prev.width - rect.width) < 0.3 &&
                    Math.abs(prev.height - rect.height) < 0.3) {
                    return prev // no significant change — avoid re-render
                }
                return rect
            })
            pollRaf = requestAnimationFrame(poll)
        }
        pollRaf = requestAnimationFrame(poll)
        return () => { mounted = false; cancelAnimationFrame(pollRaf) }
    }, [isActive, nodeId, viewportRef])

    // ── Early return (after all hooks) ──
    if (!isActive || !cropFill || zoom <= 0 || !screenRect || screenRect.width < 4 || screenRect.height < 4) return null

    const cropX = cropFill.cropX ?? 50
    const cropY = cropFill.cropY ?? 50
    const cropZoom = cropFill.cropZoom ?? 1
    const fillOpacity = cropFill.opacity ?? 1

    // ── Image geometry math ──
    const frameW = screenRect.width
    const frameH = screenRect.height
    let imgW: number, imgH: number
    if (imgSize) {
        const coverScale = Math.max(frameW / imgSize.w, frameH / imgSize.h)
        imgW = imgSize.w * coverScale * cropZoom
        imgH = imgSize.h * coverScale * cropZoom
    } else {
        imgW = frameW * cropZoom
        imgH = frameH * cropZoom
    }

    const imgX = screenRect.x + (frameW - imgW) * (cropX / 100)
    const imgY = screenRect.y + (frameH - imgH) * (cropY / 100)

    const overflowX = imgW - frameW
    const overflowY = imgH - frameH

    // Pan drag zone encompasses both frame and extended image
    const dragLeft   = Math.min(imgX, screenRect.x)
    const dragTop    = Math.min(imgY, screenRect.y)
    const dragRight  = Math.max(imgX + imgW, screenRect.x + frameW)
    const dragBottom = Math.max(imgY + imgH, screenRect.y + frameH)

    return (
        <div
            className="absolute inset-0 w-full h-full"
            style={{ pointerEvents: 'none', zIndex: 45, overflow: 'visible' }}
        >
            {/* ── Layer 1: Dimmed full image (extends beyond frame) ──
                The node's own CSS background renders the bright in-frame portion
                perfectly (in canvas space, zero lag). This layer only adds the
                dim image OUTSIDE the frame. Where they overlap inside the frame:
                CSS bg (100%) + this dim (35%) = 0.35x + 0.65x = 1.0x — same brightness.
            */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={cropFill.src}
                alt=""
                draggable={false}
                style={{
                    position: 'absolute',
                    left: imgX,
                    top: imgY,
                    width: imgW,
                    height: imgH,
                    opacity: 0.35 * fillOpacity,
                    pointerEvents: 'none',
                    objectFit: 'fill',
                    userSelect: 'none',
                }}
            />

            {/* ── Layer 3: Pan drag zone (reposition crop) ── */}
            <div
                style={{
                    position: 'absolute',
                    left: dragLeft,
                    top: dragTop,
                    width: dragRight - dragLeft,
                    height: dragBottom - dragTop,
                    pointerEvents: 'auto',
                    cursor: panCursor,
                }}
                onPointerDown={(e) => {
                    if (isResizing.current) return
                    e.stopPropagation()
                    e.preventDefault()
                    isPanning.current = true
                    setPanCursor('grabbing')
                    panStart.current = { clientX: e.clientX, clientY: e.clientY }
                    panStartCrop.current = { x: cropX, y: cropY }
                    panOverflow.current = { x: overflowX, y: overflowY }
                    ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
                }}
                onPointerMove={(e) => {
                    if (!isPanning.current) return
                    e.stopPropagation()
                    const ovX = panOverflow.current.x
                    const ovY = panOverflow.current.y
                    const dx = e.clientX - panStart.current.clientX
                    const dy = e.clientY - panStart.current.clientY
                    const dxPct = ovX > 0 ? (dx / ovX) * 100 : 0
                    const dyPct = ovY > 0 ? (dy / ovY) * 100 : 0
                    const newX = Math.round(Math.max(0, Math.min(100, panStartCrop.current.x - dxPct)) * 10) / 10
                    const newY = Math.round(Math.max(0, Math.min(100, panStartCrop.current.y - dyPct)) * 10) / 10
                    scheduleRAF(() => commitCropPos(newX, newY))
                }}
                onPointerUp={(e) => {
                    isPanning.current = false
                    setPanCursor('grab')
                    ;(e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId)
                    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
                }}
            />

            {/* ── Layer 4: Frame border (blue, indicates crop region) ── */}
            <div
                style={{
                    position: 'absolute',
                    left: screenRect.x - 1,
                    top: screenRect.y - 1,
                    width: frameW + 2,
                    height: frameH + 2,
                    pointerEvents: 'none',
                    border: '2px solid rgba(59, 130, 246, 0.85)',
                    borderRadius: 3,
                }}
            />

            {/* ── Layer 5: 4 corner resize handles ── */}
            {HANDLES.map((h) => {
                const pos = handlePos(h.id, imgX, imgY, imgW, imgH)
                return (
                    <div
                        key={h.id}
                        style={{
                            position: 'absolute',
                            left: pos.x,
                            top: pos.y,
                            width: HANDLE_SIZE,
                            height: HANDLE_SIZE,
                            pointerEvents: 'auto',
                            background: 'white',
                            borderRadius: 1,
                            border: '1.5px solid rgba(59, 130, 246, 0.85)',
                            cursor: h.cursor,
                            zIndex: 46,
                        }}
                        onPointerDown={(e) => {
                            e.stopPropagation()
                            e.preventDefault()
                            isResizing.current = true
                            resizeHandle.current = h
                            resizeStartClient.current = { x: e.clientX, y: e.clientY }
                            resizeStartZoom.current = cropZoom
                            resizeRefDim.current = Math.max(imgW, imgH)
                            ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
                        }}
                        onPointerMove={(e) => {
                            if (!isResizing.current || !resizeHandle.current) return
                            e.stopPropagation()
                            const { nx, ny } = resizeHandle.current
                            const dx = e.clientX - resizeStartClient.current.x
                            const dy = e.clientY - resizeStartClient.current.y
                            const mag = Math.sqrt(nx * nx + ny * ny)
                            const delta = (dx * nx + dy * ny) / mag
                            const refDim = resizeRefDim.current
                            const newZoom = resizeStartZoom.current * (1 + (delta * 2) / refDim)
                            scheduleRAF(() => commitZoom(newZoom))
                        }}
                        onPointerUp={(e) => {
                            isResizing.current = false
                            resizeHandle.current = null
                            ;(e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId)
                            if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
                        }}
                    />
                )
            })}

            {/* ── Layer 6: Bottom toolbar ── */}
            <div
                style={{
                    position: 'absolute',
                    left: screenRect.x + frameW / 2,
                    top: screenRect.y + frameH + 14,
                    transform: 'translateX(-50%)',
                    pointerEvents: 'auto',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    background: 'rgba(24, 24, 27, 0.96)',
                    borderRadius: 8,
                    padding: '5px 10px',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06)',
                    whiteSpace: 'nowrap',
                    backdropFilter: 'blur(12px)',
                }}
                onPointerDown={(e) => e.stopPropagation()}
            >
                {/* Crop label */}
                <span
                    style={{
                        fontSize: 11,
                        color: 'rgba(255,255,255,0.65)',
                        fontWeight: 500,
                        letterSpacing: 0.2,
                    }}
                >
                    Crop
                </span>

                {/* Zoom slider */}
                <input
                    type="range"
                    min={1}
                    max={5}
                    step={0.05}
                    value={cropZoom}
                    onChange={(e) => commitZoom(Number(e.target.value))}
                    style={{ width: 80, accentColor: '#3b82f6', cursor: 'pointer' }}
                />
                <span
                    style={{
                        fontSize: 10,
                        color: 'rgba(255,255,255,0.45)',
                        fontFamily: 'monospace',
                        minWidth: 32,
                        textAlign: 'center',
                    }}
                >
                    {Math.round(cropZoom * 100)}%
                </span>

                {/* Separator */}
                <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)' }} />

                {/* Fill frame button — reset to cover without extra zoom */}
                <button
                    onClick={() => {
                        commitZoom(1)
                        commitCropPos(50, 50)
                    }}
                    title="Reset to fill frame"
                    style={{
                        width: 22,
                        height: 22,
                        borderRadius: 4,
                        background: 'rgba(255,255,255,0.08)',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'rgba(255,255,255,0.55)',
                        transition: 'background 0.15s, color 0.15s',
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.15)'
                        e.currentTarget.style.color = 'white'
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
                        e.currentTarget.style.color = 'rgba(255,255,255,0.55)'
                    }}
                >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M1 4V1.5C1 1.22 1.22 1 1.5 1H4M8 1h2.5c.28 0 .5.22.5.5V4M11 8v2.5c0 .28-.22.5-.5.5H8M4 11H1.5c-.28 0-.5-.22-.5-.5V8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                    </svg>
                </button>

                {/* Separator */}
                <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)' }} />

                {/* Cancel */}
                <button
                    onClick={cancelCrop}
                    style={{
                        fontSize: 11,
                        color: 'rgba(255,255,255,0.55)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '3px 6px',
                        borderRadius: 4,
                        transition: 'color 0.15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'white' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.55)' }}
                >
                    Cancel
                </button>

                {/* Confirm checkmark */}
                <button
                    onClick={confirmCrop}
                    title="Confirm crop (Enter)"
                    style={{
                        width: 24,
                        height: 24,
                        borderRadius: 5,
                        background: '#3b82f6',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#2563eb' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = '#3b82f6' }}
                >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path
                            d="M3 7L6 10L11 4"
                            stroke="white"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                </button>
            </div>
        </div>
    )
}
