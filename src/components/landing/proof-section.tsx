import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ScrollReveal } from '@/components/ui/scroll-reveal'

export function ProofSection() {
  return (
    <section className="py-16 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16">
          
          {/* Founder 1 */}
          <ScrollReveal delay={0.1}>
            <blockquote className="flex h-full flex-col justify-between">
              <p className="text-lg font-medium md:text-2xl text-balance">
                "Built by founders who believe design tools should be
                simpler, smarter, and free to start. Scytle is the tool we wished
                existed — so we built it."
              </p>

              <div className="mt-10 flex items-center gap-5">
                <Avatar className="size-12">
                  <AvatarImage
                    src="/Profile/Dilip.jpeg"
                    alt="Dilip"
                    height="400"
                    width="400"
                    loading="lazy"
                  />
                  <AvatarFallback>DP</AvatarFallback>
                </Avatar>

                <div className="space-y-1 border-l border-border/60 pl-5 text-left">
                  <cite className="font-medium not-italic">Dilip</cite>
                  <span className="text-muted-foreground block text-sm">
                    Co-Founder, Scytle
                  </span>
                </div>
              </div>
            </blockquote>
          </ScrollReveal>

          {/* Founder 2 */}
          <ScrollReveal delay={0.2}>
            <blockquote className="flex h-full flex-col justify-between">
              <p className="text-lg font-medium md:text-2xl text-balance">
                "We wanted to build an AI canvas that doesn't just generate templates, 
                but gives you absolute control over every pixel in a familiar way."
              </p>

              <div className="mt-10 flex items-center gap-5">
                <Avatar className="size-12">
                  <AvatarImage
                    src="/Profile/Diksha.jpeg"
                    alt="Diksha"
                    height="400"
                    width="400"
                    loading="lazy"
                  />
                  <AvatarFallback>DK</AvatarFallback>
                </Avatar>

                <div className="space-y-1 border-l border-border/60 pl-5 text-left">
                  <cite className="font-medium not-italic">Diksha</cite>
                  <span className="text-muted-foreground block text-sm">
                    Co-Founder, Scytle
                  </span>
                </div>
              </div>
            </blockquote>
          </ScrollReveal>

        </div>
      </div>
    </section>
  )
}
