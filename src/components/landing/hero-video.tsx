'use client'

import { useState } from 'react'
import { Play } from 'lucide-react'
import { cn } from '@/lib/utils'

interface HeroVideoProps {
  videoId: string
}

export function HeroVideo({ videoId }: HeroVideoProps) {
  const [isInteractive, setIsInteractive] = useState(false)

  return (
    <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl bg-muted/20">
      {!isInteractive && (
        <div 
          className="absolute inset-0 z-10 flex cursor-pointer items-center justify-center bg-transparent group"
          onClick={() => setIsInteractive(true)}
        >
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-background/80 text-foreground shadow-lg backdrop-blur-sm transition-transform group-hover:scale-110">
            <Play className="h-8 w-8 ml-1" fill="currentColor" />
          </div>
        </div>
      )}
      
      <iframe
        src={`https://www.youtube.com/embed/${videoId}?autoplay=1&loop=1&playlist=${videoId}&playsinline=1&rel=0&modestbranding=1&iv_load_policy=3${
          isInteractive ? '&mute=0&controls=1' : '&mute=1&controls=0'
        }`}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className={cn(
          "h-full w-full border-0",
          !isInteractive && "pointer-events-none"
        )}
      />
    </div>
  )
}
