"use client";
import React from 'react';
import { CATEGORIES } from '@/lib/categories';
export const CATEGORY_OPTIONS = CATEGORIES;

interface Props {
  value: string;
  onChange: (v: string)=>void;
  labelClassName?: string;
  selectClassName?: string;
  label?: string;
  required?: boolean;
  includeEmpty?: boolean;
  emptyLabel?: string;
}

export default function CategorySelect({ value, onChange, label='Kategorie', required, includeEmpty=false, emptyLabel='— wählen —', labelClassName='block text-xs font-semibold text-gray-600 mb-1', selectClassName='w-full p-2 border rounded text-sm' }: Props){
  return (
    <div className="min-w-[200px]">
      <label className={labelClassName}>{label}{required && ' *'}</label>
      <select value={value} onChange={e=>onChange(e.target.value)} className={selectClassName}>
        {includeEmpty && <option value="">{emptyLabel}</option>}
  {CATEGORY_OPTIONS.map(opt=> <option key={opt} value={opt}>{opt}</option>)}
      </select>
    </div>
  );
}
