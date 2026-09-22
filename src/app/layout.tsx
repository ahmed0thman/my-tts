import type { Metadata } from 'next';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import QueryProvider from '@/providers/query-provider';
// Trigger CSS reload
import './globals.css';

export const metadata: Metadata = {
  title: 'صوتك · Sawtak',
  description: 'نطق عربي بصوتك إنت — تحويل نص لكلام واستنساخ صوت، كله على جهازك.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <QueryProvider>
            {children}
            <Toaster richColors position="top-center" dir="rtl" />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
