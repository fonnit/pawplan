import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PawPlan',
  description: 'Self-serve wellness-plan builder for independent vet clinics.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
