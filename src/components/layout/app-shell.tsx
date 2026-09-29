'use client';

import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { OnboardingTour } from '@/components/tour/onboarding-tour';
import { cn } from '@/lib/utils';
import { isWorkspaceRoute } from '@/lib/layout';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const workspace = isWorkspaceRoute(usePathname());

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
            ends of a 1400px row. A workspace fills the window on large
            screens and scrolls inside its own panes instead. */}
        <main className={cn('flex-1 overflow-x-hidden overflow-y-auto', workspace && 'lg:overflow-y-hidden')}>
          <div
            className={cn(
              'px-4 py-6 sm:px-6 lg:px-8',
              workspace ? 'workspace-shell lg:h-full lg:py-6' : 'page-shell lg:py-8',
            )}
          >
            {children}
          </div>
        </main>
      </div>

      <OnboardingTour />
    </div>
  );
}
