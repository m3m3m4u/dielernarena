"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";

type Props = {
  width?: number;
  height?: number;
};

// Spritesheet: /public/media/01_130x66_130x230.png
const TILE_W = 130;
const TILE_H = 230;
// Isometrische Oberseite (sichtbare Raute) 128×64 im 130×66-Frame
const ISO_W = 128;
const ISO_H = 64;
// Mittelpunkt der Oberseite im Sprite (Feinabgleich)
const TOPFACE_CENTER_Y = 33;

// Spritesheet-Layout-Annahme: 12 Spalten × 6 Zeilen = 72 Kacheln (Index 0..71)
const SHEET_COLS = 12;
const TOTAL_TILES = 72;
// Sichtbare Kacheln pro Kategorie
const ROAD_TILE_INDICES = [2,3,4,5,6,7,8,9,38,39,40,41] as const;
const HOUSE_TILE_INDICES = [59,60,61,62,63] as const; // Wohnhäuser
// Metadaten zu Wohnhäusern: Name und Preis
const HOUSE_META: Record<number, { name: string; price: number }> = {
  59: { name: "Kleines Wohnhaus", price: 100 },
  60: { name: "Familienhaus", price: 200 },
  61: { name: "Mehrfamilienhaus", price: 350 },
  62: { name: "Apartmentblock", price: 500 },
  63: { name: "Villa", price: 800 },
};
const MARKET_TILE_INDICES = [47,54,56] as const; // Supermarkt
const TOWNHOUSE_TILE_INDICES = [64,65,70] as const; // Stadthaus
const KIOSK_TILE_INDICES = [66,69] as const; // Kiosk
const OFFICE_TILE_INDICES = [46,55,57,58] as const; // Bürogebäude
// Metadaten für Straßen (Name, Preis)
const ROAD_META: Record<number, { name: string; price: number }> = {
  2: { name: "Straße", price: 10 },
  3: { name: "Straße", price: 10 },
  4: { name: "Zebrastreifen", price: 15 },
  5: { name: "Zebrastreifen", price: 15 },
  6: { name: "Allee", price: 15 },
  7: { name: "Allee", price: 15 },
  8: { name: "Kreisverkehr", price: 25 },
  9: { name: "Kreuzung", price: 25 },
  38: { name: "Kurve", price: 10 },
  39: { name: "Kurve", price: 10 },
  40: { name: "Kurve", price: 10 },
  41: { name: "Kurve", price: 10 },
};
// Metadaten je Kategorie (Name, Preis)
const MARKET_META: Record<number, { name: string; price: number }> = {
  47: { name: "Supermarkt (klein)", price: 450 },
  54: { name: "Supermarkt (mittel)", price: 650 },
  56: { name: "Supermarkt (groß)", price: 900 },
};
const TOWNHOUSE_META: Record<number, { name: string; price: number }> = {
  64: { name: "Stadthaus A", price: 400 },
  65: { name: "Stadthaus B", price: 520 },
  70: { name: "Stadthaus C", price: 680 },
};
const KIOSK_META: Record<number, { name: string; price: number }> = {
  66: { name: "Kiosk", price: 120 },
  69: { name: "Kiosk (Ecke)", price: 150 },
};
const OFFICE_META: Record<number, { name: string; price: number }> = {
  46: { name: "Bürogebäude (klein)", price: 700 },
  55: { name: "Bürogebäude (mittel)", price: 950 },
  57: { name: "Bürogebäude (hoch)", price: 1250 },
  58: { name: "Bürokomplex", price: 1600 },
};

