'use client';

import React, { useState } from 'react';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { OnboardingTour } from '@/components/tour/onboarding-tour';
import { cn } from '@/lib/utils';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    // 100dvh rather than h-screen: h-screen jumps when mobile browser chrome
    // collapses, which shifted the whole studio on scroll.
    <div className="studio-grain flex h-[100dvh] w-full overflow-hidden bg-background" dir="rtl">
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
          aria-hidden
        />
      )}

      <div
        className={cn(
          'fixed inset-y-0 right-0 z-50 w-[17rem] transition-transform duration-300 ease-[var(--ease-out-quint)]',
          'lg:static lg:w-64 lg:flex-shrink-0 lg:translate-x-0',
          isMobileMenuOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0',
        )}
      >
        <Sidebar onClose={() => setIsMobileMenuOpen(false)} />
      </div>

      <div className="relative flex w-full min-w-0 flex-1 flex-col overflow-hidden">
        <Header onMenuClick={() => setIsMobileMenuOpen(true)} />

        {/* The single place page width is decided. Without this every page
            stretched edge-to-edge, stranding headings and actions at opposite
            ends of a 1400px row. */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="page-shell px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {children}
          </div>
        </main>
      </div>

      <OnboardingTour />
    </div>
  );
}
