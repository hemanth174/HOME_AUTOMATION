'use client';

import PresetDeviceList from './PresetDeviceList';

export default function PresetModal({
  editingPreset,
  presetActions,
  presetName,
  setPresetName,
  devices,
  savePreset,
  closeModal,
  togglePresetDevice,
  togglePresetAction,
  saving = false,
  canSave = true,
}) {
  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/65 p-[22px] backdrop-blur-md animate-scale-in max-md:items-end max-md:p-0"
      onClick={closeModal}
    >
      <div
        className="max-h-[88vh] w-[min(100%,440px)] overflow-auto rounded-[18px] border border-border bg-card p-6 shadow-2xl animate-fade-up max-md:w-full max-md:max-h-[92vh] max-md:rounded-t-[24px] max-md:rounded-b-none max-md:border-t max-md:border-x-0 max-md:border-b-0 max-md:pb-10 max-md:animate-slide-up max-md:shadow-none flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div data-sheet-handle="1" className="hidden max-md:block w-12 h-1 cursor-grab touch-none bg-border rounded-full mx-auto mb-5 shrink-0 active:cursor-grabbing" />
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-extrabold text-text">{editingPreset ? `Edit: ${editingPreset.name}` : 'New Preset'}</h2>
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-md bg-accent-bg px-2 py-1 text-[10px] font-extrabold text-accent">
              {Object.values(presetActions).filter((action) => action.included).length} selected
            </span>
            {editingPreset && <span className="rounded-md bg-accent-bg px-2 py-1 text-[10px] font-extrabold uppercase tracking-widest text-accent">Editing</span>}
          </div>
        </div>
        <form onSubmit={savePreset} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-extrabold tracking-wide text-text-muted">Preset Name</label>
            <input className="w-full px-4 py-2.5 rounded-lg border-[1.5px] border-border bg-input text-text text-sm outline-none transition-all focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-bg)]" type="text" value={presetName} onChange={e => setPresetName(e.target.value)} placeholder="e.g., Party Mode" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-extrabold tracking-wide text-text-muted">Select Devices <span className="ml-1 text-[10px] font-bold text-text-muted/60">(grouped by board)</span></label>
            <PresetDeviceList devices={devices} presetActions={presetActions} onToggleDevice={togglePresetDevice} onToggleAction={togglePresetAction} />
          </div>
          <div className="mt-4 flex justify-end gap-2.5">
            <button type="button" data-sheet-close="1" className="inline-flex min-h-[36px] items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-xs font-semibold text-text transition-all hover:bg-card-alt cursor-pointer" onClick={closeModal}>Cancel</button>
            <button type="submit" disabled={saving || !canSave} className="inline-flex min-h-[36px] items-center justify-center gap-2 rounded-lg bg-accent px-5 py-2 text-xs font-extrabold text-[var(--btn-text)] transition-all hover:bg-accent-hover cursor-pointer shadow-gold-glow disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Saving...' : editingPreset ? 'Save Changes' : 'Create'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
