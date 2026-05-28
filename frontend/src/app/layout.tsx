import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VedaAI – AI Assessment Creator',
  description: 'Create AI-powered question papers and assessments for your classes. Built for teachers to generate structured exam papers in seconds.',
  keywords: ['AI assessment', 'question paper generator', 'education', 'teacher tool'],
  openGraph: {
    title: 'VedaAI – AI Assessment Creator',
    description: 'Generate AI-powered question papers for your classes instantly.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
