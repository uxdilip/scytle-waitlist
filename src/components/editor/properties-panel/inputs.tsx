'use client'

/**
 * Shared input primitives for properties panel sections.
 * Figma-inspired styling: subtle backgrounds, no colored focus rings,
 * compact layout, blur-to-commit, Enter-to-commit, Escape-to-cancel.
 */

import {
    useState,
    useRef,
    useCallback,
    useEffect,
    type KeyboardEvent,
} from 'react'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronRight } from 'lucide-react'

/* ── Shared input class constants ─────────────────────────── */

const INPUT_BASE = [
    'w-full h-7 px-2 text-[11px] rounded-sm',
    'bg-transparent border border-transparent',
    'hover:bg-muted/50',
    'focus:bg-muted/60 focus:border-border focus:outline-none',
    'transition-colors tabular-nums',
].join(' ')

const LABEL_BASE = 'text-[11px] text-muted-foreground shrink-0 select-none'

// ============================================================
// NumberInput — compact numeric field with label
// ============================================================

interface NumberInputProps {
    label?: string
    value: number
    onChange: (value: number) => void
    min?: number
    max?: number
    step?: number
    disabled?: boolean
    className?: string
    /** Optional unit suffix (e.g., "px", "%", "°") */
    suffix?: string
    /** Label width class (default: 'w-4') */
    labelWidth?: string
    /** Callback for comma-separated shorthand input (e.g., "10,20,30,40") */
    onShorthand?: (values: number[]) => void
    /** Optional override for disabled visual treatment */
    disabledClassName?: string
}

/** Round to step precision to avoid floating point artifacts */
function roundToStep(val: number, step: number): number {
    if (step >= 1) return Math.round(val)
    const decimals = Math.max(0, -Math.floor(Math.log10(step)))
    return parseFloat(val.toFixed(decimals))
}

export function NumberInput({
    label,
    value,
    onChange,
    min,
    max,
    step = 1,
    disabled = false,
    className,
    suffix,
    labelWidth = 'w-4',
    onShorthand,
    disabledClassName,
}: NumberInputProps) {
    const [localValue, setLocalValue] = useState(String(roundToStep(value, step)))
    const inputRef = useRef<HTMLInputElement>(null)
    const arrowRafRef = useRef<number>(0)
    const pendingArrowValueRef = useRef<number | null>(null)

    const flushScheduledArrowChange = useCallback(() => {
        arrowRafRef.current = 0
        const next = pendingArrowValueRef.current
        pendingArrowValueRef.current = null
        if (next === null) return
        if (next !== value) {
            onChange(next)
        }
    }, [onChange, value])

    const scheduleArrowChange = useCallback((next: number) => {
        pendingArrowValueRef.current = next
        if (arrowRafRef.current !== 0) return
        arrowRafRef.current = requestAnimationFrame(flushScheduledArrowChange)
    }, [flushScheduledArrowChange])

    const clearScheduledArrowChange = useCallback(() => {
        if (arrowRafRef.current !== 0) {
            cancelAnimationFrame(arrowRafRef.current)
            arrowRafRef.current = 0
        }
        pendingArrowValueRef.current = null
    }, [])

    // Sync from external value changes
    useEffect(() => {
        if (document.activeElement !== inputRef.current) {
            setLocalValue(String(roundToStep(value, step)))
        }
    }, [value, step])

    useEffect(() => clearScheduledArrowChange, [clearScheduledArrowChange])

    const commit = useCallback(() => {
        clearScheduledArrowChange()

        // Handle comma-separated shorthand (e.g., "10,20,30,40")
        if (onShorthand && localValue.includes(',')) {
            const parts = localValue.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n))
            if (parts.length > 0) {
                onShorthand(parts)
                return
            }
        }

        let num = parseFloat(localValue)
        if (isNaN(num)) {
            setLocalValue(String(roundToStep(value, step)))
            return
        }
        num = roundToStep(num, step)
        if (min !== undefined) num = Math.max(min, num)
        if (max !== undefined) num = Math.min(max, num)
        setLocalValue(String(num))
        if (num !== value) onChange(num)
    }, [clearScheduledArrowChange, localValue, value, onChange, min, max, step, onShorthand])

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            commit()
            inputRef.current?.blur()
        } else if (e.key === 'Escape') {
            clearScheduledArrowChange()
            setLocalValue(String(roundToStep(value, step)))
            inputRef.current?.blur()
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault()
            const s = e.shiftKey ? step * 10 : step
            const delta = e.key === 'ArrowUp' ? s : -s
            let num = roundToStep(parseFloat(localValue) + delta, step)
            if (min !== undefined) num = Math.max(min, num)
            if (max !== undefined) num = Math.min(max, num)
            setLocalValue(String(num))
            scheduleArrowChange(num)
        }
    }

    return (
        <div className={cn('flex items-center gap-1', className)}>
            {label && (
                <label className={cn(LABEL_BASE, labelWidth)}>
                    {label}
                </label>
            )}
            <div className="relative flex-1">
                <input
                    ref={inputRef}
                    type="text"
                    inputMode="numeric"
                    value={localValue}
                    disabled={disabled}
                    className={cn(
                        INPUT_BASE,
                        suffix && 'pr-6',
                        disabled && (disabledClassName ?? 'opacity-40 cursor-not-allowed')
                    )}
                    onChange={(e) => setLocalValue(e.target.value)}
                    onBlur={commit}
                    onKeyDown={handleKeyDown}
                    onFocus={(e) => e.target.select()}
                />
                {suffix && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/60 pointer-events-none">
                        {suffix}
                    </span>
                )}
            </div>
        </div>
    )
}

