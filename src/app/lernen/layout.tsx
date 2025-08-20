import { ReactNode } from 'react';

// Gäste sollen die Lernübersicht sehen können (nur veröffentlichte Kurse).
// Kein serverseitiger Redirect hier; Rollen/Gating übernimmt die Seite und die APIs.
export default async function LernenLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
