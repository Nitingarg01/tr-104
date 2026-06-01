'use client'

import { CollegeHeader } from '@/components/CollegeHeader'
import { HeroSection } from '@/components/HeroSection'

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-neutral-50">
      <CollegeHeader />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-8">
          <div className="text-center space-y-4">
            <h1 className="text-3xl font-bold text-neutral-900">
              3D Interactive Experience
            </h1>
            <p className="text-lg text-neutral-600 max-w-2xl mx-auto">
              Explore our immersive 3D scenes powered by Spline. 
              This professional interface showcases modern web design 
              with interactive 3D elements.
            </p>
          </div>

          <HeroSection />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
            <div className="bg-white p-6 rounded-xl border border-neutral-200">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                <span className="text-2xl">🎓</span>
              </div>
              <h3 className="text-lg font-semibold text-neutral-900 mb-2">
                Academic Programs
              </h3>
              <p className="text-neutral-600 text-sm">
                Explore our comprehensive range of undergraduate and graduate programs.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl border border-neutral-200">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
                <span className="text-2xl">🔬</span>
              </div>
              <h3 className="text-lg font-semibold text-neutral-900 mb-2">
                Research Excellence
              </h3>
              <p className="text-neutral-600 text-sm">
                Join our cutting-edge research initiatives and innovation labs.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl border border-neutral-200">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                <span className="text-2xl">🌍</span>
              </div>
              <h3 className="text-lg font-semibold text-neutral-900 mb-2">
                Global Community
              </h3>
              <p className="text-neutral-600 text-sm">
                Connect with students and alumni from around the world.
              </p>
            </div>
          </div>
        </div>
      </main>

      <footer className="bg-neutral-900 text-white py-12 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <h4 className="font-semibold mb-4">Tech University</h4>
              <p className="text-neutral-400 text-sm">
                Excellence in Innovation since 1965
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Quick Links</h4>
              <ul className="space-y-2 text-sm text-neutral-400">
                <li><a href="#" className="hover:text-white transition-colors">Academics</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Research</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Campus Life</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Resources</h4>
              <ul className="space-y-2 text-sm text-neutral-400">
                <li><a href="#" className="hover:text-white transition-colors">Library</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Student Portal</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Career Services</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Contact</h4>
              <ul className="space-y-2 text-sm text-neutral-400">
                <li>123 University Ave</li>
                <li>tech@university.edu</li>
                <li>(555) 123-4567</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-neutral-800 mt-8 pt-8 text-center text-sm text-neutral-500">
            © 2026 Tech University. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  )
}
