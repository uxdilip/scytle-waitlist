import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  ArrowUp,
  Globe,
  Layers,
  MousePointerClick,
  Palette,
  Play,
  Plus,
  Share2,
  Sparkles,
  Wand2,
} from 'lucide-react'
import { ScrollReveal } from '@/components/ui/scroll-reveal'

export function PhaseFlowSection() {
  return (
    <section id="how-it-works" className="relative py-12 md:py-20 lg:py-24">
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-secondary/30 to-transparent" />

      <div className="mx-auto w-full max-w-5xl px-6">
        <ScrollReveal>
          <div className="text-center md:text-left">
            <h2 className="text-foreground mx-auto md:mx-0 max-w-2xl text-balance text-4xl font-semibold font-display">
              From prompt to production<br />
              in 3 steps
            </h2>
          </div>
        </ScrollReveal>
        
        <div className="mt-16 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {/* Step 1: Generate */}
            <ScrollReveal delay={0.1}>
              <Card
                variant="soft"
                className="h-full overflow-hidden p-6"
              >
                <Wand2 className="text-foreground size-5" />
                <h3 className="text-foreground mt-5 text-lg font-semibold">Prompt to Page</h3>
                <p className="text-muted-foreground mt-3 text-balance">
                  Type what you want. AI builds full pages with real Unsplash images — hero, features, footer, all of it.
                </p>

                <PromptIllustration />
              </Card>
            </ScrollReveal>

            {/* Step 2: Edit */}
            <ScrollReveal delay={0.2}>
              <Card
                variant="soft"
                className="group h-full overflow-hidden px-6 pt-6"
              >
                <MousePointerClick className="text-foreground size-5" />
                <h3 className="text-foreground mt-5 text-lg font-semibold">Select &amp; Refine</h3>
                <p className="text-muted-foreground mt-3 text-balance">
                  Click any section, describe the changes. AI edits in-place — iterate as many times as you want.
                </p>

                <EditIllustration />
              </Card>
            </ScrollReveal>

            {/* Step 3: Ship */}
            <ScrollReveal delay={0.3}>
              <Card
                variant="soft"
                className="group h-full overflow-hidden px-6 pt-6"
              >
                <Share2 className="text-foreground size-5" />
                <h3 className="text-foreground mt-5 text-lg font-semibold">Share &amp; Export</h3>
                <p className="text-muted-foreground mt-3 text-balance">
                  Share a public link with anyone. Export as PNG, SVG, or HTML — ready for handoff.
                </p>

                <div className="mask-b-from-50 -mx-2 -mt-2 px-2 pt-2">
                  <ExportIllustration />
                </div>
              </Card>
            </ScrollReveal>
          </div>
        </div>
    </section>
  )
}

/* =========================================
   Illustration: Prompt → Page Generation
   Mimics the Scytle chat → canvas flow
   ========================================= */
const PromptIllustration = () => {
  return (
    <Card
      aria-hidden
      className="mt-9 aspect-video p-4"
    >
      <div className="mb-0.5 text-sm font-semibold">New Design</div>
      <div className="mb-4 flex gap-2 text-sm">
        <span className="text-muted-foreground">Chat → Canvas</span>
      </div>
      <div className="mb-2 flex -space-x-1.5">
        <div className="flex -space-x-1.5">
          {[
            { icon: Sparkles, label: 'AI' },
            { icon: Layers, label: 'Layers' },
            { icon: Palette, label: 'Design' },
          ].map((item, index) => (
            <div
              key={index}
              className="bg-background size-7 rounded-full border p-0.5 shadow shadow-zinc-950/5 flex items-center justify-center"
            >
              <item.icon className="size-3.5 text-muted-foreground" />
            </div>
          ))}
        </div>
      </div>
      <div className="text-muted-foreground text-sm font-medium">
        &quot;Design a travel website with a hero, destinations grid, and testimonials&quot;
      </div>
    </Card>
  )
}

/* =========================================
   Illustration: Select & Edit in-place
   Shows the edit card + design panel pattern
   ========================================= */
const EditIllustration = () => {
  return (
    <div
      aria-hidden
      className="relative mt-6"
    >
      {/* Chat edit card */}
      <Card className="aspect-video w-4/5 translate-y-4 p-3 transition-transform duration-200 ease-in-out group-hover:-rotate-3">
        <div className="mb-3 flex items-center gap-2">
          <div className="bg-foreground/10 size-6 rounded-full flex items-center justify-center">
            <Sparkles className="size-3.5 text-foreground" />
          </div>
          <span className="text-muted-foreground text-sm font-medium">AI Edit</span>
          <span className="text-muted-foreground/75 text-xs">just now</span>
        </div>

        <div className="ml-8 space-y-2">
          <div className="bg-foreground/10 h-2 rounded-full" />
          <div className="bg-foreground/10 h-2 w-3/5 rounded-full" />
          <div className="bg-foreground/10 h-2 w-1/2 rounded-full" />
        </div>

        <MousePointerClick className="ml-8 mt-3 size-5 text-foreground" />
      </Card>

      {/* Properties panel card */}
      <Card className="aspect-3/5 absolute -top-4 right-0 flex w-2/5 translate-y-4 p-2 transition-transform duration-200 ease-in-out group-hover:rotate-3">
        <div className="bg-foreground/5 m-auto flex size-10 rounded-full">
          <Palette className="m-auto size-4 text-muted-foreground" />
        </div>
      </Card>
    </div>
  )
}

/* =========================================
   Illustration: Share & Export
   Shows the prompt-to-export flow
   ========================================= */
const ExportIllustration = () => {
  return (
    <Card
      aria-hidden
      className="mt-6 aspect-video translate-y-4 p-4 pb-6 transition-transform duration-200 group-hover:translate-y-0"
    >
      <div className="w-fit">
        <Share2 className="size-3.5 text-foreground" />
        <p className="mt-2 line-clamp-2 text-sm">
          Export as PNG @2x, SVG, and production HTML in one click.
        </p>
      </div>
      <div className="bg-foreground/5 -mx-3 -mb-3 mt-3 space-y-3 rounded-lg p-3">
        <div className="text-muted-foreground text-sm">Share or export</div>

        <div className="flex justify-between">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              className="size-7 rounded-2xl bg-transparent shadow-none"
            >
              <Plus />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-7 rounded-2xl bg-transparent shadow-none"
            >
              <Globe />
            </Button>
          </div>

          <Button
            size="icon"
            className="size-7 rounded-2xl bg-foreground text-background"
          >
            <ArrowUp strokeWidth={3} />
          </Button>
        </div>
      </div>
    </Card>
  )
}