// ============================================================
// TextInput — inline text field with label
// ============================================================

interface TextInputProps {
    label?: string
    value: string
    onChange: (value: string) => void
    placeholder?: string
    disabled?: boolean
    className?: string
    labelWidth?: string
}

export function TextInput({
    label,
    value,
    onChange,
    placeholder,
    disabled = false,
    className,
    labelWidth,
}: TextInputProps) {
    const [localValue, setLocalValue] = useState(value)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (document.activeElement !== inputRef.current) {
            setLocalValue(value)
        }
    }, [value])

    const commit = () => {
        if (localValue !== value) onChange(localValue)
    }

    return (
        <div className={cn('flex items-center gap-1', className)}>
            {label && (
                <label className={cn(LABEL_BASE, labelWidth)}>
                    {label}
                </label>
            )}
            <input
                ref={inputRef}
                type="text"
                value={localValue}
                placeholder={placeholder}
                disabled={disabled}
                className={cn(
                    'flex-1',
                    INPUT_BASE,
                    disabled && 'opacity-40 cursor-not-allowed'
                )}
                onChange={(e) => setLocalValue(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') { commit(); inputRef.current?.blur() }
                    if (e.key === 'Escape') { setLocalValue(value); inputRef.current?.blur() }
                }}
            />
        </div>
    )
}

// ============================================================
// SelectInput — small dropdown (Figma-style)
// ============================================================

interface SelectInputProps {
    label?: string
    value: string
    options: { value: string; label: string }[]
    onChange: (value: string) => void
    disabled?: boolean
    className?: string
    labelWidth?: string
}

