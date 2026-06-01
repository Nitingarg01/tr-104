'use client'

import { SplineScene } from "@/components/ui/spline";
import { Card } from "@/components/ui/Card"
import { Spotlight } from "@/components/ui/spotlight"
 
export function HeroSection() {
  return (
    <Card className="w-full h-[600px] bg-black/[0.96] relative overflow-hidden">
      <Spotlight
        className="-top-40 left-0 md:left-60 md:-top-20"
        fill="white"
      />
      
      <div className="flex h-full">
        <div className="flex-1 p-8 relative z-10 flex flex-col justify-center">
          <h1 className="text-4xl md:text-5xl font-bold text-white">
            Podcast Insight Studio
          </h1>
          <p className="mt-4 text-neutral-300 max-w-lg">
            Transform your podcast content with AI-powered transcription, 
            topic detection, and intelligent summarization. Unlock insights 
            from every episode.
          </p>
          <div className="mt-8 flex gap-4">
            <button className="px-6 py-3 bg-white text-black font-semibold rounded-lg hover:bg-neutral-200 transition-colors">
              Get Started
            </button>
            <button className="px-6 py-3 border border-white/30 text-white font-semibold rounded-lg hover:bg-white/10 transition-colors">
              Learn More
            </button>
          </div>
        </div>

        <div className="flex-1 relative">
          <SplineScene 
            scene="https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode"
            className="w-full h-full"
          />
        </div>
      </div>
    </Card>
  )
}
