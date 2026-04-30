import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ArrowRight, CheckCircle2, Zap } from 'lucide-react'
import { joinWaitlist } from './actions/waitlist'

export default function WaitlistPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6 sm:p-12">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-neutral-900/50 via-background to-background -z-10" />

      <main className="max-w-2xl w-full flex flex-col items-center text-center space-y-12">
        <div className="space-y-6 flex flex-col items-center">
          <Badge variant="outline" className="px-3 py-1 rounded-full border-neutral-800 bg-neutral-950/50 backdrop-blur-sm text-neutral-300">
            <Zap className="w-3.5 h-3.5 mr-2 text-primary" />
            Scytle Beta
          </Badge>

          <h1 className="text-5xl sm:text-7xl font-bold tracking-tight text-balance">
            Design at the speed of <span className="text-transparent bg-clip-text bg-gradient-to-r from-neutral-200 to-neutral-500">thought.</span>
          </h1>

          <p className="text-xl text-neutral-400 max-w-xl text-balance">
            The first AI-native design canvas that actually understands how you build. Generate, edit, and ship production-ready interfaces instantly.
          </p>
        </div>

        <div className="w-full max-w-md bg-neutral-900/30 border border-neutral-800/50 backdrop-blur-md p-8 rounded-2xl shadow-2xl">
          <h2 className="text-lg font-medium mb-6 text-neutral-200">Join the exclusive Beta Waitlist</h2>
          
          <form action={joinWaitlist} className="space-y-4">
            <div className="space-y-2">
              <Input 
                type="email" 
                name="email"
                placeholder="you@company.com" 
                required
                className="h-12 bg-neutral-950 border-neutral-800 focus-visible:ring-1 focus-visible:ring-neutral-700 placeholder:text-neutral-600"
              />
            </div>
            
            <Button type="submit" className="w-full h-12 text-base font-medium rounded-xl group relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-neutral-800 to-neutral-700 group-hover:opacity-0 transition-opacity duration-300" />
              <div className="absolute inset-0 bg-gradient-to-r from-neutral-700 to-neutral-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <span className="relative flex items-center justify-center">
                Get Early Access
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </span>
            </Button>
          </form>
          
          <div className="mt-6 flex items-center justify-center space-x-2 text-sm text-neutral-500">
            <CheckCircle2 className="w-4 h-4 text-green-500/80" />
            <span>Limited spots available</span>
          </div>
        </div>

        <div className="flex items-center space-x-6 text-sm text-neutral-600">
          <span>Generate</span>
          <span className="w-1 h-1 rounded-full bg-neutral-800" />
          <span>Edit</span>
          <span className="w-1 h-1 rounded-full bg-neutral-800" />
          <span>Share</span>
          <span className="w-1 h-1 rounded-full bg-neutral-800" />
          <span>Export</span>
        </div>
      </main>
    </div>
  )
}
