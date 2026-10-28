import { SiteHeader } from "@/components/grinflow/site-header"
import { HeroSection } from "@/components/grinflow/hero-section"
import { ProblemSection } from "@/components/grinflow/problem-section"
import { LearnedSection } from "@/components/grinflow/learned-section"
import { PhilosophySection } from "@/components/grinflow/philosophy-section"
import { HowItWorksSection } from "@/components/grinflow/how-it-works-section"
import { DemoSection } from "@/components/grinflow/demo-section"
import { StorySection } from "@/components/grinflow/story-section"
import { StatusSection } from "@/components/grinflow/status-section"
import { VisionFooter } from "@/components/grinflow/vision-footer"

export default function Home() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <HeroSection />
        <ProblemSection />
        <LearnedSection />
        <PhilosophySection />
        <HowItWorksSection />
        <DemoSection />
        <StorySection />
        <StatusSection />
      </main>
      <VisionFooter />
    </div>
  )
}
