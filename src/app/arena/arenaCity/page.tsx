"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const IsostadtCanvas = dynamic(() => import("@/components/arena/isostadt/IsostadtCanvas"), { ssr: false });

export default function ArenaCityPage() {
  const [topOffset, setTopOffset] = useState(0);

  useEffect(() => {
    const header = (document.querySelector('header[role="banner"], [role="banner"], header') as HTMLElement) || null;
    const h = header ? Math.ceil(header.getBoundingClientRect().height) : 0;
    setTopOffset(h);
  }, []);

  return (
    <main className="p-0 m-0 max-w-none">
      <div className="fixed bg-white" style={{ left: 0, right: 0, bottom: 0, top: topOffset }}>
        <a
          href="/arena"
          className="absolute left-3 top-3 z-10 rounded bg-white/90 backdrop-blur px-3 py-1.5 text-sm font-medium text-gray-800 shadow hover:bg-white"
        >
          ← Zurück
        </a>
        <IsostadtCanvas />
      </div>
    </main>
  );
}
