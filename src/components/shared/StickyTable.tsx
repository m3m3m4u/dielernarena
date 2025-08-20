"use client";
import React from "react";

type Column<Row> = {
  key: string;
  header: React.ReactNode;
  /** Additional classes for <th> */
  thClassName?: string;
  /** Additional classes for <td> */
  tdClassName?: string;
  /** Hide classes for header+cell, e.g. 'hidden sm:table-cell' */
  hideClassName?: string;
  /** Mark this column as sticky on the left (only first sticky column is supported) */
  sticky?: boolean;
  /** Mark this column as sticky on the right (use sparingly, e.g., action column) */
  stickyRight?: boolean;
  /** Column is sortable (client-side) */
  sortable?: boolean;
  /** Accessor for sorting; defaults to row[key] */
  sortAccessor?: (row: Row) => any;
  /** Hint for comparison */
  sortType?: 'string' | 'number' | 'date';
  /** Align cell content */
  align?: 'left' | 'right' | 'center';
  /** Numeric columns auto right-align and use tabular-nums */
  numeric?: boolean;
  /** Optional custom header renderer */
  renderHeader?: () => React.ReactNode;
  /** Optional custom cell renderer; if omitted, row[col.key] will be shown */
  render?: (row: Row, rowIndex: number) => React.ReactNode;
};

export type StickyTableProps<Row> = {
  columns: Column<Row>[];
  rows: Row[];
  /** px value or tailwind class string, default 'min-w-[900px]' */
  minWidthClassName?: string;
  /** text size utility, e.g. 'text-[11px]' or 'text-sm' (overrides density) */
  sizeClassName?: string;
  /** Apply zebra striping (default true) */
  zebra?: boolean;
  /** Controls padding/text size presets */
  density?: 'compact' | 'normal' | 'relaxed';
  /** Extra classes for wrapping div */
  wrapperClassName?: string;
  /** Extra classes for table */
  tableClassName?: string;
  /** Message when rows empty */
  emptyMessage?: string;
  /** When loading, show a single-row loading message */
  loading?: boolean;
  /** Colspan override for empty/loading rows; defaults to columns.length */
  colSpan?: number;
  /** Show subtle gradient shadow on sticky edges (default true) */
  showStickyEdges?: boolean;
  /** Initial sort config */
  initialSort?: { key: string; direction: 'asc' | 'desc' };
  /** Notify on sort change */
  onSortChange?: (sort: { key: string; direction: 'asc' | 'desc' }) => void;
  /** Skeleton rows count while loading */
  skeletonRows?: number;
};

