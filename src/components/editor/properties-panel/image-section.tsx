'use client'

import { useRef } from 'react'
import type { ImageNode } from '@/types/canvas'
import { Section, TextInput, SelectInput } from './inputs'
import { Upload, ImageIcon } from 'lucide-react'

interface ImageSectionProps {
    node: ImageNode
    onUpdate: (updates: Record<string, unknown>) => void
}

export function ImageSection({ node, onUpdate }: ImageSectionProps) {
    const fileRef = useRef<HTMLInputElement>(null)

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        const url = URL.createObjectURL(file)
        onUpdate({ src: url, isPlaceholder: false })
    }

    return (
        <Section title="Image">
            {/* Preview / Upload */}
            {node.src && !node.isPlaceholder ? (
                <div className="relative rounded border border-border/50 overflow-hidden aspect-video bg-muted/20">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={node.src}
                        alt={node.alt}
                        className="w-full h-full object-cover"
                    />
                    <button
                        className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 bg-black/40 transition-opacity"
                        onClick={() => fileRef.current?.click()}
                    >
                        <Upload size={14} className="text-white" />
                    </button>
                </div>
            ) : (
                <button
                    className="flex items-center justify-center gap-1.5 w-full h-16 rounded border border-dashed border-border/50 text-[10px] text-muted-foreground/60 hover:border-border hover:text-muted-foreground transition-colors"
                    onClick={() => fileRef.current?.click()}
                >
                    <ImageIcon size={14} />
                    Upload image
                </button>
            )}
            <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
            />

            {/* Source URL */}
            <TextInput
                value={node.src}
                onChange={(v) => onUpdate({ src: v, isPlaceholder: !v })}
                placeholder="Image URL..."
            />

            {/* Alt + Fit */}
            <TextInput
                value={node.alt}
                onChange={(v) => onUpdate({ alt: v })}
                placeholder="Alt text..."
            />
            <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground/60 w-5 shrink-0">Fit</span>
                <SelectInput
                    value={node.fit}
                    options={[
                        { value: 'cover', label: 'Cover' },
                        { value: 'contain', label: 'Contain' },
                        { value: 'fill', label: 'Fill' },
                    ]}
                    onChange={(v) => onUpdate({ fit: v })}
                    className="flex-1"
                />
            </div>
        </Section>
    )
}