export default function IsostadtCanvas({ width, height }: Props) {
  const { data: session } = useSession();
  const bgRef = useRef<HTMLCanvasElement | null>(null);
  const fgRef = useRef<HTMLCanvasElement | null>(null);
  const areaRef = useRef<HTMLDivElement | null>(null);
  const redrawRef = useRef<() => void>(() => {});
  const saveRef = useRef<() => void>(() => {});
  const saveTimer = useRef<NodeJS.Timeout | null>(null);
  const mapKey = useRef<string>('default');
  type Panel = "roads" | "houses" | "market" | "townhouse" | "kiosk" | "office" | null;
  const [activePanel, setActivePanel] = useState<Panel>(null);
  const [panMode, setPanMode] = useState(false);
  const [inspectMode, setInspectMode] = useState(false);
  const inspectModeRef = useRef(false);
  const [demolishMode, setDemolishMode] = useState(false);
  const demolishModeRef = useRef(false);
  const [inspect, setInspect] = useState<null | { idx: number; name: string; price: number; type: "house" | "road" | "building"; posI: number; posJ: number } & { taxes?: number; population?: number }>(null);
  const inspectRef = useRef<typeof inspect>(null);
  const [selectedTileIndex, setSelectedTileIndex] = useState<number | null>(null);
  const [gridXOffset, setGridXOffset] = useState(0); // px
  const [gridYOffset, setGridYOffset] = useState(0); // px
  // Fraktionale Grid-Verschiebung (in Zellen)
  // Vorgabe: 2 Zellen nach unten (beide Achsen gleich verschoben)
  const [gridOffI, setGridOffI] = useState(2);
  const [gridOffJ, setGridOffJ] = useState(2);
  const [lastModified, setLastModified] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [balance, setBalance] = useState<number>(10000);
  const [stars, setStars] = useState<number>(0);
  const [gridN, setGridN] = useState<number>(16); // aktuelle Boardgröße für UI/Preis
  const [monthReport, setMonthReport] = useState<null | {
    total: number; // Einnahmen dieses Monats
    population: number; // Einwohner gesamt
    newBalance: number; // neues Guthaben nach Einnahmen
  }>(null);
  const balanceRef = useRef(balance);
  const starsRef = useRef(stars);
  useEffect(() => { balanceRef.current = balance; }, [balance]);
  useEffect(() => { starsRef.current = stars; }, [stars]);
  // Wenn Balance/Sterne sich ändern, speichern (debounced via saveRef)
  useEffect(() => { saveRef.current?.(); }, [balance, stars]);

  // Sterne mit Profil synchronisieren
  useEffect(() => {
    const uname = (session?.user as any)?.username as string | undefined;
    if (!uname) return;
    (async () => {
      try {
        const res = await fetch(`/api/user?username=${encodeURIComponent(uname)}`);
        if (!res.ok) return;
        const data = await res.json();
        const st = Number(data?.user?.stars);
        if (Number.isFinite(st)) setStars(st);
      } catch {}
    })();
  }, [session?.user]);

  const panRef = useRef(false);
  const toolRef = useRef<[number, number] | null>(null); // [row, col]
  const inspectByClickRef = useRef(false);
  const nextMonthRef = useRef<() => void>(() => {});
  const expandGridRef = useRef<() => void>(() => {});

  useEffect(() => {
    panRef.current = panMode;
    updateCursor();
  }, [panMode]);
  useEffect(() => {
    inspectModeRef.current = inspectMode;
    updateCursor();
    // Beim Wechsel in/aus den Inspektionsmodus: immer zurücksetzen,
    // damit keine Zone ohne Klick sichtbar ist
    inspectByClickRef.current = false;
    setInspect(null);
    // Optional neu zeichnen, um den Zustand zu reflektieren
    if (inspectMode) {
      redrawRef.current?.();
    }
  }, [inspectMode]);
  useEffect(() => { inspectRef.current = inspect; redrawRef.current?.(); }, [inspect]);
  
  useEffect(() => {
    demolishModeRef.current = demolishMode;
    updateCursor();
  }, [demolishMode]);

  // Lade zuletzt gespeicherten Änderungszeitpunkt (lokal)
  useEffect(() => {
    try {
      const v = localStorage.getItem("isostadt:lastModified");
      if (v) setLastModified(Number(v));
    } catch {}
  }, []);

  // Fehler-Overlay nach kurzer Zeit automatisch ausblenden
  useEffect(() => {
    if (!errorMsg) return;
    const t = setTimeout(() => setErrorMsg(null), 2500);
    return () => clearTimeout(t);
  }, [errorMsg]);

  function updateCursor() {
    const fg = fgRef.current;
    if (!fg) return;
  fg.style.cursor = inspectMode ? "pointer" : demolishModeRef.current ? "crosshair" : panRef.current ? "all-scroll" : toolRef.current ? "crosshair" : "default";
  }

  useEffect(() => {
    const bg = bgRef.current!;
    const fg = fgRef.current!;
    const area = areaRef.current!;

    // Map-Key an eingeloggten Nutzer binden (sonst 'default')
    const uname = (session?.user as any)?.username as string | undefined;
    mapKey.current = uname ? `isostadt:${uname}` : 'default';

    let w = (bg.width = width || area.clientWidth || 1400);
    let h = (bg.height = height || area.clientHeight || 900);
    fg.width = w;
    fg.height = h;

    const resizeToContainer = () => {
      const rect = area.getBoundingClientRect();
      w = Math.max(200, Math.floor(rect.width));
      h = Math.max(200, Math.floor(rect.height));
      bg.width = w;
      bg.height = h;
      fg.width = w;
      fg.height = h;
      drawMap();
  drawHover();
    };
    const ro: ResizeObserver | null = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resizeToContainer) : null;
    if (ro) ro.observe(area);

  const ctx = bg.getContext("2d")!;
  const fgctx = fg.getContext("2d")!;

  // Map
  let n = gridN; // Boardgröße
  let map: [number, number][][] = Array.from({ length: n }, () => Array.from({ length: n }, () => [0, 0]));

  async function loadMapFromDB() {
      try {
  const key = mapKey.current;
  const res = await fetch(`/api/arena/isostadt?key=${encodeURIComponent(key)}`, { cache: 'no-store' as RequestCache, headers: { 'Cache-Control': 'no-store' } });
        if (!res.ok) return;
        const data = await res.json();
        if (data?.success && data?.exists && Array.isArray(data.map) && Number.isFinite(data.n)) {
          // nur übernehmen, wenn Größen kompatibel; andernfalls einfache Bounds-Kopie
          const dn: number = data.n;
          const src: any[][][] = data.map;
          if (dn !== n) {
            // Map und Größe auf gespeicherte Dimension anpassen
            const newMap: [number, number][][] = Array.from({ length: dn }, () => Array.from({ length: dn }, () => [0, 0] as [number, number]));
            for (let i = 0; i < Math.min(dn, src.length); i++) {
              for (let j = 0; j < Math.min(dn, src[i]?.length ?? 0); j++) {
                const cell = src?.[i]?.[j];
                if (Array.isArray(cell) && cell.length === 2 && Number.isFinite(cell[0]) && Number.isFinite(cell[1])) {
                  newMap[i][j] = [cell[0], cell[1]];
                }
              }
            }
            n = dn;
            map = newMap;
            setGridN(dn);
          } else {
            for (let i = 0; i < Math.min(n, dn); i++) {
              for (let j = 0; j < Math.min(n, dn); j++) {
                const cell = src?.[i]?.[j];
                if (Array.isArray(cell) && cell.length === 2 && Number.isFinite(cell[0]) && Number.isFinite(cell[1])) {
                  map[i][j] = [cell[0], cell[1]] as [number, number];
                }
              }
            }
          }
          if (typeof data.lastModified === 'number') {
            setLastModified(data.lastModified);
            try { localStorage.setItem('isostadt:lastModified', String(data.lastModified)); } catch {}
          }
          // Falls Werte fehlen, lokale Defaults beibehalten
          if (typeof data.balance === 'number') setBalance(data.balance);
          else setBalance((b) => b);
          if (typeof data.stars === 'number') setStars(data.stars);
          else setStars((s) => s);
          drawMap();
          drawHover();
        } else if (data?.success && !data?.exists && key !== 'default') {
          // Fallback: 'default' laden
          const resDef = await fetch(`/api/arena/isostadt?key=default`, { cache: 'no-store' as RequestCache, headers: { 'Cache-Control': 'no-store' } });
          if (resDef.ok) {
            const def = await resDef.json();
            if (def?.success && def?.exists && Array.isArray(def.map) && Number.isFinite(def.n)) {
              const dn: number = def.n;
              const src: any[][][] = def.map;
              for (let i = 0; i < Math.min(n, dn); i++) {
                for (let j = 0; j < Math.min(n, dn); j++) {
                  const cell = src?.[i]?.[j];
                  if (Array.isArray(cell) && cell.length === 2 && Number.isFinite(cell[0]) && Number.isFinite(cell[1])) {
                    map[i][j] = [cell[0], cell[1]] as [number, number];
                  }
                }
              }
              if (typeof def.lastModified === 'number') setLastModified(def.lastModified);
              if (typeof def.balance === 'number') setBalance(def.balance);
              if (typeof def.stars === 'number') setStars(def.stars);
              drawMap();
              drawHover();
              // Optional: direkt unter Benutzer-Key speichern
              scheduleSave();
            }
          }
        }
      } catch (e) {
        // Netzwerk/DB-Fehler: lokales Snapshot-Fallback laden
        try {
          const raw = localStorage.getItem('isostadt:snapshot');
          if (raw) {
            const snap = JSON.parse(raw) as { n: number; map: [number, number][][]; lastModified?: number; balance?: number; stars?: number };
            if (snap && Array.isArray(snap.map) && Number.isFinite(snap.n)) {
              n = snap.n;
              map = snap.map as any;
              setGridN(snap.n);
              if (typeof snap.lastModified === 'number') setLastModified(snap.lastModified);
              if (typeof snap.balance === 'number') setBalance(snap.balance);
              if (typeof snap.stars === 'number') setStars(snap.stars);
              drawMap();
              drawHover();
            }
          }
        } catch {}
      }
    }

  function scheduleSave() {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        try {
      // Lokalen Snapshot persistieren (Fallback bei Offline/DB-Problemen)
      try {
        const snap = {
          n,
          map,
          lastModified,
          balance: balanceRef.current,
          stars: starsRef.current,
        };
        localStorage.setItem('isostadt:snapshot', JSON.stringify(snap));
      } catch {}
  const res = await fetch('/api/arena/isostadt', {
            method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ key: mapKey.current, n, map, lastModified, balance: balanceRef.current, stars: starsRef.current }),
          });
          // optional: Fehlerbehandlung
          void res;
        } catch {}
      }, 350);
    }
  // Exponiere das Speichern nach außen (für Toolbar/HUD-Buttons)
  saveRef.current = () => scheduleSave();

    // Texture
    const texture = new Image();
    texture.src = "/media/01_130x66_130x230.png";

    // Pan/Zoom
    let panX = 0, panY = 0, scale = 1;
    const minScale = 0.5, maxScale = 2.5;
    let panning = false;
    let panStart = { x: 0, y: 0 };
    let pointerStart = { x: 0, y: 0 };
    let hover: { x: number; y: number } | null = null;

    // Helfer: berechne Mittelpunkt der Oberseite für Tiles (ohne Grid-Offsets)
    function tileCenter(gx: number, gy: number) {
      return {
        x: ((gy - gx) * ISO_W) / 2,
        y: ((gx + gy) * ISO_H) / 2,
      };
    }

    // Helfer: berechne Mittelpunkt des sichtbaren Rauten-Gitters (mit Grid-Offsets)
    function gridCenter(i: number, j: number) {
      const ii = i + gridOffI;
      const jj = j + gridOffJ;
      return {
        x: (((jj - ii) * ISO_W) / 2) + gridXOffset,
        y: (((ii + jj) * ISO_H) / 2) + gridYOffset,
      };
    }

    function isRoadIdx(idx: number) {
      return (ROAD_TILE_INDICES as readonly number[]).includes(idx);
    }

    function isKioskIdx(idx: number) {
      return (KIOSK_TILE_INDICES as readonly number[]).includes(idx);
    }

    function isHouseIdx(idx: number) {
      // Behandle Wohnhaus und Stadthaus als "Haus" für Hervorhebung/Bonuseffekte
      if ((HOUSE_TILE_INDICES as readonly number[]).includes(idx)) return true;
      if ((TOWNHOUSE_TILE_INDICES as readonly number[]).includes(idx)) return true;
      return false;
    }

    function isMarketIdx(idx: number) {
      return (MARKET_TILE_INDICES as readonly number[]).includes(idx);
    }

    function isOfficeIdx(idx: number) {
      return (OFFICE_TILE_INDICES as readonly number[]).includes(idx);
    }

    // Reichweite je Kiosk-Typ: günstiger Kiosk (66) = 4, teurer (69) = 5
    function kioskRangeByIdx(idx: number): number {
      if (idx === 66) return 4;
      if (idx === 69) return 5;
      return 5;
    }

    function marketRangeByIdx(idx: number): number {
      // 47 klein -> 6, 54 mittel -> 7, 56 groß -> 8
      if (idx === 47) return 6;
      if (idx === 54) return 7;
      if (idx === 56) return 8;
      return 7;
    }

    function officeRangeByIdx(idx: number): number {
      // 46 klein -> 3, 55 mittel -> 4, 57 hoch -> 5, 58 komplex -> 6
      if (idx === 46) return 3;
      if (idx === 55) return 4;
      if (idx === 57) return 5;
      if (idx === 58) return 6;
      return 4;
    }

    type Conn = { N?: boolean; E?: boolean; S?: boolean; W?: boolean };
    // Ersteinschätzung der Straßen-Konnektivität für gängige Formen
    const ROAD_CONN: Partial<Record<number, Conn>> = {
      2: { E: true, W: true }, // horizontal
      3: { N: true, S: true }, // vertikal
      4: { N: true, E: true }, // Kurve NE
      5: { E: true, S: true }, // Kurve SE
      6: { S: true, W: true }, // Kurve SW
      7: { N: true, W: true }, // Kurve NW
      8: { N: true, E: true, S: true, W: true }, // Kreuzung
      9: { N: true, E: true, S: true, W: true }, // Kreuzung
      38: { N: true, S: true }, // Kurve von SO nach NO -> vertikal
      39: { N: true, S: true }, // Kurve von SW nach NW -> vertikal
      40: { E: true, W: true }, // Kurve von NO nach NW -> horizontal
      41: { E: true, W: true }, // Kurve von SW nach SO -> horizontal
    };
    const OPP: Record<keyof Required<Conn>, keyof Required<Conn>> = { N: "S", E: "W", S: "N", W: "E" };
    function hasConn(idx: number, side: keyof Required<Conn>): boolean | undefined {
      const c = ROAD_CONN[idx];
      if (!c) return undefined; // unbekannt
      return !!c[side];
    }

    function anyRoadOnMap() {
      for (let ii = 0; ii < n; ii++) {
        for (let jj = 0; jj < n; jj++) {
          const [ti, tj] = map[ii][jj];
          const idx = ti * SHEET_COLS + tj;
          if (isRoadIdx(idx)) return true;
        }
      }
      return false;
    }

    // Zähle Kioske, die die Position (i,j) tatsächlich abdecken (eigene Reichweite je Kiosk)
    function countKiosksCovering(i: number, j: number) {
      let count = 0;
      for (let ii = 0; ii < n; ii++) {
        for (let jj = 0; jj < n; jj++) {
          const [ti, tj] = map[ii][jj];
          const idx = ti * SHEET_COLS + tj;
          if (!isKioskIdx(idx)) continue;
          const r = kioskRangeByIdx(idx);
          const d = Math.max(Math.abs(ii - i), Math.abs(jj - j));
          if (d <= r) count++;
        }
      }
      return count;
    }

    // Zähle Märkte, die die Position (i,j) abdecken
    function countMarketsCovering(i: number, j: number) {
      let count = 0;
      for (let ii = 0; ii < n; ii++) {
        for (let jj = 0; jj < n; jj++) {
          const [ti, tj] = map[ii][jj];
          const idx = ti * SHEET_COLS + tj;
          if (!isMarketIdx(idx)) continue;
          const r = marketRangeByIdx(idx);
          const d = Math.max(Math.abs(ii - i), Math.abs(jj - j));
          if (d <= r) count++;
        }
      }
      return count;
    }

    // Zähle Büros, die die Position (i,j) abdecken
    function countOfficesCovering(i: number, j: number) {
      let count = 0;
      for (let ii = 0; ii < n; ii++) {
        for (let jj = 0; jj < n; jj++) {
          const [ti, tj] = map[ii][jj];
          const idx = ti * SHEET_COLS + tj;
          if (!isOfficeIdx(idx)) continue;
          const r = officeRangeByIdx(idx);
          const d = Math.max(Math.abs(ii - i), Math.abs(jj - j));
          if (d <= r) count++;
        }
      }
      return count;
    }

    function canPlaceAt(i: number, j: number) {
      if (!toolRef.current) return false;
      const selIdx = toolRef.current[0] * SHEET_COLS + toolRef.current[1];
      if (isRoadIdx(selIdx)) {
        // Erste Straße darf frei gesetzt werden
        if (!anyRoadOnMap()) return true;
        // Danach: genügt, wenn mindestens ein Nachbar eine Straße ist (keine Richtungsprüfung)
        const neighbors: Array<[number, number]> = [
          [i - 1, j],
          [i + 1, j],
          [i, j - 1],
          [i, j + 1],
        ];
        for (const [ni, nj] of neighbors) {
          if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
          const [ti, tj] = map[ni][nj];
          const nIdx = ti * SHEET_COLS + tj;
          if (isRoadIdx(nIdx)) return true;
        }
        return false;
      }
      // Gebäude benötigen angrenzende Straße (4er Nachbarschaft)
      const neighbors: Array<[number, number]> = [
        [i - 1, j],
        [i + 1, j],
        [i, j - 1],
        [i, j + 1],
      ];
      for (const [ni, nj] of neighbors) {
        if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
        const [ti, tj] = map[ni][nj];
        const nIdx = ti * SHEET_COLS + tj;
        if (isRoadIdx(nIdx)) return true;
      }
      return false;
    }

    function drawTile(c: CanvasRenderingContext2D, gx: number, gy: number, i: number, j: number) {
      c.save();
      // Vorwärtsabbildung konsistent zur inversen: (x,y) -> ((y-x)*ISO_W/2, (x+y)*ISO_H/2)
      const tc = tileCenter(gx, gy);
      c.translate(tc.x, tc.y);
      // 2px links überspringen (Rahmen), damit die Oberseite exakt getroffen wird
      const srcX = j * TILE_W + 2;
      // Oberseiten-Zentrum exakt auf Rasterzentrum legen
      c.drawImage(texture, srcX, i * TILE_H, TILE_W, TILE_H, -TILE_W / 2, -TOPFACE_CENTER_Y, TILE_W, TILE_H);
      c.restore();
    }

    function isEmptyCell(i: number, j: number) {
      const [ti, tj] = map[i][j];
      return ti === 0 && tj === 0;
    }

    function drawMap() {
      if (!texture.complete) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.translate(w / 2 + panX, ISO_H * 2 + panY);
      ctx.scale(scale, scale);
      // Grid-Stil vorbereiten
      let alpha = 0.25;
      if (scale <= 0.8) alpha = 0.32;
      else if (scale >= 2.0) alpha = 0.14;
      else if (scale >= 1.6) alpha = 0.18;
      ctx.strokeStyle = `rgba(0,0,0,${alpha})`;
      ctx.lineWidth = Math.max(1, 1 / scale);
      // Malreihenfolge beibehalten; pro Zelle ggf. Rasterlinien über dem Grund zeichnen
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const [ti, tj] = map[i][j];
          // Nur nicht-leere Zellen zeichnen
          if (!isEmptyCell(i, j)) {
            drawTile(ctx, i, j, ti, tj);
          } else {
            // Leere Zelle: zeige das Objekt mit ID 0 (Spritesheet 0,0) und darüber die Rasterkontur
            drawTile(ctx, i, j, 0, 0);
            const { x: cx, y: cy } = gridCenter(i, j);
            ctx.beginPath();
            ctx.moveTo(cx, cy - ISO_H / 2);
            ctx.lineTo(cx + ISO_W / 2, cy);
            ctx.lineTo(cx, cy + ISO_H / 2);
            ctx.lineTo(cx - ISO_W / 2, cy);
            ctx.closePath();
            ctx.strokeStyle = `rgba(0,0,0,${alpha})`;
            ctx.lineWidth = Math.max(1, 1 / scale);
            ctx.stroke();
          }
        }
      }
    }

    function drawGridLines() {
      // Subtiles Gitter: nur Kanten zwischen leeren Zellen zeichnen
      ctx.save();
      // Deckkraft an Zoom anpassen
      let alpha = 0.25;
      if (scale <= 0.8) alpha = 0.32;
      else if (scale >= 2.0) alpha = 0.14;
      else if (scale >= 1.6) alpha = 0.18;
      ctx.strokeStyle = `rgba(0,0,0,${alpha})`;
      ctx.lineWidth = Math.max(1, 1 / scale);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (!isEmptyCell(i, j)) continue;
          const { x: cx, y: cy } = gridCenter(i, j);
          const top = { x: cx, y: cy - ISO_H / 2 };
          const right = { x: cx + ISO_W / 2, y: cy };
          const bottom = { x: cx, y: cy + ISO_H / 2 };
          const left = { x: cx - ISO_W / 2, y: cy };

          // Kante NE (top->right), Nachbar (i-1, j)
          const n1 = { i: i - 1, j };
          if (n1.i < 0 || isEmptyCell(n1.i, n1.j)) {
            ctx.beginPath();
            ctx.moveTo(top.x, top.y);
            ctx.lineTo(right.x, right.y);
            ctx.stroke();
          }
          // Kante SE (right->bottom), Nachbar (i, j+1)
          const n2 = { i, j: j + 1 };
          if (n2.j >= n || isEmptyCell(n2.i, n2.j)) {
            ctx.beginPath();
            ctx.moveTo(right.x, right.y);
            ctx.lineTo(bottom.x, bottom.y);
            ctx.stroke();
          }
          // Kante SW (bottom->left), Nachbar (i+1, j)
          const n3 = { i: i + 1, j };
          if (n3.i >= n || isEmptyCell(n3.i, n3.j)) {
            ctx.beginPath();
            ctx.moveTo(bottom.x, bottom.y);
            ctx.lineTo(left.x, left.y);
            ctx.stroke();
          }
          // Kante NW (left->top), Nachbar (i, j-1)
          const n4 = { i, j: j - 1 };
          if (n4.j < 0 || isEmptyCell(n4.i, n4.j)) {
            ctx.beginPath();
            ctx.moveTo(left.x, left.y);
            ctx.lineTo(top.x, top.y);
            ctx.stroke();
          }
        }
      }
      ctx.restore();
    }

    function drawHover() {
      fgctx.setTransform(1, 0, 0, 1, 0, 0);
      fgctx.clearRect(0, 0, w, h);
      fgctx.translate(w / 2 + panX, ISO_H * 2 + panY);
      fgctx.scale(scale, scale);
  const i: number | null = hover ? hover.x : null; // row
  const j: number | null = hover ? hover.y : null; // col

  // Wenn ein Kiosk/Markt/Büro platziert werden soll: Reichweite (Chebyshev) markieren
      if (toolRef.current && !demolishModeRef.current && !inspectModeRef.current && i != null && j != null) {
        const selIdx = toolRef.current[0] * SHEET_COLS + toolRef.current[1];
        if (isKioskIdx(selIdx)) {
      const range = kioskRangeByIdx(selIdx);
          const fillRange = "rgba(245,158,11,0.12)"; // Amber 400, transparent
          const strokeRange = "rgba(245,158,11,0.9)";
          for (let ii = Math.max(0, i - range); ii <= Math.min(n - 1, i + range); ii++) {
            for (let jj = Math.max(0, j - range); jj <= Math.min(n - 1, j + range); jj++) {
              const d = Math.max(Math.abs(ii - i), Math.abs(jj - j));
              if (d > range) continue;
              const { x: rx, y: ry } = gridCenter(ii, jj);
              fgctx.beginPath();
              fgctx.moveTo(rx, ry - ISO_H / 2);
              fgctx.lineTo(rx + ISO_W / 2, ry);
              fgctx.lineTo(rx, ry + ISO_H / 2);
              fgctx.lineTo(rx - ISO_W / 2, ry);
              fgctx.closePath();
              fgctx.fillStyle = fillRange;
              fgctx.fill();
              fgctx.strokeStyle = strokeRange;
              fgctx.lineWidth = Math.max(1, 1.5 / scale);
              fgctx.stroke();
              const [tti, ttj] = map[ii][jj];
              const tIdx = tti * SHEET_COLS + ttj;
              if (isHouseIdx(tIdx)) {
                fgctx.strokeStyle = "rgba(16,185,129,1)";
                fgctx.lineWidth = Math.max(1.5, 2 / scale);
                fgctx.stroke();
              }
            }
          }
        } else if (isMarketIdx(selIdx)) {
          const range = marketRangeByIdx(selIdx);
          const fillRange = "rgba(59,130,246,0.10)"; // Blau-transparent
          const strokeRange = "rgba(59,130,246,0.85)";
          for (let ii = Math.max(0, i - range); ii <= Math.min(n - 1, i + range); ii++) {
            for (let jj = Math.max(0, j - range); jj <= Math.min(n - 1, j + range); jj++) {
              const d = Math.max(Math.abs(ii - i), Math.abs(jj - j));
              if (d > range) continue;
              const { x: rx, y: ry } = gridCenter(ii, jj);
              fgctx.beginPath();
              fgctx.moveTo(rx, ry - ISO_H / 2);
              fgctx.lineTo(rx + ISO_W / 2, ry);
              fgctx.lineTo(rx, ry + ISO_H / 2);
              fgctx.lineTo(rx - ISO_W / 2, ry);
              fgctx.closePath();
              fgctx.fillStyle = fillRange;
              fgctx.fill();
              fgctx.strokeStyle = strokeRange;
              fgctx.lineWidth = Math.max(1, 1.5 / scale);
              fgctx.stroke();
              const [tti, ttj] = map[ii][jj];
              const tIdx = tti * SHEET_COLS + ttj;
              if (isHouseIdx(tIdx)) {
                fgctx.strokeStyle = "rgba(16,185,129,1)";
                fgctx.lineWidth = Math.max(1.5, 2 / scale);
                fgctx.stroke();
              }
            }
          }
        } else if (isOfficeIdx(selIdx)) {
          const range = officeRangeByIdx(selIdx);
          const fillRange = "rgba(168,85,247,0.10)"; // Violett-transparent
          const strokeRange = "rgba(168,85,247,0.85)";
          for (let ii = Math.max(0, i - range); ii <= Math.min(n - 1, i + range); ii++) {
            for (let jj = Math.max(0, j - range); jj <= Math.min(n - 1, j + range); jj++) {
              const d = Math.max(Math.abs(ii - i), Math.abs(jj - j));
              if (d > range) continue;
              const { x: rx, y: ry } = gridCenter(ii, jj);
              fgctx.beginPath();
              fgctx.moveTo(rx, ry - ISO_H / 2);
              fgctx.lineTo(rx + ISO_W / 2, ry);
              fgctx.lineTo(rx, ry + ISO_H / 2);
              fgctx.lineTo(rx - ISO_W / 2, ry);
              fgctx.closePath();
              fgctx.fillStyle = fillRange;
              fgctx.fill();
              fgctx.strokeStyle = strokeRange;
              fgctx.lineWidth = Math.max(1, 1.5 / scale);
              fgctx.stroke();
              const [tti, ttj] = map[ii][jj];
              const tIdx = tti * SHEET_COLS + ttj;
              if (isHouseIdx(tIdx)) {
                fgctx.strokeStyle = "rgba(16,185,129,1)";
                fgctx.lineWidth = Math.max(1.5, 2 / scale);
                fgctx.stroke();
              }
            }
          }
        }
      }

  // Haus-Inspect zeigt keine Zone mehr – Zone nur für Kiosk nach Klick

  // Zone beim Kiosk-Inspect: nur bei Klick-Inspekt zeigen
  const currentInspect = inspectRef.current;
  if (inspectModeRef.current && currentInspect && isKioskIdx(currentInspect.idx) && inspectByClickRef.current) {
        const ci = (currentInspect as any).posI;
        const cj = (currentInspect as any).posJ;
        const range = kioskRangeByIdx(currentInspect.idx);
        const fillRange = "rgba(245,158,11,0.10)";
        const strokeRange = "rgba(245,158,11,0.85)";
        for (let ii = Math.max(0, ci - range); ii <= Math.min(n - 1, ci + range); ii++) {
          for (let jj = Math.max(0, cj - range); jj <= Math.min(n - 1, cj + range); jj++) {
            const d = Math.max(Math.abs(ii - ci), Math.abs(jj - cj));
            if (d > range) continue;
            const { x: rx, y: ry } = gridCenter(ii, jj);
            fgctx.beginPath();
            fgctx.moveTo(rx, ry - ISO_H / 2);
            fgctx.lineTo(rx + ISO_W / 2, ry);
            fgctx.lineTo(rx, ry + ISO_H / 2);
            fgctx.lineTo(rx - ISO_W / 2, ry);
            fgctx.closePath();
            fgctx.fillStyle = fillRange;
            fgctx.fill();
            fgctx.strokeStyle = strokeRange;
            fgctx.lineWidth = Math.max(1, 1.25 / scale);
            fgctx.stroke();
            const [tti, ttj] = map[ii][jj];
            const tIdx = tti * SHEET_COLS + ttj;
            if (isHouseIdx(tIdx)) {
              fgctx.strokeStyle = "rgba(16,185,129,1)";
              fgctx.lineWidth = Math.max(1.5, 2 / scale);
              fgctx.stroke();
            }
          }
        }

        // Mittelpunkt wie in der Bau-Ansicht hervorheben (Diamant + Label)
        if (ci != null && cj != null) {
          const { x: cx2, y: cy2 } = gridCenter(ci, cj);
          fgctx.beginPath();
          fgctx.moveTo(cx2, cy2 - ISO_H / 2);
          fgctx.lineTo(cx2 + ISO_W / 2, cy2);
          fgctx.lineTo(cx2, cy2 + ISO_H / 2);
          fgctx.lineTo(cx2 - ISO_W / 2, cy2);
          fgctx.closePath();
          let fill2 = "rgba(59,130,246,0.20)", stroke2 = "rgba(59,130,246,1)";
          fgctx.fillStyle = fill2;
          fgctx.fill();
          fgctx.strokeStyle = "rgba(255,255,255,0.9)";
          fgctx.lineWidth = Math.max(2, 4 / scale);
          fgctx.stroke();
          fgctx.strokeStyle = stroke2;
          fgctx.lineWidth = Math.max(1, 2 / scale);
          fgctx.stroke();

          const label = currentInspect.name;
          if (label) {
            const px = cx2;
            const py = cy2 - ISO_H / 2 - 6;
            const basePx = 12;
            const fontPx = Math.max(10, basePx / scale);
            fgctx.save();
            fgctx.font = `${fontPx}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
            const metrics = fgctx.measureText(label);
            const padX = 6 / Math.max(1, scale);
            const padY = 4 / Math.max(1, scale);
            const bw = metrics.width + padX * 2;
            const bh = fontPx + padY * 2;
            const bx = px - bw / 2;
            const by = py - bh - 2 / Math.max(1, scale);
            const r = 6 / Math.max(1, scale);
            const drawRoundRect = (x: number, y: number, w: number, h: number, rr: number) => {
              const rrClamped = Math.min(rr, w / 2, h / 2);
              fgctx.beginPath();
              fgctx.moveTo(x + rrClamped, y);
              fgctx.lineTo(x + w - rrClamped, y);
              fgctx.quadraticCurveTo(x + w, y, x + w, y + rrClamped);
              fgctx.lineTo(x + w, y + h - rrClamped);
              fgctx.quadraticCurveTo(x + w, y + h, x + w - rrClamped, y + h);
              fgctx.lineTo(x + rrClamped, y + h);
              fgctx.quadraticCurveTo(x, y + h, x, y + h - rrClamped);
              fgctx.lineTo(x, y + rrClamped);
              fgctx.quadraticCurveTo(x, y, x + rrClamped, y);
              fgctx.closePath();
            };
            drawRoundRect(bx, by, bw, bh, r);
            fgctx.fillStyle = "rgba(255,255,255,0.95)";
            fgctx.fill();
            fgctx.strokeStyle = "rgba(0,0,0,0.15)";
            fgctx.lineWidth = Math.max(1, 1 / scale);
            fgctx.stroke();
            fgctx.fillStyle = "#111";
            fgctx.textBaseline = "middle";
            fgctx.textAlign = "center";
            fgctx.fillText(label, px, by + bh / 2);
            fgctx.restore();
          }
        }
      }

      // Zone beim Markt-Inspect: nur bei Klick-Inspekt zeigen
      if (inspectModeRef.current && currentInspect && isMarketIdx(currentInspect.idx) && inspectByClickRef.current) {
        const ci = (currentInspect as any).posI;
        const cj = (currentInspect as any).posJ;
        const range = marketRangeByIdx(currentInspect.idx);
        const fillRange = "rgba(59,130,246,0.10)";
        const strokeRange = "rgba(59,130,246,0.85)";
        for (let ii = Math.max(0, ci - range); ii <= Math.min(n - 1, ci + range); ii++) {
          for (let jj = Math.max(0, cj - range); jj <= Math.min(n - 1, cj + range); jj++) {
            const d = Math.max(Math.abs(ii - ci), Math.abs(jj - cj));
            if (d > range) continue;
            const { x: rx, y: ry } = gridCenter(ii, jj);
            fgctx.beginPath();
            fgctx.moveTo(rx, ry - ISO_H / 2);
            fgctx.lineTo(rx + ISO_W / 2, ry);
            fgctx.lineTo(rx, ry + ISO_H / 2);
            fgctx.lineTo(rx - ISO_W / 2, ry);
            fgctx.closePath();
            fgctx.fillStyle = fillRange;
            fgctx.fill();
            fgctx.strokeStyle = strokeRange;
            fgctx.lineWidth = Math.max(1, 1.25 / scale);
            fgctx.stroke();
            const [tti, ttj] = map[ii][jj];
            const tIdx = tti * SHEET_COLS + ttj;
            if (isHouseIdx(tIdx)) {
              fgctx.strokeStyle = "rgba(16,185,129,1)";
              fgctx.lineWidth = Math.max(1.5, 2 / scale);
              fgctx.stroke();
            }
          }
        }

        // Mittelpunkt hervorheben
        if (ci != null && cj != null) {
          const { x: cx2, y: cy2 } = gridCenter(ci, cj);
          fgctx.beginPath();
          fgctx.moveTo(cx2, cy2 - ISO_H / 2);
          fgctx.lineTo(cx2 + ISO_W / 2, cy2);
          fgctx.lineTo(cx2, cy2 + ISO_H / 2);
          fgctx.lineTo(cx2 - ISO_W / 2, cy2);
          fgctx.closePath();
          fgctx.fillStyle = "rgba(59,130,246,0.20)";
          fgctx.fill();
          fgctx.strokeStyle = "rgba(255,255,255,0.9)";
          fgctx.lineWidth = Math.max(2, 4 / scale);
          fgctx.stroke();
          fgctx.strokeStyle = "rgba(59,130,246,1)";
          fgctx.lineWidth = Math.max(1, 2 / scale);
          fgctx.stroke();
        }
      }

      // Zone beim Büro-Inspect: nur bei Klick-Inspekt zeigen
      if (inspectModeRef.current && currentInspect && isOfficeIdx(currentInspect.idx) && inspectByClickRef.current) {
        const ci = (currentInspect as any).posI;
        const cj = (currentInspect as any).posJ;
        const range = officeRangeByIdx(currentInspect.idx);
        const fillRange = "rgba(168,85,247,0.10)";
        const strokeRange = "rgba(168,85,247,0.85)";
        for (let ii = Math.max(0, ci - range); ii <= Math.min(n - 1, ci + range); ii++) {
          for (let jj = Math.max(0, cj - range); jj <= Math.min(n - 1, cj + range); jj++) {
            const d = Math.max(Math.abs(ii - ci), Math.abs(jj - cj));
            if (d > range) continue;
            const { x: rx, y: ry } = gridCenter(ii, jj);
            fgctx.beginPath();
            fgctx.moveTo(rx, ry - ISO_H / 2);
            fgctx.lineTo(rx + ISO_W / 2, ry);
            fgctx.lineTo(rx, ry + ISO_H / 2);
            fgctx.lineTo(rx - ISO_W / 2, ry);
            fgctx.closePath();
            fgctx.fillStyle = fillRange;
            fgctx.fill();
            fgctx.strokeStyle = strokeRange;
            fgctx.lineWidth = Math.max(1, 1.25 / scale);
            fgctx.stroke();
            const [tti, ttj] = map[ii][jj];
            const tIdx = tti * SHEET_COLS + ttj;
            if (isHouseIdx(tIdx)) {
              fgctx.strokeStyle = "rgba(16,185,129,1)";
              fgctx.lineWidth = Math.max(1.5, 2 / scale);
              fgctx.stroke();
            }
          }
        }

        // Mittelpunkt hervorheben
        if (ci != null && cj != null) {
          const { x: cx2, y: cy2 } = gridCenter(ci, cj);
          fgctx.beginPath();
          fgctx.moveTo(cx2, cy2 - ISO_H / 2);
          fgctx.lineTo(cx2 + ISO_W / 2, cy2);
          fgctx.lineTo(cx2, cy2 + ISO_H / 2);
          fgctx.lineTo(cx2 - ISO_W / 2, cy2);
          fgctx.closePath();
          fgctx.fillStyle = "rgba(168,85,247,0.20)";
          fgctx.fill();
          fgctx.strokeStyle = "rgba(255,255,255,0.9)";
          fgctx.lineWidth = Math.max(2, 4 / scale);
          fgctx.stroke();
          fgctx.strokeStyle = "rgba(168,85,247,1)";
          fgctx.lineWidth = Math.max(1, 2 / scale);
          fgctx.stroke();
        }
      }

  if (i != null && j != null) {
    const { x: cx, y: cy } = gridCenter(i, j);
    fgctx.beginPath();
    fgctx.moveTo(cx, cy - ISO_H / 2);
    fgctx.lineTo(cx + ISO_W / 2, cy);
    fgctx.lineTo(cx, cy + ISO_H / 2);
    fgctx.lineTo(cx - ISO_W / 2, cy);
    fgctx.closePath();
    // Farbcode: grün (ok), rot (nicht ok/Abreißen), blau (neutral)
    let fill = "rgba(59,130,246,0.20)", stroke = "rgba(59,130,246,1)";
    if (demolishModeRef.current) {
      const occupied = !isEmptyCell(i, j);
      if (occupied) { fill = "rgba(16,185,129,0.25)"; stroke = "rgba(16,185,129,1)"; }
      else { fill = "rgba(239,68,68,0.25)"; stroke = "rgba(239,68,68,1)"; }
    } else if (toolRef.current) {
      const ok = canPlaceAt(i, j);
      if (ok) { fill = "rgba(16,185,129,0.25)"; stroke = "rgba(16,185,129,1)"; }
      else { fill = "rgba(239,68,68,0.25)"; stroke = "rgba(239,68,68,1)"; }
    }
    // Light fill to make the hovered cell pop on any background
    fgctx.fillStyle = fill;
    fgctx.fill();
    // Outer white stroke for contrast
    fgctx.strokeStyle = "rgba(255,255,255,0.9)";
    fgctx.lineWidth = Math.max(2, 4 / scale);
    fgctx.stroke();
    // Inner blue/green/red stroke
    fgctx.strokeStyle = stroke;
    fgctx.lineWidth = Math.max(1, 2 / scale);
    fgctx.stroke();

      // Name des aktuell gewählten Tiles anzeigen (Straßen & Gebäude)
      if (toolRef.current) {
        const selIdx = toolRef.current[0] * SHEET_COLS + toolRef.current[1];
        const getName = (idx: number): string | null => {
          if ((ROAD_TILE_INDICES as readonly number[]).includes(idx)) return ROAD_META[idx]?.name ?? null;
          if ((HOUSE_TILE_INDICES as readonly number[]).includes(idx)) return HOUSE_META[idx]?.name ?? null;
          if ((MARKET_TILE_INDICES as readonly number[]).includes(idx)) return MARKET_META[idx]?.name ?? null;
          if ((TOWNHOUSE_TILE_INDICES as readonly number[]).includes(idx)) return TOWNHOUSE_META[idx]?.name ?? null;
          if ((KIOSK_TILE_INDICES as readonly number[]).includes(idx)) {
            const base = KIOSK_META[idx]?.name ?? "Kiosk";
            const r = kioskRangeByIdx(idx);
            return `${base} · R=${r}`;
          }
          if ((OFFICE_TILE_INDICES as readonly number[]).includes(idx)) return OFFICE_META[idx]?.name ?? null;
          return null;
        };
        const label = getName(selIdx);
        if (label) {
          // Badge über der Zelle zeichnen (in Weltkoordinaten, aber skaliert)
          const px = cx; // Mittelpunkt
          const py = cy - ISO_H / 2 - 6; // knapp über die obere Spitze
          // Für konstante Bildschirmgröße die Schrift an die Skalierung anpassen
          const basePx = 12;
          const fontPx = Math.max(10, basePx / scale);
          // Text in Screenspace messen: temporär ohne Scale arbeiten
          fgctx.save();
          // Lokale Matrix beibehalten; Textbreite approximieren über Maß in dieser Skala
          fgctx.font = `${fontPx}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
          const metrics = fgctx.measureText(label);
          const padX = 6 / Math.max(1, scale);
          const padY = 4 / Math.max(1, scale);
          const bw = metrics.width + padX * 2;
          const bh = fontPx + padY * 2;
          const bx = px - bw / 2;
          const by = py - bh - 2 / Math.max(1, scale);
          // Hintergrund (abgerundetes Rechteck)
          const r = 6 / Math.max(1, scale);
          const drawRoundRect = (x: number, y: number, w: number, h: number, rr: number) => {
            const rrClamped = Math.min(rr, w / 2, h / 2);
            fgctx.beginPath();
            fgctx.moveTo(x + rrClamped, y);
            fgctx.lineTo(x + w - rrClamped, y);
            fgctx.quadraticCurveTo(x + w, y, x + w, y + rrClamped);
            fgctx.lineTo(x + w, y + h - rrClamped);
            fgctx.quadraticCurveTo(x + w, y + h, x + w - rrClamped, y + h);
            fgctx.lineTo(x + rrClamped, y + h);
            fgctx.quadraticCurveTo(x, y + h, x, y + h - rrClamped);
            fgctx.lineTo(x, y + rrClamped);
            fgctx.quadraticCurveTo(x, y, x + rrClamped, y);
            fgctx.closePath();
          };
          drawRoundRect(bx, by, bw, bh, r);
          fgctx.fillStyle = "rgba(255,255,255,0.95)";
          fgctx.fill();
          fgctx.strokeStyle = "rgba(0,0,0,0.15)";
          fgctx.lineWidth = Math.max(1, 1 / scale);
          fgctx.stroke();
          // Text
          fgctx.fillStyle = "#111";
          fgctx.textBaseline = "middle";
          fgctx.textAlign = "center";
          fgctx.fillText(label, px, by + bh / 2);
          fgctx.restore();
        }
      }
  }
    }

    function gridFromPoint(localX: number, localY: number) {
      const originX = w / 2 + panX;
      const originY = ISO_H * 2 + panY;
      // Mausposition in vor-Transformations-Koordinaten (pre-scale/pre-translate)
      const sx = (localX - originX) / scale - gridXOffset;
      const sy = (localY - originY) / scale - gridYOffset;
      // Inverse kontinuierliche Koordinaten
      // Fractional Offsets abziehen, damit das Raster-Index mit dem versetzten Gitter übereinstimmt
      const iFloat = sy / ISO_H - sx / ISO_W - gridOffI; // row
      const jFloat = sy / ISO_H + sx / ISO_W - gridOffJ; // col
      const i0 = Math.floor(iFloat);
      const j0 = Math.floor(jFloat);
      // Kandidaten um den Mauspunkt (4 Nachbarn)
      const candidates: Array<{ i: number; j: number; d2: number }> = [];
      for (let di = 0; di <= 1; di++) {
        for (let dj = 0; dj <= 1; dj++) {
          const i = i0 + di;
          const j = j0 + dj;
          const gc = gridCenter(i, j);
          const dx = sx - gc.x;
          const dy = sy - gc.y;
          candidates.push({ i, j, d2: dx * dx + dy * dy });
        }
      }
      // Nächsten Mittelpunkt wählen
      candidates.sort((a, b) => a.d2 - b.d2);
      let ix = candidates[0].i;
      let iy = candidates[0].j;
      const inBounds = ix >= 0 && ix < n && iy >= 0 && iy < n;
      // Auf Grid klemmen, damit Hover sichtbar bleibt
      ix = Math.max(0, Math.min(n - 1, ix));
      iy = Math.max(0, Math.min(n - 1, iy));
      return { x: ix, y: iy, inBounds } as const;
    }

    function zoomAt(localX: number, localY: number, delta: number) {
      const prev = scale;
      scale = Math.min(maxScale, Math.max(minScale, scale * (delta > 0 ? 0.9 : 1.111)));
      const originX = w / 2 + panX;
      const originY = ISO_H * 2 + panY;
      const dx = localX - originX;
      const dy = localY - originY;
      panX -= (dx / prev) * (scale - prev);
      panY -= (dy / prev) * (scale - prev);
    }

    // Events
    fg.style.touchAction = "none";

    // Nächster-Monat-Aktion bereitstellen
    nextMonthRef.current = () => {
      // Sternenkosten prüfen
      if ((starsRef.current ?? 0) < 1) {
        setErrorMsg("Nicht genug Sterne.");
        return;
      }
      let total = 0; // Einnahmen
      let populationTotal = 0; // Einwohner gesamt
      for (let ii = 0; ii < n; ii++) {
        for (let jj = 0; jj < n; jj++) {
          const [ti, tj] = map[ii][jj];
          const idx = ti * SHEET_COLS + tj;
          if ((HOUSE_TILE_INDICES as readonly number[]).includes(idx) || (TOWNHOUSE_TILE_INDICES as readonly number[]).includes(idx)) {
            const meta = (HOUSE_META as any)[idx] ?? (TOWNHOUSE_META as any)[idx];
            if (!meta) continue;
            const baseTaxes = Math.round(meta.price * 0.10);
            const hasKiosk = countKiosksCovering(ii, jj) > 0;
            const hasMarket = countMarketsCovering(ii, jj) > 0;
            const hasOffice = countOfficesCovering(ii, jj) > 0;
            const bonus = (hasKiosk ? 0.2 : 0) + (hasMarket ? 0.4 : 0) + (hasOffice ? 0.2 : 0);
            const taxes = Math.round(baseTaxes * (1 + bonus));
            total += taxes;
            // Einwohner berechnen
            if ((HOUSE_TILE_INDICES as readonly number[]).includes(idx)) {
              const hasOffice = countOfficesCovering(ii, jj) > 0;
              const basePop = Math.round(meta.price * 0.05);
              const pop = Math.round(basePop * (hasOffice ? 1.2 : 1));
              populationTotal += pop;
            } else {
              // Stadthaus: etwas mehr Einwohner (0.06 * Preis)
              const pop = Math.round(meta.price * 0.06);
              populationTotal += pop;
            }
          }
        }
      }
      // Guthaben und Sterne aktualisieren
      setStars((s) => Math.max(0, (s ?? 0) - 1));
      setBalance((b) => b + total);
      const newBal = (balanceRef.current ?? 0) + total;
      setMonthReport({ total, population: populationTotal, newBalance: newBal });
      setInspect(null);
      try {
        const ts = Date.now();
        setLastModified(ts);
        localStorage.setItem("isostadt:lastModified", String(ts));
      } catch {}
      scheduleSave();
    };

    // Spielfeld vergrößern (+1 Ring) mit eskalierenden Kosten
    expandGridRef.current = () => {
      // Preis: 10.000, dann +10.000 pro weiterem Ausbau
      const expansions = Math.max(0, Math.floor((n - 16) / 2));
      const cost = (expansions + 1) * 10000;
      if ((balanceRef.current ?? 0) < cost) {
        setErrorMsg("Nicht genug Guthaben.");
        return;
      }
      const newN = n + 2;
      const newMap: [number, number][][] = Array.from({ length: newN }, () => Array.from({ length: newN }, () => [0, 0] as [number, number]));
      // Alte Map mittig einsetzen
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          newMap[i + 1][j + 1] = map[i][j];
        }
      }
      // Übernehmen
      n = newN;
      map = newMap;
      setGridN(newN);
      // Kosten abziehen, speichern und neu zeichnen
      setBalance((b) => b - cost);
      try {
        const ts = Date.now();
        setLastModified(ts);
        localStorage.setItem("isostadt:lastModified", String(ts));
      } catch {}
      drawMap();
      drawHover();
      scheduleSave();
    };

    const onMouseDown = (e: MouseEvent) => {
      if (panRef.current || e.button === 1 || e.shiftKey) {
        panning = true;
        panStart = { x: panX, y: panY };
        pointerStart = { x: e.clientX, y: e.clientY };
      }
    };

  const performInspect = (lx: number, ly: number) => {
      const pos = gridFromPoint(lx, ly);
      const [ti, tj] = map[pos.x][pos.y];
      const idx = ti * SHEET_COLS + tj;
      if (idx <= 0) { setInspect(null); return; }
      if ((ROAD_TILE_INDICES as readonly number[]).includes(idx)) {
  // Kein Kiosk -> Zone ausblenden
  inspectByClickRef.current = false;
        const meta = ROAD_META[idx];
        if (meta) setInspect({ idx, name: meta.name, price: meta.price, type: "road", posI: pos.x, posJ: pos.y });
        else setInspect(null);
        return;
      }
  if ((HOUSE_TILE_INDICES as readonly number[]).includes(idx)) {
    // Kein Kiosk -> Zone ausblenden
    inspectByClickRef.current = false;
        const meta = HOUSE_META[idx];
        if (meta) {
          const baseTaxes = Math.round(meta.price * 0.10);
          const hasKiosk = countKiosksCovering(pos.x, pos.y) > 0;
          const hasMarket = countMarketsCovering(pos.x, pos.y) > 0;
          const hasOffice = countOfficesCovering(pos.x, pos.y) > 0;
          const taxBonus = (hasKiosk ? 0.2 : 0) + (hasMarket ? 0.4 : 0) + (hasOffice ? 0.2 : 0);
          const taxes = Math.round(baseTaxes * (1 + taxBonus));
          const basePop = Math.round(meta.price * 0.05);
          const population = Math.round(basePop * (1 + (hasOffice ? 0.2 : 0)));
          setInspect({ idx, name: meta.name, price: meta.price, type: "house", taxes, population, posI: pos.x, posJ: pos.y });
        } else setInspect(null);
        return;
      }
  if ((MARKET_TILE_INDICES as readonly number[]).includes(idx)) {
        // Markt: Klick-Inspekt aktiviert Market-Zone
        const meta = MARKET_META[idx];
        if (meta) {
          inspectByClickRef.current = true;
          setInspect({ idx, name: meta.name, price: meta.price, type: "building", posI: pos.x, posJ: pos.y });
        }
        else setInspect(null);
        return;
      }
      if ((TOWNHOUSE_TILE_INDICES as readonly number[]).includes(idx)) {
        // Kein Zonenzentrum – Zone ausblenden
        inspectByClickRef.current = false;
        const meta = TOWNHOUSE_META[idx];
        if (meta) {
          const baseTaxes = Math.round(meta.price * 0.10);
          const hasKiosk = countKiosksCovering(pos.x, pos.y) > 0;
          const hasMarket = countMarketsCovering(pos.x, pos.y) > 0;
          const bonus = (hasKiosk ? 0.2 : 0) + (hasMarket ? 0.4 : 0);
          const taxes = Math.round(baseTaxes * (1 + bonus));
          // "Etwas mehr Einwohner" als Haus: +20% ggü. 0.05 => 0.06
          const population = Math.round(meta.price * 0.06);
          setInspect({ idx, name: meta.name, price: meta.price, type: "house", taxes, population, posI: pos.x, posJ: pos.y });
        } else setInspect(null);
        return;
      }
      if ((KIOSK_TILE_INDICES as readonly number[]).includes(idx)) {
        const meta = KIOSK_META[idx];
        if (meta) {
          // Bei Kiosk-Inspekt direkt Klick-Flag setzen, damit die Zone erscheint
          inspectByClickRef.current = true;
          setInspect({ idx, name: meta.name, price: meta.price, type: "building", posI: pos.x, posJ: pos.y });
        }
        else setInspect(null);
        return;
      }
      if ((OFFICE_TILE_INDICES as readonly number[]).includes(idx)) {
  // Büro: Klick-Inspekt aktiviert Büro-Zone
  inspectByClickRef.current = true;
        const meta = OFFICE_META[idx];
        if (meta) setInspect({ idx, name: meta.name, price: meta.price, type: "building", posI: pos.x, posJ: pos.y });
        else setInspect(null);
        return;
      }
      setInspect(null);
    };

    const performDemolish = (lx: number, ly: number) => {
      const pos = gridFromPoint(lx, ly);
      const [ti, tj] = map[pos.x][pos.y];
      if (ti === 0 && tj === 0) return;
  map[pos.x][pos.y] = [0, 0];
      drawMap();
      hover = { x: pos.x, y: pos.y };
      drawHover();
      setInspect(null);
      try {
        const ts = Date.now();
        setLastModified(ts);
        localStorage.setItem("isostadt:lastModified", String(ts));
      } catch {}
  scheduleSave();
    };
  const onMouseUp = (e: MouseEvent) => {
      if (panning) {
        panning = false;
        return;
      }
      // Abreißen-Modus: vorhandenes Objekt entfernen
      if (demolishModeRef.current) {
        const rect = fg.getBoundingClientRect();
        const lx = e.clientX - rect.left;
        const ly = e.clientY - rect.top;
        performDemolish(lx, ly);
        return;
      }
      if (!toolRef.current) return;
      const rect = fg.getBoundingClientRect();
      const lx = e.clientX - rect.left;
      const ly = e.clientY - rect.top;
      const pos = gridFromPoint(lx, ly);
      if (!pos.inBounds) return;
      const ok = canPlaceAt(pos.x, pos.y);
      if (!ok) {
        const selIdx = toolRef.current[0] * SHEET_COLS + toolRef.current[1];
        if (isRoadIdx(selIdx)) setErrorMsg("Straße muss an eine Straße angrenzen.");
        else setErrorMsg("Gebäude kann nur neben einer Straße gebaut werden.");
        return;
      }
      // Preisprüfung (Guthaben)
      const selIdx = toolRef.current[0] * SHEET_COLS + toolRef.current[1];
      const getPrice = (idx: number): number => {
        if (ROAD_META[idx]) return ROAD_META[idx].price;
        if (HOUSE_META[idx]) return HOUSE_META[idx].price;
        if (MARKET_META[idx]) return MARKET_META[idx].price;
        if (TOWNHOUSE_META[idx]) return TOWNHOUSE_META[idx].price;
        if (KIOSK_META[idx]) return KIOSK_META[idx].price;
        if (OFFICE_META[idx]) return OFFICE_META[idx].price;
        return 0;
      };
      const price = getPrice(selIdx);
      if (price > 0 && balanceRef.current < price) {
        setErrorMsg("Nicht genug Guthaben.");
        return;
      }
      // Nur auf leere Zellen bauen
      const [cti, ctj] = map[pos.x][pos.y];
      if (cti !== 0 || ctj !== 0) {
        setErrorMsg("Feld ist belegt. Nutze 'Abreißen'.");
        return;
      }
      // Platzieren
      map[pos.x][pos.y] = [toolRef.current[0], toolRef.current[1]];
      drawMap();
      hover = { x: pos.x, y: pos.y };
      drawHover();
  // Guthaben abziehen
  if (price > 0) setBalance((b) => b - price);
  try {
        const ts = Date.now();
        setLastModified(ts);
        localStorage.setItem("isostadt:lastModified", String(ts));
  } catch {}
  scheduleSave();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (panning) {
        panX = panStart.x + (e.clientX - pointerStart.x);
        panY = panStart.y + (e.clientY - pointerStart.y);
        drawMap();
        drawHover();
        return;
      }
      const rect = fg.getBoundingClientRect();
      const lx = e.clientX - rect.left;
      const ly = e.clientY - rect.top;
      const pos = gridFromPoint(lx, ly);
      if (!hover || hover.x !== pos.x || hover.y !== pos.y) {
        hover = { x: pos.x, y: pos.y };
        drawHover();
      }
  // Im Inspektionsmodus kein Hover-Inspect mehr, nur per Klick
    };

    const onClick = (e: MouseEvent) => {
      if (demolishModeRef.current) {
        const rect = fg.getBoundingClientRect();
        const lx = e.clientX - rect.left;
        const ly = e.clientY - rect.top;
        performDemolish(lx, ly);
        return;
      }
  if (!inspectModeRef.current) return;
      const rect = fg.getBoundingClientRect();
      const lx = e.clientX - rect.left;
      const ly = e.clientY - rect.top;
  performInspect(lx, ly);
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = fg.getBoundingClientRect();
      const lx = e.clientX - rect.left;
      const ly = e.clientY - rect.top;
      zoomAt(lx, ly, e.deltaY);
      drawMap();
      drawHover();
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "+" || e.key === "=") {
        zoomAt(w / 2, h / 2, -1);
        drawMap();
        drawHover();
      } else if (e.key === "-" || e.key === "_") {
        zoomAt(w / 2, h / 2, +1);
        drawMap();
        drawHover();
      }
    };

  const onMouseLeave = () => { panning = false; hover = null; drawHover(); };
  fg.addEventListener("mousedown", onMouseDown);
  fg.addEventListener("mouseup", onMouseUp);
  fg.addEventListener("mouseleave", onMouseLeave);
    fg.addEventListener("mousemove", onMouseMove);
  fg.addEventListener("click", onClick);
    fg.addEventListener("wheel", onWheel, { passive: false } as any);
    window.addEventListener("keydown", onKey);

  texture.onload = () => {
      resizeToContainer();
      drawMap();
      drawHover();
    };
    resizeToContainer();
    // initial aus DB laden
    loadMapFromDB();
    drawHover();

  // Externe Redraw-Funktion bereitstellen
  redrawRef.current = () => { drawMap(); drawHover(); };

    return () => {
  fg.removeEventListener("mousedown", onMouseDown);
  fg.removeEventListener("mouseup", onMouseUp);
  fg.removeEventListener("mouseleave", onMouseLeave);
  fg.removeEventListener("mousemove", onMouseMove);
  fg.removeEventListener("click", onClick);
  fg.removeEventListener("wheel", onWheel as any);
      window.removeEventListener("keydown", onKey);
  if (ro) ro.disconnect();
  if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    };
  }, [width, height, session?.user]);

  // Auf Grid-Settings reagieren und neu zeichnen
  useEffect(() => {
    redrawRef.current?.();
  }, [gridOffI, gridOffJ, gridXOffset, gridYOffset]);

  // Panel-Öffnung: bereits gewähltes Werkzeug anzeigen (egal welche Kategorie)
  useEffect(() => {
    if (activePanel) {
      const cur = toolRef.current;
      if (cur) {
        const idx = cur[0] * SHEET_COLS + cur[1];
        setSelectedTileIndex(idx);
      } else setSelectedTileIndex(null);
    }
  }, [activePanel]);

  return (
    <div id="main" style={{ display: "grid", gridTemplateColumns: "1fr 3fr", height: "100%", position: "relative" }}>
    <aside id="sidebar" aria-label="Werkzeuge" style={{ borderRight: "1px solid #ddd", padding: 10, overflow: "auto" }}>
  <div className="sidebar-header" style={{ position: "sticky", top: 0, zIndex: 5, background: "#fff", display: "grid", alignItems: "stretch", gap: 8, marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid #eee" }}>
          {/* Oben: Platz für Zurück-Button und HUD */}
          <div style={{ display: 'grid', gap: 6 }}>
            <div aria-hidden style={{ height: 40 }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 2, columnGap: 8, alignItems: 'center' }}>
              <div style={{ color: '#333', fontWeight: 600 }}>Guthaben</div>
              <div style={{ fontWeight: 700 }}>{balance.toLocaleString('de-DE')} €</div>
              <div style={{ color: '#333' }}>Sterne</div>
              <div style={{ fontWeight: 600 }}>{stars.toLocaleString('de-DE')}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                onClick={() => nextMonthRef.current?.()}
                title="In den nächsten Monat springen und Steuereinnahmen kassieren"
                disabled={stars < 1}
                style={{
                  border: '1px solid #bbb',
                  background: stars >= 1 ? '#e5f3ff' : '#f0f0f0',
                  color: '#111',
                  borderRadius: 6,
                  padding: '6px 10px',
                  cursor: stars >= 1 ? 'pointer' : 'not-allowed'
                }}
              >
                Nächster Monat
              </button>
              {(() => {
                const expansions = Math.max(0, Math.floor((gridN - 16) / 2));
                const cost = (expansions + 1) * 10000;
                const can = balance >= cost;
                return (
                  <button
                    onClick={() => expandGridRef.current?.()}
                    title={`Spielfeld vergrößern: +1 äußerer Ring (Kosten: ${cost.toLocaleString('de-DE')} €)`}
                    disabled={!can}
                    style={{
                      border: '1px solid #bbb',
                      background: can ? '#ecfdf5' : '#f0f0f0',
                      color: '#111',
                      borderRadius: 6,
                      padding: '6px 10px',
                      cursor: can ? 'pointer' : 'not-allowed'
                    }}
                  >
                    Größer (+1)
                  </button>
                );
              })()}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <h2 style={{ fontSize: 18, margin: 0 }}>Werkzeuge</h2>
            <div className="tool-actions" role="toolbar" aria-label="Werkzeuge" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button
              id="panModeBtn"
              className="tool-btn"
              aria-pressed={panMode ? "true" : "false"}
              title="Spielfeld verschieben"
              onClick={() => setPanMode((v) => !v)}
              style={{ border: "1px solid #bbb", background: panMode ? "#dbeafe" : "#f5f5f5", borderRadius: 6, padding: "6px 10px", cursor: "pointer" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: "block" }}>
                <path d="M12 2l3 3-3-3-3 3 3-3v20l-3-3 3 3 3-3-3 3V2z" />
                <path d="M2 12l3-3-3 3 3 3-3-3h20l-3-3 3 3-3 3 3-3H2z" />
              </svg>
            </button>
            <button
              id="inspectBtn"
              className="tool-btn"
              aria-pressed={inspectMode ? "true" : "false"}
              title="Mauszeiger (Details anzeigen)"
              onClick={() => {
                setInspectMode((m) => !m);
                setPanMode(false);
                setDemolishMode(false);
                setActivePanel(null);
                toolRef.current = null;
                setSelectedTileIndex(null);
                // Overlay soll erst nach Klick erscheinen
                inspectByClickRef.current = false;
                setInspect(null);
              }}
              style={{ border: "1px solid #bbb", background: inspectMode ? "#dbeafe" : "#f5f5f5", borderRadius: 6, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ display: "block" }}>
                <path d="M5 3 L15 13 L11 13 L13 20 L11.5 20.7 L9.5 13.8 L7 16 Z" fill="#333" />
              </svg>
            </button>
            <button
              id="demolishBtn"
              className="tool-btn"
              aria-pressed={demolishMode ? "true" : "false"}
              title="Abreißen"
              onClick={() => {
                setDemolishMode((m) => !m);
                setInspectMode(false);
                setPanMode(false);
                setActivePanel(null);
                toolRef.current = null;
                setSelectedTileIndex(null);
              }}
              style={{ border: "1px solid #bbb", background: demolishMode ? "#fee2e2" : "#f5f5f5", borderRadius: 6, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ display: "block" }}>
                <path d="M3 6h18v2H3zM6 8h12l-1 11H7z" fill="#b91c1c" />
                <path d="M9 10v7M12 10v7M15 10v7" stroke="#7f1d1d" strokeWidth="1.5" />
              </svg>
            </button>
            <button
              id="roadBtn"
              className="tool-btn"
              aria-pressed={activePanel === "roads" ? "true" : "false"}
              title="Straßen bauen"
              onClick={() => { setInspectMode(false); setDemolishMode(false); setInspect(null); setPanMode(false); setActivePanel((p) => (p === "roads" ? null : "roads")); updateCursor(); }}
              style={{ border: "1px solid #bbb", background: activePanel === "roads" ? "#dbeafe" : "#f5f5f5", borderRadius: 6, padding: "6px 10px", cursor: "pointer" }}
            >
              Straße
            </button>
            <button
              id="houseBtn"
              className="tool-btn"
              aria-pressed={activePanel === "houses" ? "true" : "false"}
              title="Wohnhäuser"
              onClick={() => { setInspectMode(false); setDemolishMode(false); setInspect(null); setPanMode(false); setActivePanel((p) => (p === "houses" ? null : "houses")); updateCursor(); }}
              style={{ border: "1px solid #bbb", background: activePanel === "houses" ? "#dbeafe" : "#f5f5f5", borderRadius: 6, padding: "6px 10px", cursor: "pointer" }}
            >
              Wohnhäuser
            </button>
            <button
              id="marketBtn"
              className="tool-btn"
              aria-pressed={activePanel === "market" ? "true" : "false"}
              title="Supermarkt"
              onClick={() => { setInspectMode(false); setDemolishMode(false); setInspect(null); setPanMode(false); setActivePanel((p) => (p === "market" ? null : "market")); updateCursor(); }}
              style={{ border: "1px solid #bbb", background: activePanel === "market" ? "#dbeafe" : "#f5f5f5", borderRadius: 6, padding: "6px 10px", cursor: "pointer" }}
            >
              Supermarkt
            </button>
            <button
              id="townhouseBtn"
              className="tool-btn"
              aria-pressed={activePanel === "townhouse" ? "true" : "false"}
              title="Stadthaus"
              onClick={() => { setInspectMode(false); setDemolishMode(false); setInspect(null); setPanMode(false); setActivePanel((p) => (p === "townhouse" ? null : "townhouse")); updateCursor(); }}
              style={{ border: "1px solid #bbb", background: activePanel === "townhouse" ? "#dbeafe" : "#f5f5f5", borderRadius: 6, padding: "6px 10px", cursor: "pointer" }}
            >
              Stadthaus
            </button>
            <button
              id="kioskBtn"
              className="tool-btn"
              aria-pressed={activePanel === "kiosk" ? "true" : "false"}
              title="Kiosk"
              onClick={() => { setInspectMode(false); setDemolishMode(false); setInspect(null); setPanMode(false); setActivePanel((p) => (p === "kiosk" ? null : "kiosk")); updateCursor(); }}
              style={{ border: "1px solid #bbb", background: activePanel === "kiosk" ? "#dbeafe" : "#f5f5f5", borderRadius: 6, padding: "6px 10px", cursor: "pointer" }}
            >
              Kiosk
            </button>
            <button
              id="officeBtn"
              className="tool-btn"
              aria-pressed={activePanel === "office" ? "true" : "false"}
              title="Bürogebäude"
              onClick={() => { setInspectMode(false); setDemolishMode(false); setInspect(null); setPanMode(false); setActivePanel((p) => (p === "office" ? null : "office")); updateCursor(); }}
              style={{ border: "1px solid #bbb", background: activePanel === "office" ? "#dbeafe" : "#f5f5f5", borderRadius: 6, padding: "6px 10px", cursor: "pointer" }}
            >
              Bürogebäude
            </button>
            </div>
          </div>
        </div>
  <p style={{ color: "#666", fontSize: 14, margin: 0 }}>1) Pfeil-Button: Ziehen zum Verschieben. 2) Straße: Overlay öffnen und Typ wählen, dann ins Feld klicken.</p>

        {activePanel === "roads" && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>Straßen auswählen</h3>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button onClick={() => setActivePanel(null)} style={{ border: "1px solid #bbb", background: "#f5f5f5", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>Schließen</button>
              </div>
            </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 48px)", gap: 6, justifyContent: "start", maxHeight: "50vh", overflow: "auto", padding: 4 }}>
                {ROAD_TILE_INDICES.map((idx) => (
                <button
                    key={idx}
                  onClick={() => {
                      const row = Math.floor(idx / SHEET_COLS);
                      const col = idx % SHEET_COLS;
                      toolRef.current = [row, col];
                      setSelectedTileIndex(idx);
                    setPanMode(false);
                    updateCursor();
                  }}
                  style={{
                      width: 48,
                      height: 88,
                      border: selectedTileIndex === idx ? "3px solid #3b82f6" : "2px solid #b05355",
                      boxShadow: selectedTileIndex === idx ? "0 0 0 3px rgba(59,130,246,0.25)" : "none",
                    borderRadius: 6,
                    cursor: "pointer",
                    overflow: "hidden",
                    background: "#f9fafb",
                  }}
                    title={ROAD_META[idx]?.name || `Straße`}
                >
                  <div
                    style={{
                      width: TILE_W,
                      height: TILE_H,
                      backgroundImage: "url('/media/01_130x66_130x230.png')",
                      backgroundRepeat: "no-repeat",
                        backgroundPosition: `-${(idx % SHEET_COLS) * TILE_W + 2}px -${Math.floor(idx / SHEET_COLS) * TILE_H}px`,
                        transform: "scale(0.38)",
                      transformOrigin: "top left",
                    }}
                  />
                </button>
              ))}
            </div>
            {/* Beschreibung Straße */}
            <div style={{ marginTop: 12, padding: 10, border: "1px solid #eee", borderRadius: 8, background: "#fff" }}>
              {selectedTileIndex != null && (ROAD_TILE_INDICES as readonly number[]).includes(selectedTileIndex) ? (
                (() => {
                  const meta = ROAD_META[selectedTileIndex!];
                  return meta ? (
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{meta.name}</div>
                      <div style={{ color: "#444" }}>Preis: {meta.price}</div>
                    </div>
                  ) : (
                    <div style={{ color: "#666" }}>Keine Beschreibung vorhanden.</div>
                  );
                })()
              ) : (
                <div style={{ color: "#666" }}>Wähle eine Straße, um die Beschreibung zu sehen.</div>
              )}
            </div>
          </div>
  )}

  {activePanel === "houses" && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>Wohnhäuser auswählen</h3>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
    <button onClick={() => setActivePanel(null)} style={{ border: "1px solid #bbb", background: "#f5f5f5", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>Schließen</button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 48px)", gap: 6, justifyContent: "start", maxHeight: "50vh", overflow: "auto", padding: 4 }}>
              {HOUSE_TILE_INDICES.map((idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    const row = Math.floor(idx / SHEET_COLS);
                    const col = idx % SHEET_COLS;
                    toolRef.current = [row, col];
                    setSelectedTileIndex(idx);
                    setPanMode(false);
                    updateCursor();
                  }}
                  style={{
                    width: 48,
                    height: 88,
                    border: selectedTileIndex === idx ? "3px solid #3b82f6" : "2px solid #b05355",
                    boxShadow: selectedTileIndex === idx ? "0 0 0 3px rgba(59,130,246,0.25)" : "none",
                    borderRadius: 6,
                    cursor: "pointer",
                    overflow: "hidden",
                    background: "#f9fafb",
                  }}
                  title={HOUSE_META[idx]?.name || `Wohnhaus`}
                >
                  <div
                    style={{
                      width: TILE_W,
                      height: TILE_H,
                      backgroundImage: "url('/media/01_130x66_130x230.png')",
                      backgroundRepeat: "no-repeat",
                      backgroundPosition: `-${(idx % SHEET_COLS) * TILE_W + 2}px -${Math.floor(idx / SHEET_COLS) * TILE_H}px`,
                      transform: "scale(0.38)",
                      transformOrigin: "top left",
                    }}
                  />
                </button>
              ))}
            </div>

            {/* Beschreibung des ausgewählten Hauses */}
            <div style={{ marginTop: 12, padding: 10, border: "1px solid #eee", borderRadius: 8, background: "#fff" }}>
              {selectedTileIndex != null && (HOUSE_TILE_INDICES as readonly number[]).includes(selectedTileIndex) ? (
                (() => {
                  const meta = HOUSE_META[selectedTileIndex!];
                  return meta ? (
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{meta.name}</div>
                      <div style={{ color: "#444" }}>Preis: {meta.price}</div>
                      {(() => {
                        const steuern = Math.round(meta.price * 0.10);
                        const einwohner = Math.round(meta.price * 0.05);
                        return (
                          <div style={{ marginTop: 6, display: "grid", rowGap: 2 }}>
                            <div style={{ color: "#444" }}>Steuereinnahmen: {steuern.toLocaleString('de-DE')} € pro Monat</div>
                            <div style={{ color: "#444" }}>Einwohner: {einwohner.toLocaleString('de-DE')}</div>
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <div style={{ color: "#666" }}>Keine Beschreibung vorhanden.</div>
                  );
                })()
              ) : (
                <div style={{ color: "#666" }}>Wähle ein Haus, um die Beschreibung zu sehen.</div>
              )}
            </div>
          </div>
  )}

  {activePanel === "market" && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>Supermarkt auswählen</h3>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
    <button onClick={() => setActivePanel(null)} style={{ border: "1px solid #bbb", background: "#f5f5f5", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>Schließen</button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 48px)", gap: 6, justifyContent: "start", maxHeight: "50vh", overflow: "auto", padding: 4 }}>
              {MARKET_TILE_INDICES.map((idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    const row = Math.floor(idx / SHEET_COLS);
                    const col = idx % SHEET_COLS;
                    toolRef.current = [row, col];
                    setSelectedTileIndex(idx);
                    setPanMode(false);
                    updateCursor();
                  }}
                  style={{
                    width: 48,
                    height: 88,
                    border: selectedTileIndex === idx ? "3px solid #3b82f6" : "2px solid #b05355",
                    boxShadow: selectedTileIndex === idx ? "0 0 0 3px rgba(59,130,246,0.25)" : "none",
                    borderRadius: 6,
                    cursor: "pointer",
                    overflow: "hidden",
                    background: "#f9fafb",
                  }}
                  title={MARKET_META[idx]?.name || `Supermarkt`}
                >
                  <div
                    style={{
                      width: TILE_W,
                      height: TILE_H,
                      backgroundImage: "url('/media/01_130x66_130x230.png')",
                      backgroundRepeat: "no-repeat",
                      backgroundPosition: `-${(idx % SHEET_COLS) * TILE_W + 2}px -${Math.floor(idx / SHEET_COLS) * TILE_H}px`,
                      transform: "scale(0.38)",
                      transformOrigin: "top left",
                    }}
                  />
                </button>
              ))}
            </div>
            {/* Beschreibung Supermarkt */}
            <div style={{ marginTop: 12, padding: 10, border: "1px solid #eee", borderRadius: 8, background: "#fff" }}>
              {selectedTileIndex != null && (MARKET_TILE_INDICES as readonly number[]).includes(selectedTileIndex) ? (
                (() => {
                  const meta = MARKET_META[selectedTileIndex!];
                  return meta ? (
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{meta.name}</div>
                      <div style={{ color: "#444" }}>Preis: {meta.price}</div>
                      {(() => {
                        const r = selectedTileIndex === 47 ? 6 : selectedTileIndex === 54 ? 7 : 8;
                        return (
                          <div style={{ color: "#333", marginTop: 6 }}>
                            Wirkung: +20% Steuern für Häuser, Reichweite {r}
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <div style={{ color: "#666" }}>Keine Beschreibung vorhanden.</div>
                  );
                })()
              ) : (
                <div style={{ color: "#666" }}>Wähle einen Supermarkt, um die Beschreibung zu sehen.</div>
              )}
            </div>
          </div>
  )}

  {activePanel === "townhouse" && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>Stadthaus auswählen</h3>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
    <button onClick={() => setActivePanel(null)} style={{ border: "1px solid #bbb", background: "#f5f5f5", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>Schließen</button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 48px)", gap: 6, justifyContent: "start", maxHeight: "50vh", overflow: "auto", padding: 4 }}>
              {TOWNHOUSE_TILE_INDICES.map((idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    const row = Math.floor(idx / SHEET_COLS);
                    const col = idx % SHEET_COLS;
                    toolRef.current = [row, col];
                    setSelectedTileIndex(idx);
                    setPanMode(false);
                    updateCursor();
                  }}
                  style={{
                    width: 48,
                    height: 88,
                    border: selectedTileIndex === idx ? "3px solid #3b82f6" : "2px solid #b05355",
                    boxShadow: selectedTileIndex === idx ? "0 0 0 3px rgba(59,130,246,0.25)" : "none",
                    borderRadius: 6,
                    cursor: "pointer",
                    overflow: "hidden",
                    background: "#f9fafb",
                  }}
                  title={TOWNHOUSE_META[idx]?.name || `Stadthaus`}
                >
                  <div
                    style={{
                      width: TILE_W,
                      height: TILE_H,
                      backgroundImage: "url('/media/01_130x66_130x230.png')",
                      backgroundRepeat: "no-repeat",
                      backgroundPosition: `-${(idx % SHEET_COLS) * TILE_W + 2}px -${Math.floor(idx / SHEET_COLS) * TILE_H}px`,
                      transform: "scale(0.38)",
                      transformOrigin: "top left",
                    }}
                  />
                </button>
              ))}
            </div>
            {/* Beschreibung Stadthaus */}
            <div style={{ marginTop: 12, padding: 10, border: "1px solid #eee", borderRadius: 8, background: "#fff" }}>
              {selectedTileIndex != null && (TOWNHOUSE_TILE_INDICES as readonly number[]).includes(selectedTileIndex) ? (
                (() => {
                  const meta = TOWNHOUSE_META[selectedTileIndex!];
                  return meta ? (
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{meta.name}</div>
                      <div style={{ color: "#444" }}>Preis: {meta.price}</div>
                      {(() => {
                        const steuern = Math.round(meta.price * 0.10);
                        const einwohner = Math.round(meta.price * 0.06); // 20% mehr als Haus-Basis (0.05)
                        return (
                          <div style={{ marginTop: 6, display: "grid", rowGap: 2 }}>
                            <div style={{ color: "#444" }}>Steuereinnahmen (Basis): {steuern.toLocaleString('de-DE')} € pro Monat</div>
                            <div style={{ color: "#444" }}>Einwohner: {einwohner.toLocaleString('de-DE')}</div>
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <div style={{ color: "#666" }}>Keine Beschreibung vorhanden.</div>
                  );
                })()
              ) : (
                <div style={{ color: "#666" }}>Wähle ein Stadthaus, um die Beschreibung zu sehen.</div>
              )}
            </div>
          </div>
  )}

  {activePanel === "kiosk" && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>Kiosk auswählen</h3>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
    <button onClick={() => setActivePanel(null)} style={{ border: "1px solid #bbb", background: "#f5f5f5", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>Schließen</button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 48px)", gap: 6, justifyContent: "start", maxHeight: "50vh", overflow: "auto", padding: 4 }}>
              {KIOSK_TILE_INDICES.map((idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    const row = Math.floor(idx / SHEET_COLS);
                    const col = idx % SHEET_COLS;
                    toolRef.current = [row, col];
                    setSelectedTileIndex(idx);
                    setPanMode(false);
                    updateCursor();
                  }}
                  style={{
                    width: 48,
                    height: 88,
                    border: selectedTileIndex === idx ? "3px solid #3b82f6" : "2px solid #b05355",
                    boxShadow: selectedTileIndex === idx ? "0 0 0 3px rgba(59,130,246,0.25)" : "none",
                    borderRadius: 6,
                    cursor: "pointer",
                    overflow: "hidden",
                    background: "#f9fafb",
                  }}
                  title={KIOSK_META[idx]?.name || `Kiosk`}
                >
                  <div
                    style={{
                      width: TILE_W,
                      height: TILE_H,
                      backgroundImage: "url('/media/01_130x66_130x230.png')",
                      backgroundRepeat: "no-repeat",
                      backgroundPosition: `-${(idx % SHEET_COLS) * TILE_W + 2}px -${Math.floor(idx / SHEET_COLS) * TILE_H}px`,
                      transform: "scale(0.38)",
                      transformOrigin: "top left",
                    }}
                  />
                </button>
              ))}
            </div>
            {/* Beschreibung Kiosk */}
            <div style={{ marginTop: 12, padding: 10, border: "1px solid #eee", borderRadius: 8, background: "#fff" }}>
              {selectedTileIndex != null && (KIOSK_TILE_INDICES as readonly number[]).includes(selectedTileIndex) ? (
                (() => {
                  const meta = KIOSK_META[selectedTileIndex!];
                  return meta ? (
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{meta.name}</div>
                      <div style={{ color: "#444" }}>Preis: {meta.price}</div>
                      {(() => {
                        const r = selectedTileIndex === 66 ? 4 : 5;
                        return (
                          <div style={{ color: "#333", marginTop: 6 }}>
                            Wirkung: +20% Steuern für Häuser, Reichweite {r}
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <div style={{ color: "#666" }}>Keine Beschreibung vorhanden.</div>
                  );
                })()
              ) : (
                <div style={{ color: "#666" }}>Wähle einen Kiosk, um die Beschreibung zu sehen.</div>
              )}
            </div>
          </div>
  )}

  {activePanel === "office" && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>Bürogebäude auswählen</h3>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
    <button onClick={() => setActivePanel(null)} style={{ border: "1px solid #bbb", background: "#f5f5f5", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>Schließen</button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 48px)", gap: 6, justifyContent: "start", maxHeight: "50vh", overflow: "auto", padding: 4 }}>
              {OFFICE_TILE_INDICES.map((idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    const row = Math.floor(idx / SHEET_COLS);
                    const col = idx % SHEET_COLS;
                    toolRef.current = [row, col];
                    setSelectedTileIndex(idx);
                    setPanMode(false);
                    updateCursor();
                  }}
                  style={{
                    width: 48,
                    height: 88,
                    border: selectedTileIndex === idx ? "3px solid #3b82f6" : "2px solid #b05355",
                    boxShadow: selectedTileIndex === idx ? "0 0 0 3px rgba(59,130,246,0.25)" : "none",
                    borderRadius: 6,
                    cursor: "pointer",
                    overflow: "hidden",
                    background: "#f9fafb",
                  }}
                  title={OFFICE_META[idx]?.name || `Bürogebäude`}
                >
                  <div
                    style={{
                      width: TILE_W,
                      height: TILE_H,
                      backgroundImage: "url('/media/01_130x66_130x230.png')",
                      backgroundRepeat: "no-repeat",
                      backgroundPosition: `-${(idx % SHEET_COLS) * TILE_W + 2}px -${Math.floor(idx / SHEET_COLS) * TILE_H}px`,
                      transform: "scale(0.38)",
                      transformOrigin: "top left",
                    }}
                  />
                </button>
              ))}
            </div>
            {/* Beschreibung Bürogebäude */}
            <div style={{ marginTop: 12, padding: 10, border: "1px solid #eee", borderRadius: 8, background: "#fff" }}>
              {selectedTileIndex != null && (OFFICE_TILE_INDICES as readonly number[]).includes(selectedTileIndex) ? (
                (() => {
                  const meta = OFFICE_META[selectedTileIndex!];
                  return meta ? (
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{meta.name}</div>
                      <div style={{ color: "#444" }}>Preis: {meta.price}</div>
                      {(() => {
                        const r = selectedTileIndex === 46 ? 3 : selectedTileIndex === 55 ? 4 : selectedTileIndex === 57 ? 5 : 6;
                        return (
                          <div style={{ color: "#333", marginTop: 6 }}>
                            Wirkung: +20% Einwohner in Häusern, Reichweite {r}
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <div style={{ color: "#666" }}>Keine Beschreibung vorhanden.</div>
                  );
                })()
              ) : (
                <div style={{ color: "#666" }}>Wähle ein Bürogebäude, um die Beschreibung zu sehen.</div>
              )}
            </div>
          </div>
  )}
      </aside>

      <div ref={areaRef} id="area" aria-label="Spielfläche" style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
  <canvas ref={bgRef} id="bg" style={{ position: "absolute", inset: 0, zIndex: 0 }} />
  <canvas ref={fgRef} id="fg" style={{ position: "absolute", inset: 0, zIndex: 10, pointerEvents: "auto" }} />

  {/* Overlay rechts oben: Eigenschaften des Bauwerks im Inspektionsmodus */}
  {inspect && (
    <div role="dialog" aria-label="Eigenschaften" style={{ position: "absolute", top: 12, right: 12, zIndex: 30, background: "rgba(255,255,255,0.98)", padding: "14px 16px", borderRadius: 10, border: '1px solid rgba(0,0,0,0.08)', boxShadow: "0 14px 34px rgba(0,0,0,0.22), 0 2px 8px rgba(0,0,0,0.10)", minWidth: 280 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ fontWeight: 700, color: '#111' }}>{inspect.name}</div>
        <button onClick={() => setInspect(null)} aria-label="Schließen" style={{ border: '1px solid #ddd', background: '#f5f5f5', borderRadius: 6, padding: '2px 6px', cursor: 'pointer' }}>✕</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', alignItems: 'center', columnGap: 10, marginTop: 8 }}>
  <div style={{ width: 48, height: 88, border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', background: '#f9fafb' }}>
          <div
            style={{
              width: TILE_W,
              height: TILE_H,
              backgroundImage: "url('/media/01_130x66_130x230.png')",
              backgroundRepeat: 'no-repeat',
              backgroundPosition: `-${(inspect.idx % SHEET_COLS) * TILE_W + 2}px -${Math.floor(inspect.idx / SHEET_COLS) * TILE_H}px`,
              transform: 'scale(0.38)',
              transformOrigin: 'top left',
            }}
          />
        </div>
        <div>
          <div style={{ color: '#333' }}>Preis: {inspect.price.toLocaleString('de-DE')} €</div>
          {(() => {
            const isKiosk = (KIOSK_TILE_INDICES as readonly number[]).includes(inspect.idx);
            return isKiosk ? (
            <div style={{ color: '#333', marginTop: 6 }}>
              Wirkung: +20% Steuern für Häuser, Reichweite {inspect.idx === 66 ? 4 : 5}
            </div>
            ) : null;
          })()}
          {inspect.type === 'house' && (
            <div style={{ marginTop: 6, display: 'grid', rowGap: 2, color: '#333' }}>
              <div>Steuereinnahmen: {Number(inspect.taxes ?? 0).toLocaleString('de-DE')} € pro Monat</div>
              <div>Einwohner: {Number(inspect.population ?? 0).toLocaleString('de-DE')}</div>
            </div>
          )}
          {(() => {
            const isMarket = (MARKET_TILE_INDICES as readonly number[]).includes(inspect.idx);
            if (!isMarket) return null;
            const r = inspect.idx === 47 ? 6 : inspect.idx === 54 ? 7 : 8;
            return (
              <div style={{ color: '#333', marginTop: 6 }}>
                Wirkung: +40% Steuern für Häuser, Reichweite {r}
              </div>
            );
          })()}
          {(() => {
            const isOffice = (OFFICE_TILE_INDICES as readonly number[]).includes(inspect.idx);
            if (!isOffice) return null;
            const r = inspect.idx === 46 ? 3 : inspect.idx === 55 ? 4 : inspect.idx === 57 ? 5 : 6;
            return (
              <div style={{ color: '#333', marginTop: 6 }}>
                Wirkung: +20% Einwohner und +20% Steuern für Häuser, Reichweite {r}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  )}

  {/* Overlay: Monatsbericht (Einnahmen) */}
  {monthReport && (
    <div role="dialog" aria-label="Monatsbericht" style={{ position: "absolute", top: 12, right: 12, zIndex: 40, background: "rgba(255,255,255,0.98)", padding: "14px 16px", borderRadius: 10, border: '1px solid rgba(0,0,0,0.08)', boxShadow: "0 14px 34px rgba(0,0,0,0.22), 0 2px 8px rgba(0,0,0,0.10)", minWidth: 320 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ fontWeight: 700, color: '#111' }}>Monatsbericht</div>
        <button onClick={() => setMonthReport(null)} aria-label="Schließen" style={{ border: '1px solid #ddd', background: '#f5f5f5', borderRadius: 6, padding: '2px 6px', cursor: 'pointer' }}>✕</button>
      </div>
      <div style={{ marginTop: 8, color: '#111', fontSize: 14 }}>
        <div style={{ display: 'grid', rowGap: 6 }}>
          <div><strong>Gesamteinnahmen:</strong> {monthReport.total.toLocaleString('de-DE')} €</div>
          <div><strong>Einwohner gesamt:</strong> {monthReport.population.toLocaleString('de-DE')}</div>
          <div style={{ color: '#333' }}>Neues Guthaben: {monthReport.newBalance.toLocaleString('de-DE')} €</div>
        </div>
        <div style={{ marginTop: 10, textAlign: 'right' }}>
          <button onClick={() => setMonthReport(null)} style={{ border: '1px solid #bbb', background: '#eef6ff', color: '#111', borderRadius: 6, padding: '6px 10px', cursor: 'pointer' }}>OK</button>
        </div>
      </div>
    </div>
  )}

  {/* Last modified timestamp bottom-left */}
  <div aria-hidden style={{ position: "absolute", left: 8, bottom: 8, zIndex: 30, background: "rgba(255,255,255,0.85)", padding: "6px 8px", borderRadius: 6, fontSize: 12, color: "#333", boxShadow: "0 6px 20px rgba(0,0,0,0.12)" }}>
    {lastModified ? new Date(lastModified).toLocaleString() : "Nicht geändert"}
  </div>

  {/* Fehler-Overlay (kein Modal/MsgBox) */}
  {errorMsg && (
    <div role="status" aria-live="assertive" style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", bottom: 16, zIndex: 40, background: "rgba(220, 53, 69, 0.95)", color: "#fff", padding: "10px 14px", borderRadius: 8, boxShadow: "0 10px 25px rgba(0,0,0,0.2)", fontSize: 14, maxWidth: 360, textAlign: "center", pointerEvents: "none" }}>
      {errorMsg}
    </div>
  )}

  {/* Hinweistext wurde in die Sidebar verlegt */}
      </div>
    </div>
  );
}
