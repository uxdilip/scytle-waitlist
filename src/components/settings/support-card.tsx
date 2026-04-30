import React from 'react'
import Image from 'next/image'
import { ArrowUpRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface SupportCardProps {
    title: string
    description: string
    actionText: string
    onAction: () => void
    imageSrc?: string
    imageAlt?: string
    variant?: 'gray' | 'white'
    className?: string
}

export function SupportCard({
    title,
    description,
    actionText,
    onAction,
    imageSrc,
    imageAlt,
    variant = 'gray',
    className
}: SupportCardProps) {
    return (
        <div className={cn(
            "group flex flex-col rounded-[24px] border border-border/40 overflow-hidden transition-all duration-500",
            variant === 'gray' ? "bg-[#F7F7F7]" : "bg-white",
            className
        )}>
            {/* Top Text Content */}
            <div className="flex flex-col flex-1 p-12 pr-16">
                <h3 className="text-2xl font-display font-bold mb-4 tracking-tight text-black">{title}</h3>
                <p className="text-[#4B5563] text-[17px] leading-relaxed mb-10 flex-1 font-medium">
                    {description}
                </p>
                
                <div className="flex">
                    <Button 
                        variant="ghost"
                        onClick={onAction}
                        className="h-auto p-0 text-black font-bold text-lg hover:bg-transparent group/btn transition-all flex items-center gap-2"
                    >
                        <span className="border-b-2 border-transparent group-hover/btn:border-black transition-all">
                            {actionText}
                        </span>
                        <ArrowUpRight className="w-5 h-5 transition-transform group-hover/btn:translate-x-1 group-hover/btn:-translate-y-1" />
                    </Button>
                </div>
            </div>

            {/* Bottom Image (for Community/Mosaic style) */}
            {imageSrc && (
                <div className="relative h-[240px] w-full overflow-hidden mt-auto border-t border-border/20">
                    <Image 
                        src={imageSrc} 
                        alt={imageAlt || title} 
                        fill 
                        className="object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                </div>
            )}
        </div>
    )
}
