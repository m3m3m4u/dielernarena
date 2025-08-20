import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Isostadt',
};

export default function Layout({ children }: { children: ReactNode }) {
  // Segment-Layout: umschließt die Isostadt-Seiten ohne <html>/<body>
  return <section>{children}</section>;
}
