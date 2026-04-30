'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { FilesTab } from './files-tab'
import { ChatPanel } from '@/components/chat/chat-panel'
import { PanelLeftClose, PanelLeft } from 'lucide-react'

const TABS = ['Files', 'Chat'] as const
type Tab = (typeof TABS)[number]

const MIN_WIDTH = 220
const MAX_WIDTH = 480
const DEFAULT_WIDTH = 288
const COLLAPSE_THRESHOLD = 180

export function LeftPanel() {
    const [activeTab, setActiveTab] = useState<Tab>('Files')
    const [width, setWidth] = useState(DEFAULT_WIDTH)
    const [collapsed, setCollapsed] = useState(false)
    const isDragging = useRef(false)
    const startX = useRef(0)
    const startWidth = useRef(DEFAULT_WIDTH)

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        isDragging.current = true
        startX.current = e.clientX
        startWidth.current = collapsed ? 0 : width
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'
        e.preventDefault()
    }, [width, collapsed])

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging.current) return
            const delta = e.clientX - startX.current
            const newWidth = startWidth.current + delta

            if (newWidth < COLLAPSE_THRESHOLD) {
                setCollapsed(true)
            } else {
                setCollapsed(false)
                setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, newWidth)))
            }
        }

        const handleMouseUp = () => {
            if (!isDragging.current) return
            isDragging.current = false
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
        }

        window.addEventListener('mousemove', handleMouseMove)
        window.addEventListener('mouseup', handleMouseUp)
        return () => {
            window.removeEventListener('mousemove', handleMouseMove)
            window.removeEventListener('mouseup', handleMouseUp)
        }
    }, [])

    return (
        <div className="relative flex shrink-0" style={{ width: collapsed ? 40 : width }}>
            <div className="flex flex-col flex-1 bg-card border-r border-border/60 select-none overflow-hidden">
                {/* ── Tab bar ── */}
                <div className={cn('flex h-10 border-b border-border/40 shrink-0', collapsed && 'hidden')}>
                    {TABS.map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={cn(
                                'flex-1 text-xs font-medium transition-colors relative',
                                activeTab === tab
                                    ? 'text-foreground'
                                    : 'text-muted-foreground hover:text-foreground/80'
                            )}
                        >
                            {tab}
                            {activeTab === tab && (
                                <span className="absolute bottom-0 inset-x-3 h-[2px] bg-foreground rounded-full" />
                            )}
                        </button>
                    ))}
                    <button
                        onClick={() => setCollapsed(true)}
                        className="w-8 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                        title="Collapse panel"
                    >
                        <PanelLeftClose className="w-3.5 h-3.5" />
                    </button>
                </div>

                {/* ── Tab content ── */}
                <div className={cn('flex-1 min-h-0 overflow-hidden relative', collapsed && 'hidden')}>
                    <div className={cn('absolute inset-0', activeTab !== 'Files' && 'hidden')}>
                        <FilesTab />
                    </div>
                    <div className={cn('absolute inset-0', activeTab !== 'Chat' && 'hidden')}>
                        <ChatPanel />
                    </div>
                </div>

                {/* Collapsed rail (keep tab content mounted above; only hide it) */}
                <div className={cn('flex flex-col w-10 shrink-0 items-center pt-2 gap-1', !collapsed && 'hidden')}>
                    <button
                        onClick={() => setCollapsed(false)}
                        className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                        title="Expand panel"
                    >
                        <PanelLeft className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* ── Drag handle ── */}
            {!collapsed && (
                <div
                    onMouseDown={handleMouseDown}
                    className="absolute top-0 right-0 w-1 h-full cursor-col-resize z-10"
                />
            )}
        </div>
    )
}
