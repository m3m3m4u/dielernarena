"use client";
import React from 'react';
import CategorySelect from './CategorySelect';

interface Props {
  title: string;
  setTitle: (v: string)=>void;
  category: string;
  setCategory: (v: string)=>void;
  titlePlaceholder?: string;
  heading?: string;
}

export default function TitleCategoryBar({ title, setTitle, category, setCategory, titlePlaceholder='Titel', heading='📝 Titel & Kategorie' }: Props){
  return (
    <div className="mb-6 bg-white border rounded p-6">
      <h3 className="font-semibold mb-4">{heading}</h3>
      <div className="flex flex-col md:flex-row gap-4">
        <input value={title} onChange={e=>setTitle(e.target.value)} className="flex-1 p-3 border rounded text-lg" placeholder={titlePlaceholder} />
        <CategorySelect value={category} onChange={setCategory} />
      </div>
    </div>
  );
}