export default function StickyTable<Row extends Record<string, any>>({
  columns,
  rows,
  minWidthClassName = "min-w-[840px]",
  sizeClassName,
  zebra = true,
  density = 'normal',
  wrapperClassName = "",
  tableClassName = "",
  emptyMessage = "Keine Daten",
  loading = false,
  colSpan,
  showStickyEdges = true,
  initialSort,
  onSortChange,
  skeletonRows = 6,
}: StickyTableProps<Row>) {
  const computedColSpan = colSpan ?? columns.length;
  const stickyDeclared = columns.some(c => c.sticky);
  const densityPadTh = density==='compact' ? 'px-2 py-1' : density==='relaxed' ? 'px-5 py-3' : 'px-4 py-2';
  const densityPadTd = density==='compact' ? 'px-2 py-1' : density==='relaxed' ? 'px-5 py-3' : 'px-4 py-2';
  const computedSize = sizeClassName ?? (density==='compact' ? 'text-[11px]' : density==='relaxed' ? 'text-base' : 'text-sm');

  const [sort, setSort] = React.useState<{ key: string; direction: 'asc' | 'desc' } | null>(initialSort || null);
  React.useEffect(()=>{ if(initialSort) setSort(initialSort); }, [initialSort?.key, initialSort?.direction]);
  const colByKey = React.useMemo(()=>Object.fromEntries(columns.map(c=>[c.key, c])), [columns]);
  const sortedRows = React.useMemo(()=>{
    if(!sort) return rows;
    const col = colByKey[sort.key];
    if(!col) return rows;
    const dir = sort.direction === 'asc' ? 1 : -1;
    const val = (r: Row) => col.sortAccessor ? col.sortAccessor(r) : (r as any)[col.key];
    const type = col.sortType;
    const cmp = (a:any,b:any)=>{
      if(type==='number'){ const na=Number(a)||0, nb=Number(b)||0; return na===nb?0:(na<nb?-1:1); }
      if(type==='date'){ const ta=(a? new Date(a).getTime():0), tb=(b? new Date(b).getTime():0); return ta===tb?0:(ta<tb?-1:1); }
      const sa = (a??'').toString().toLocaleLowerCase();
      const sb = (b??'').toString().toLocaleLowerCase();
      return sa.localeCompare(sb);
    };
    return [...rows].sort((ra:any, rb:any)=> cmp(val(ra), val(rb)) * dir);
  }, [rows, sort, colByKey]);
  const requestSort = (key: string)=>{
    const col = colByKey[key]; if(!col || col.sortable===false) return;
    setSort(prev => {
      const next: { key: string; direction: 'asc' | 'desc' } = !prev || prev.key!==key
        ? { key, direction:'asc' }
        : { key, direction: (prev.direction==='asc' ? 'desc' : 'asc') };
      onSortChange?.(next); return next;
    });
  };
  return (
    <div className={"overflow-x-auto relative " + wrapperClassName}>
      <table className={["w-full", computedSize, minWidthClassName, tableClassName].filter(Boolean).join(" ")}>
        <thead>
          <tr className="text-left">
            {columns.map((col, idx) => {
              const isSticky = col.sticky || (!stickyDeclared && idx === 0);
              const className = [
                densityPadTh,
                "bg-gray-50 sticky top-0 z-20",
        isSticky ? "left-0 z-30" : "",
        col.stickyRight ? "right-0 z-30" : "",
        // Edge shadows
                (showStickyEdges && isSticky ? "sticky-edge-left" : ""),
                (showStickyEdges && col.stickyRight ? "sticky-edge-right" : ""),
                col.hideClassName || "",
                col.thClassName || "",
                col.numeric ? "text-right" : (col.align==='center' ? 'text-center' : ''),
              ].filter(Boolean).join(" ");
              const isSorted = sort?.key===col.key;
              const ariaSort = isSorted ? (sort!.direction==='asc'?'ascending':'descending') : 'none';
              const content = col.renderHeader ? col.renderHeader() : col.header;
              const sortable = !!col.sortable && !col.stickyRight;
              return (
                <th key={col.key} className={className} scope="col" aria-sort={ariaSort as any}>
                  {sortable ? (
                    <button type="button" onClick={()=>requestSort(col.key)} className="inline-flex items-center gap-1 select-none cursor-pointer">
                      <span>{content}</span>
                      <span aria-hidden className="text-gray-400">
                        {isSorted ? (sort!.direction==='asc' ? '▲' : '▼') : '↕'}
                      </span>
                    </button>
                  ) : content}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: skeletonRows }).map((_, i)=> (
              <tr key={`sk-${i}`} className="border-t">
                {columns.map((col, cIdx)=> (
                  <td key={cIdx} className={[
                    densityPadTd,
                    (col.sticky || (!stickyDeclared && cIdx===0)) ? "sticky left-0 bg-white z-10" : "",
                    col.stickyRight ? "sticky right-0 bg-white z-10" : "",
                    col.hideClassName||'', col.tdClassName||'', col.numeric? 'text-right tabular-nums' : (col.align==='center'?'text-center':'')
                  ].filter(Boolean).join(' ')}>
                    <div className="h-3 rounded bg-gray-200 animate-pulse w-24" />
                  </td>
                ))}
              </tr>
            ))
          ) : rows.length === 0 ? (
            <tr><td colSpan={computedColSpan} className="px-4 py-3 text-center text-gray-500">{emptyMessage}</td></tr>
          ) : (
            sortedRows.map((row, rIdx) => (
              <tr key={(row as any).id ?? (row as any)._id ?? rIdx} className={["border-t", zebra ? (rIdx % 2 === 1 ? "bg-gray-50" : "") : ""].join(" ")}> 
                {columns.map((col, cIdx) => {
                  const isSticky = col.sticky || (!stickyDeclared && cIdx === 0);
                  const className = [
                    densityPadTd,
                    isSticky ? "sticky left-0 bg-white z-10" : "",
                    col.stickyRight ? "sticky right-0 bg-white z-10" : "",
          // Edge shadows
                    (showStickyEdges && isSticky ? "sticky-edge-left" : ""),
                    (showStickyEdges && col.stickyRight ? "sticky-edge-right" : ""),
                    col.hideClassName || "",
                    col.tdClassName || "",
                    col.numeric ? "text-right tabular-nums" : (col.align==='center' ? 'text-center' : ''),
                  ].filter(Boolean).join(" ");
                  return (
                    <td key={col.key} className={className}>
                      {col.render ? col.render(row, rIdx) : String((row as any)[col.key] ?? "—")}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
