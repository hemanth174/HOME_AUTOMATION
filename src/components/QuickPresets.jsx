'use client';

import React from 'react';
import { LucidePower, LucidePowerOff, Trash2 } from 'lucide-react';
export default function QuickPresets({
  presets,
  isPresetActive,
  applyPreset,
  deletePreset
}) {
  if (!presets || presets.length === 0) return null;

  return (
    <section className="mb-[18px] quick-presets-section">
      <div className="ml-1 mb-[9px] text-[11px] font-black uppercase tracking-[0.12em] text-text-muted">Quick Presets</div>
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pt-0.5 pb-3">
        {presets.map((preset) => {
          const active = isPresetActive(preset);
          return (
            <article
              key={preset.id}
              className={`flex min-w-[250px] max-w-[310px] flex-[0_0_250px] snap-start items-center justify-between gap-3.5 rounded-[18px] border bg-card p-[15px] shadow-lg transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-2xl ${
                active
                  ? 'border-accent bg-[linear-gradient(135deg,rgba(201,168,76,0.14),rgba(255,255,255,0.035))]'
                  : 'border-border hover:border-accent/40'
              }`}
            >
              <div className="flex-1 min-w-0">
                <strong className="mb-1 block truncate text-sm font-black text-text">{preset.name}</strong>
                <span className="text-xs font-bold text-text-muted">
                  {preset.actions?.length || 0} device{preset.actions?.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="flex shrink-0 gap-2 items-center">
                <button
                  className={`inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border transition-all duration-250 cursor-pointer hover:scale-105 active:scale-95 ${
                    active 
                      ? 'border-accent bg-accent text-[#0a0800] shadow-gold-glow'
                      : 'border-border bg-card text-text-muted hover:border-accent hover:text-accent hover:shadow-[0_0_12px_rgba(201,168,76,0.3)]'
                  }`}
                  onClick={() => applyPreset(preset, active)}
                  title={active ? 'Deactivate' : 'Activate'}
                >
                  {active ? <LucidePowerOff size={16} strokeWidth={2.5} /> : <LucidePower size={16} strokeWidth={2.5} />}
                </button>
                <button
                  className="inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border border-red-500/40 bg-red-500/10 text-red-500 transition-all duration-250 cursor-pointer hover:scale-105 active:scale-95 hover:bg-red-500 hover:text-white hover:shadow-[0_0_12px_rgba(239,68,68,0.5)]"
                  onClick={() => deletePreset(preset.id)}
                  title="Delete Preset"
                >
                  <Trash2 size={16} strokeWidth={2.5} />
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
