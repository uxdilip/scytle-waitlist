'use client'

/**
 * ExportSection — Figma-style export configuration in properties panel.
 *
 * Placement: Bottom of right sidebar, after Effects section.
 *
 * Figma behavior:
 * - "Export" header with "+" to add export configs
 * - Each row: Scale ▼ | Format ▼ | − (remove)
 * - "Export [name]" button at bottom
 * - When empty: "+ Add export" dashed button
 * - Multiple configs allowed (e.g., 1x PNG + 2x PNG)
 */

import { useState, useCallback, useRef } from 'react'
import { Plus, Download, Loader2, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { generateId } from '@/lib/utils'
import {
    exportNode,
    downloadBlob,
    type ExportConfig,
    type ExportFormat,
    FORMAT_OPTIONS,
    SCALE_OPTIONS,
} from '@/lib/export/export-node'
import type { ScytleNode } from '@/types/canvas'

// ─────────────────────────────────────────────────────────────
// ExportRow — single export configuration (Figma layout)
// ─────────────────────────────────────────────────────────────

interface ExportRowProps {
    config: ExportConfig
    onUpdate: (id: string, updates: Partial<ExportConfig>) => void
    onRemove: (id: string) => void
}

function ExportRow({ config, onUpdate, onRemove }: ExportRowProps) {
    const isSvgOrHtml = config.format === 'SVG' || config.format === 'HTML'

    return (
        <div
            className={cn(
                'group flex items-center gap-1.5 h-7 rounded-sm px-1 -mx-1',
                'transition-colors hover:bg-muted/20',
            )}
        >
            {/* Scale dropdown */}
            <div className="relative flex-1 min-w-0">
                <select
                    value={String(config.scale)}
                    onChange={(e) => onUpdate(config.id, { scale: parseFloat(e.target.value) })}
                    disabled={isSvgOrHtml}
                    className={cn(
                        'w-full h-6 pl-1.5 pr-5 text-[11px] rounded-sm appearance-none cursor-pointer',
                        'bg-transparent border border-transparent',
                        'hover:bg-muted/50 focus:bg-muted/60 focus:border-border focus:outline-none',
                        'transition-colors',
                        isSvgOrHtml && 'opacity-40 cursor-not-allowed',
                    )}
                >
                    {SCALE_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                </select>
                <ChevronDown
                    size={9}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground/40 pointer-events-none"
                />
            </div>

            {/* Format dropdown */}
            <div className="relative flex-1 min-w-0">
                <select
                    value={config.format}
                    onChange={(e) => {
                        const format = e.target.value as ExportFormat
                        const updates: Partial<ExportConfig> = { format }
                        // SVG/HTML are always 1x
                        if (format === 'SVG' || format === 'HTML') {
                            updates.scale = 1
                        }
                        onUpdate(config.id, updates)
                    }}
                    className={cn(
                        'w-full h-6 pl-1.5 pr-5 text-[11px] rounded-sm appearance-none cursor-pointer',
                        'bg-transparent border border-transparent',
                        'hover:bg-muted/50 focus:bg-muted/60 focus:border-border focus:outline-none',
                        'transition-colors',
                    )}
                >
                    {FORMAT_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                </select>
                <ChevronDown
                    size={9}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground/40 pointer-events-none"
                />
            </div>

            {/* Remove button */}
            <button
                className={cn(
                    'w-5 h-5 flex items-center justify-center rounded-sm shrink-0',
                    'text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-all',
                )}
                onClick={() => onRemove(config.id)}
                title="Remove"
            >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 5H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
            </button>
        </div>
    )
}

// ─────────────────────────────────────────────────────────────
// ExportSection
// ─────────────────────────────────────────────────────────────

interface ExportSectionProps {
    node: ScytleNode
}

export function ExportSection({ node }: ExportSectionProps) {
    const [configs, setConfigs] = useState<ExportConfig[]>([])
    const [exporting, setExporting] = useState(false)
    const exportingRef = useRef(false)

    const addConfig = useCallback(() => {
        setConfigs(prev => [
            ...prev,
            {
                id: generateId(),
                format: 'PNG' as ExportFormat,
                scale: 1,
                suffix: '',
            },
        ])
    }, [])

    const updateConfig = useCallback((id: string, updates: Partial<ExportConfig>) => {
        setConfigs(prev =>
            prev.map(c => c.id === id ? { ...c, ...updates } : c)
        )
    }, [])

    const removeConfig = useCallback((id: string) => {
        setConfigs(prev => prev.filter(c => c.id !== id))
    }, [])

    const handleExport = useCallback(async () => {
        if (exportingRef.current || configs.length === 0) return
        exportingRef.current = true
        setExporting(true)

        try {
            for (const config of configs) {
                const result = await exportNode(node, config)
                downloadBlob(result.blob, result.filename)
            }
        } catch (err) {
            console.error('Export failed:', err)
        } finally {
            exportingRef.current = false
            setExporting(false)
        }
    }, [configs, node])

    const truncatedName = node.name.length > 24 ? node.name.slice(0, 24) + '...' : node.name

    return (
        <div className="border-b border-border/40">
            {/* Header — matches Figma: icon + "Export" + "+" */}
            <div className="flex items-center gap-1.5 px-3 h-8">
                <Download size={12} className="text-muted-foreground/60 shrink-0" />
                <span className="flex-1 text-[11px] font-medium text-muted-foreground">Export</span>
                <button
                    className="w-5 h-5 flex items-center justify-center rounded-sm transition-colors text-muted-foreground/40 hover:text-foreground hover:bg-muted/50"
                    onClick={addConfig}
                    title="Add export setting"
                >
                    <Plus size={12} />
                </button>
            </div>

            {/* Config rows */}
            {configs.length > 0 && (
                <div className="px-3 pb-1.5 space-y-0.5">
                    {configs.map(config => (
                        <ExportRow
                            key={config.id}
                            config={config}
                            onUpdate={updateConfig}
                            onRemove={removeConfig}
                        />
                    ))}
                </div>
            )}

            {/* Export button — Figma: "Export [name]" */}
            {configs.length > 0 ? (
                <div className="px-3 pb-2.5">
                    <button
                        onClick={handleExport}
                        disabled={exporting}
                        className={cn(
                            'w-full h-8 rounded-md text-[11px] font-medium',
                            'flex items-center justify-center gap-1.5',
                            'border border-border/60',
                            'text-foreground',
                            'hover:bg-muted/40 active:bg-muted/60',
                            'transition-all',
                            exporting && 'opacity-60 cursor-wait',
                        )}
                    >
                        {exporting ? (
                            <>
                                <Loader2 size={12} className="animate-spin" />
                                Exporting...
                            </>
                        ) : (
                            `Export ${truncatedName}`
                        )}
                    </button>
                </div>
            ) : (
                /* Empty state — Figma: "+ Add export" dashed button */
                <div className="px-3 pb-2.5">
                    <button
                        onClick={addConfig}
                        className={cn(
                            'w-full h-7 text-[11px] text-muted-foreground/40 hover:text-muted-foreground',
                            'border border-dashed border-border/30 hover:border-border/60',
                            'rounded-sm transition-colors flex items-center justify-center gap-1',
                        )}
                    >
                        <Plus size={10} />
                        Add export
                    </button>
                </div>
            )}
        </div>
    )
}
