'use client';

import React from 'react';

export default function QuickPresets({
  presets,
  isPresetActive,
  applyPreset,
  deletePreset
}) {
  if (!presets || presets.length === 0) return null;

  return (
    <section className="mb-[18px]">
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
              <div className="flex shrink-0 gap-2">
                <button
                  className="inline-flex min-h-[30px] items-center justify-center gap-2 rounded-lg bg-accent px-3 py-1 text-xs font-extrabold text-[#0a0800] transition-all duration-250 cursor-pointer hover:bg-accent-hover active:translate-y-0 shadow-gold-glow"
                  onClick={() => applyPreset(preset, active)}
                >
                  {active ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  className="inline-flex min-h-[30px] items-center justify-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1 text-xs font-extrabold text-red-500 transition-all duration-250 cursor-pointer hover:bg-red-500 hover:text-white active:translate-y-0"
                  onClick={() => deletePreset(preset.id)}
                >
                  Delete
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
