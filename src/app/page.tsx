import { LandingHeader } from '@/components/layout/landing-header'
import { HeroSection } from '@/components/landing/hero-section'
import { PhaseFlowSection } from '@/components/landing/phase-flow-section'
import { FeatureShowcaseSection } from '@/components/landing/feature-showcase-section'
import { WorkspaceSection } from '@/components/landing/workspace-section'
import { ProofSection } from '@/components/landing/proof-section'
import { CTASection } from '@/components/landing/cta-section'
import { LandingFooter } from '@/components/landing/landing-footer'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <LandingHeader />

      {/* Hero */}
      <HeroSection />

      {/* How it works — 3-step flow */}
      <PhaseFlowSection />

      {/* Feature deep-dives — alternating split-view */}
      <FeatureShowcaseSection />

      {/* Workspace tour — bento grid */}
      <WorkspaceSection />

      {/* Social proof */}
      <ProofSection />

      {/* Final CTA */}
      <CTASection />

      {/* Footer — shifting reveal on scroll */}
      <LandingFooter />
    </div>
  )
}