export function SelectInput({
    label,
    value,
    options,
    onChange,
    disabled = false,
    className,
    labelWidth,
}: SelectInputProps) {
    return (
        <div className={cn('flex items-center gap-1', className)}>
            {label && (
                <label className={cn(LABEL_BASE, labelWidth)}>
                    {label}
                </label>
            )}
            <div className="relative flex-1">
                <select
                    value={value}
                    disabled={disabled}
                    className={cn(
                        'w-full h-7 pl-2 pr-5 text-[11px] rounded-sm appearance-none',
                        'bg-transparent border border-transparent',
                        'hover:bg-muted/50',
                        'focus:bg-muted/60 focus:border-border focus:outline-none',
                        'transition-colors cursor-pointer',
                        disabled && 'opacity-40 cursor-not-allowed'
                    )}
                    onChange={(e) => onChange(e.target.value)}
                >
                    {options.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </select>
                <ChevronDown
                    size={10}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none"
                />
            </div>
        </div>
    )
}

// ============================================================
// ColorInput — swatch + hex text field + opacity
// ============================================================

interface ColorInputProps {
    label?: string
    value: string
    onChange: (value: string) => void
    /** Show a separate opacity field (0–100) */
    opacity?: number
    onOpacityChange?: (value: number) => void
    className?: string
}

export function ColorInput({
    label,
    value,
    onChange,
    opacity,
    onOpacityChange,
    className,
}: ColorInputProps) {
    const [localValue, setLocalValue] = useState(value.replace('#', '').toUpperCase())
    const inputRef = useRef<HTMLInputElement>(null)
    const colorRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (document.activeElement !== inputRef.current) {
            setLocalValue(value.replace('#', '').toUpperCase())
        }
    }, [value])

    const commit = () => {
        let hex = localValue.startsWith('#') ? localValue : `#${localValue}`
        if (!/^#[0-9a-fA-F]{3,8}$/.test(hex)) {
            setLocalValue(value.replace('#', '').toUpperCase())
            return
        }
        if (hex !== value) onChange(hex)
    }

    return (
        <div className={cn('flex items-center gap-1.5', className)}>
            {label && (
                <label className={cn(LABEL_BASE, 'w-auto')}>
                    {label}
                </label>
            )}
            {/* Color swatch */}
            <button
                className="w-6 h-6 rounded-sm border border-border/60 shrink-0 cursor-pointer
                    shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]"
                style={{ backgroundColor: value }}
                onClick={() => colorRef.current?.click()}
                title="Pick color"
            />
            <input
                ref={colorRef}
                type="color"
                value={value.startsWith('#') ? value : '#000000'}
                className="sr-only"
                onChange={(e) => {
                    setLocalValue(e.target.value.replace('#', '').toUpperCase())
                    onChange(e.target.value)
                }}
            />
            {/* Hex input */}
            <input
                ref={inputRef}
                type="text"
                value={localValue}
                className={cn(
                    'flex-1 h-7 px-2 text-[11px] font-mono rounded-sm',
                    'bg-transparent border border-transparent',
                    'hover:bg-muted/50',
                    'focus:bg-muted/60 focus:border-border focus:outline-none',
                    'transition-colors'
                )}
                onChange={(e) => setLocalValue(e.target.value.replace('#', '').toUpperCase())}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') { commit(); inputRef.current?.blur() }
                    if (e.key === 'Escape') {
                        setLocalValue(value.replace('#', '').toUpperCase())
                        inputRef.current?.blur()
                    }
                }}
            />
            {/* Opacity field */}
            {opacity !== undefined && onOpacityChange && (
                <NumberInput
                    value={Math.round(opacity)}
                    onChange={onOpacityChange}
                    min={0}
                    max={100}
                    step={1}
                    suffix="%"
                    className="w-16"
                />
            )}
        </div>
    )
}

// ============================================================
// Section wrapper — Figma-style collapsible with heading
// ============================================================

interface SectionProps {
    title: string
    children: React.ReactNode
    defaultOpen?: boolean
    /** Optional right-side action button */
    action?: React.ReactNode
}

export function Section({ title, children, defaultOpen = true, action }: SectionProps) {
    const [open, setOpen] = useState(defaultOpen)

    return (
        <div className="border-b border-border/40">
            <div
                className="w-full flex items-center gap-1.5 px-3 h-8 text-[11px] font-medium
                    text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                role="button"
                tabIndex={0}
                onClick={(e) => {
                    // Don't toggle when clicking action buttons
                    if ((e.target as HTMLElement).closest('[data-section-action]')) return
                    setOpen(!open)
                }}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setOpen(!open)
                    }
                }}
            >
                <ChevronRight
                    size={10}
                    className={cn(
                        'transition-transform duration-150 text-muted-foreground/60',
                        open && 'rotate-90'
                    )}
                />
                <span className="flex-1 text-left">{title}</span>
                {action && (
                    <span
                        data-section-action
                        className="text-muted-foreground/60 hover:text-foreground"
                    >
                        {action}
                    </span>
                )}
            </div>
            {open && (
                <div className="px-3 pb-3 space-y-2">
                    {children}
                </div>
            )}
        </div>
    )
}

