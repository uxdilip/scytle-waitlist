'use client'

import React, { useState, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import { useEditorStore } from '@/store/editor-store'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function ZoomControls() {
    const zoom = useEditorStore((s) => s.zoom)
    const zoomIn = useEditorStore((s) => s.zoomIn)
    const zoomOut = useEditorStore((s) => s.zoomOut)
    const zoomToFit = useEditorStore((s) => s.zoomToFit)
    const setZoom = useEditorStore((s) => s.setZoom)
    
    const pct = Math.round(zoom * 100)
    const [inputValue, setInputValue] = useState(`${pct}%`)

    // Sync input value with zoom store changes
    useEffect(() => {
        setInputValue(`${pct}%`)
    }, [pct])

    const handleInputSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        const parsed = parseFloat(inputValue.replace('%', ''))
        if (!isNaN(parsed) && parsed > 0) {
            setZoom(parsed / 100)
            setInputValue(`${parsed}%`)
        } else {
            setInputValue(`${pct}%`) // reset on invalid
        }
    }

    return (
        <div className="flex items-center select-none">
            <DropdownMenu>
                <DropdownMenuTrigger className="flex justify-between items-center gap-1 h-8 px-2 rounded-lg text-xs font-medium text-foreground hover:bg-muted/60 transition-colors focus:outline-none">
                    <span>{pct}%</span>
                    <ChevronDown className="w-3.5 h-3.5 opacity-70" />
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56 mt-2 font-medium" align="end" sideOffset={4}>
                    <div className="p-1">
                        <form onSubmit={handleInputSubmit}>
                            <input
                                type="text"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={(e) => e.stopPropagation()} // Prevent triggering canvas shortcuts
                                className="w-full bg-muted/50 border border-transparent hover:border-border/50 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-border transition-all"
                            />
                        </form>
                    </div>
                    
                    <DropdownMenuSeparator />
                    
                    <DropdownMenuItem onClick={zoomIn} className="focus:bg-foreground focus:text-background justify-between py-2 cursor-default">
                        <span>Zoom in</span>
                        <span className="text-[10px] tracking-widest font-sans font-normal opacity-60">Ctrl++</span>
                    </DropdownMenuItem>
                    
                    <DropdownMenuItem onClick={zoomOut} className="focus:bg-foreground focus:text-background justify-between py-2 cursor-default">
                        <span>Zoom out</span>
                        <span className="text-[10px] tracking-widest font-sans font-normal opacity-60">Ctrl+-</span>
                    </DropdownMenuItem>
                    
                    <DropdownMenuItem onClick={zoomToFit} className="focus:bg-foreground focus:text-background justify-between py-2 cursor-default">
                        <span>Zoom to fit</span>
                        <span className="text-[10px] tracking-widest font-sans font-normal opacity-60">Shift+1</span>
                    </DropdownMenuItem>
                    
                    <DropdownMenuItem onClick={() => setZoom(0.5)} className="focus:bg-foreground focus:text-background py-2 cursor-default">
                        Zoom to 50%
                    </DropdownMenuItem>
                    
                    <DropdownMenuItem onClick={() => setZoom(1)} className="focus:bg-foreground focus:text-background justify-between py-2 cursor-default">
                        <span>Zoom to 100%</span>
                        <span className="text-[10px] tracking-widest font-sans font-normal opacity-60">Ctrl+0</span>
                    </DropdownMenuItem>
                    
                    <DropdownMenuItem onClick={() => setZoom(2)} className="focus:bg-foreground focus:text-background py-2 cursor-default">
                        Zoom to 200%
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    )
}
