'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Sparkles, Zap, Check, Brain, Eye, Code2, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MODELS, DEFAULT_MODEL, type ModelDef } from '@/lib/ai/model-defs'

// ─────────────────────────────────────────────
// Capability Icons
// ─────────────────────────────────────────────

type ModelCapability = string

const CAPABILITY_ICONS: Record<string, React.ReactNode> = {
    thinking: <Brain className="w-3 h-3" />,
    fast: <Zap className="w-3 h-3" />,
    coding: <Code2 className="w-3 h-3" />,
    vision: <Eye className="w-3 h-3" />,
    'long-context': <Clock className="w-3 h-3" />,
}

const CAPABILITY_LABELS: Record<string, string> = {
    thinking: 'Thinking',
    fast: 'Fast',
    coding: 'Coding',
    vision: 'Vision',
    'long-context': 'Long context',
}

// ─────────────────────────────────────────────
// Tier Colors
// ─────────────────────────────────────────────

const TIER_STYLES = {
    pro: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
    standard: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    lite: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
}

// ─────────────────────────────────────────────
// Provider Icon
// ─────────────────────────────────────────────

function ModelIcon({ model, size = 'md' }: { model: ModelDef; size?: 'sm' | 'md' }) {
    const sizeClasses = size === 'sm' ? 'w-5 h-5' : 'w-8 h-8'
    const iconSize = size === 'sm' ? 'w-2.5 h-2.5' : 'w-4 h-4'

    if (model.provider === 'vertex') {
        return (
            <div className={cn(
                sizeClasses,
                'rounded-lg flex items-center justify-center',
                'bg-gradient-to-br from-violet-500 to-purple-600'
            )}>
                <Sparkles className={cn(iconSize, 'text-white')} />
            </div>
        )
    }

    // Claude models via proxy
    const bgColor = model.tier === 'pro'
        ? 'bg-gradient-to-br from-amber-500 to-orange-600'
        : model.tier === 'standard'
        ? 'bg-gradient-to-br from-blue-500 to-indigo-600'
        : 'bg-gradient-to-br from-emerald-500 to-teal-600'

    return (
        <div className={cn(sizeClasses, 'rounded-lg flex items-center justify-center', bgColor)}>
            <Sparkles className={cn(iconSize, 'text-white')} />
        </div>
    )
}

// ─────────────────────────────────────────────
// Model Option Row
// ─────────────────────────────────────────────

function ModelOption({
    model,
    isSelected,
    onClick,
}: {
    model: ModelDef
    isSelected: boolean
    onClick: () => void
}) {
    return (
        <button
            onClick={onClick}
            className={cn(
                'w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-left transition-colors',
                isSelected
                    ? 'bg-accent/50'
                    : 'hover:bg-muted/50'
            )}
        >
            <ModelIcon model={model} />

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{model.displayName}</span>
                    {model.badge && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-accent/50 text-accent-foreground">
                            {model.badge}
                        </span>
                    )}
                </div>

                {/* Capabilities */}
                <div className="flex items-center gap-1.5 mt-1">
                    {model.capabilities.slice(0, 3).map(cap => (
                        <span
                            key={cap}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-muted/50 text-muted-foreground"
                        >
                            {CAPABILITY_ICONS[cap]}
                            {CAPABILITY_LABELS[cap] || cap}
                        </span>
                    ))}
                </div>
            </div>

            {isSelected && (
                <Check className="w-4 h-4 text-foreground shrink-0 mt-1" />
            )}
        </button>
    )
}

// ─────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────

interface ModelSelectorProps {
    value?: string
    onChange?: (modelKey: string) => void
    className?: string
    /** Compact mode for inline use */
    compact?: boolean
}

export function ModelSelector({
    value,
    onChange,
    className,
    compact = false,
}: ModelSelectorProps) {
    const [isOpen, setIsOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)

    const selectedModel = MODELS.find(m => m.key === value) || MODELS.find(m => m.key === DEFAULT_MODEL) || MODELS[0]

    // Close on outside click
    useEffect(() => {
        if (!isOpen) return
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [isOpen])

    // Close on escape
    useEffect(() => {
        if (!isOpen) return
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsOpen(false)
        }
        document.addEventListener('keydown', handler)
        return () => document.removeEventListener('keydown', handler)
    }, [isOpen])

    const handleSelect = (modelKey: string) => {
        onChange?.(modelKey)
        setIsOpen(false)
    }

    if (compact) {
        return (
            <div ref={containerRef} className={cn('relative', className)}>
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                >
                    {selectedModel && <ModelIcon model={selectedModel} size="sm" />}
                    <span>{selectedModel?.displayName ?? 'Select model'}</span>
                    <ChevronDown className={cn(
                        'w-3 h-3 transition-transform',
                        isOpen && 'rotate-180'
                    )} />
                </button>

                {isOpen && (
                    <div className="absolute bottom-full left-0 mb-2 w-72 bg-popover border border-border/50 rounded-2xl shadow-xl p-2 z-50">
                        <div className="px-3 py-2 border-b border-border/30 mb-1">
                            <span className="text-xs font-medium text-muted-foreground">Select Model</span>
                        </div>
                        <div className="space-y-0.5 max-h-80 overflow-y-auto">
                            {MODELS.map(model => (
                                <ModelOption
                                    key={model.key}
                                    model={model}
                                    isSelected={selectedModel?.key === model.key}
                                    onClick={() => handleSelect(model.key)}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>
        )
    }

    return (
        <div ref={containerRef} className={cn('relative', className)}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-xl border border-border/50 bg-card/50',
                    'hover:border-border hover:bg-card transition-all duration-200',
                    'w-full text-left'
                )}
            >
                {selectedModel && <ModelIcon model={selectedModel} />}

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{selectedModel?.displayName ?? 'Select model'}</span>
                        {selectedModel?.badge && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-accent/50 text-accent-foreground">
                                {selectedModel.badge}
                            </span>
                        )}
                    </div>
                </div>

                <ChevronDown className={cn(
                    'w-4 h-4 text-muted-foreground transition-transform shrink-0',
                    isOpen && 'rotate-180'
                )} />
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-popover border border-border/50 rounded-2xl shadow-xl p-2 z-50">
                    <div className="space-y-0.5 max-h-80 overflow-y-auto">
                        {MODELS.map(model => (
                            <ModelOption
                                key={model.key}
                                model={model}
                                isSelected={selectedModel?.key === model.key}
                                onClick={() => handleSelect(model.key)}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

export { type ModelSelectorProps }