// ============================================================
// SectionHeader — standalone header row (no collapse)
// ============================================================

interface SectionHeaderProps {
    title: string
    action?: React.ReactNode
    className?: string
}

export function SectionHeader({ title, action, className }: SectionHeaderProps) {
    return (
        <div className={cn(
            'flex items-center justify-between px-3 h-8 border-b border-border/40',
            className
        )}>
            <span className="text-[11px] font-medium text-muted-foreground">{title}</span>
            {action}
        </div>
    )
}

// ============================================================
// ToggleGroup — icon-based button group (Figma-style pill)
// ============================================================

interface ToggleGroupProps<T extends string> {
    value: T
    options: { value: T; icon: React.ReactNode; title?: string; label?: string }[]
    onChange: (value: T) => void
    className?: string
    /** Size variant */
    size?: 'sm' | 'md'
}

export function ToggleGroup<T extends string>({
    value,
    options,
    onChange,
    className,
    size = 'sm',
}: ToggleGroupProps<T>) {
    const h = size === 'sm' ? 'h-6' : 'h-7'
    const px = size === 'sm' ? 'px-1.5' : 'px-2'
    return (
        <div className={cn('flex items-center bg-muted/50 rounded-sm p-0.5 gap-px', className)}>
            {options.map((opt) => (
                <button
                    key={opt.value}
                    className={cn(
                        'flex items-center justify-center gap-1 rounded-sm text-[11px] transition-all',
                        h, px,
                        value === opt.value
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                    )}
                    onClick={() => onChange(opt.value)}
                    title={opt.title}
                >
                    {opt.icon}
                    {opt.label && <span>{opt.label}</span>}
                </button>
            ))}
        </div>
    )
}

// ============================================================
// IconButton — small icon action button
// ============================================================

interface IconButtonProps {
    icon: React.ReactNode
    onClick: () => void
    title?: string
    active?: boolean
    disabled?: boolean
    /** Optional override for disabled visual treatment */
    disabledClassName?: string
    className?: string
}

export function IconButton({ icon, onClick, title, active, disabled, disabledClassName, className }: IconButtonProps) {
    return (
        <button
            className={cn(
                'flex items-center justify-center w-7 h-7 rounded-sm transition-colors',
                active
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                disabled && (disabledClassName ?? 'opacity-30 cursor-not-allowed'),
                className
            )}
            onClick={onClick}
            title={title}
            disabled={disabled}
        >
            {icon}
        </button>
    )
}

// ============================================================
// Checkbox — Figma-style toggle
// ============================================================

interface CheckboxProps {
    checked: boolean
    onChange: (checked: boolean) => void
    label?: string
    className?: string
}

export function Checkbox({ checked, onChange, label, className }: CheckboxProps) {
    return (
        <label className={cn('flex items-center gap-2 cursor-pointer group', className)}>
            <div
                className={cn(
                    'w-3.5 h-3.5 rounded-sm border transition-colors flex items-center justify-center',
                    checked
                        ? 'bg-foreground border-foreground'
                        : 'border-muted-foreground/40 group-hover:border-muted-foreground/60'
                )}
                onClick={(e) => { e.preventDefault(); onChange(!checked) }}
            >
                {checked && (
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" className="text-background">
                        <path d="M1.5 4L3 5.5L6.5 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                )}
            </div>
            {label && (
                <span className="text-[11px] text-muted-foreground select-none">
                    {label}
                </span>
            )}
        </label>
    )
}
