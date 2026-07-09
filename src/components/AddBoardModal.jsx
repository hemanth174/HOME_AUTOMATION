'use client';

import React from 'react';

export default function AddBoardModal({
  showAddBoardModal,
  setShowAddBoardModal,
  boardIdentifier,
  setBoardIdentifier,
  boardName,
  setBoardName,
  addBoard,
  modalDragY,
  modalDragging,
  handleModalTouchStart,
  handleModalTouchMove,
  handleModalTouchEnd
}) {
  if (!showAddBoardModal) return null;

  return (
    <div 
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/65 p-[22px] backdrop-blur-md animate-scale-in max-md:items-end max-md:p-0" 
      onClick={() => setShowAddBoardModal(false)}
    >
      <div 
        onTouchStart={handleModalTouchStart}
        onTouchMove={handleModalTouchMove}
        onTouchEnd={handleModalTouchEnd}
        style={{
          transform: `translateY(${modalDragY}px)`,
          transition: modalDragging ? 'none' : 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
        className="max-h-[82vh] w-[min(100%,440px)] overflow-auto rounded-[18px] border border-border bg-card p-6 shadow-2xl backdrop-blur-xl animate-fade-up max-md:w-full max-md:max-h-[85vh] max-md:rounded-t-[24px] max-md:rounded-b-none max-md:border-t max-md:border-x-0 max-md:border-b-0 max-md:pb-10 max-md:animate-slide-up max-md:shadow-none flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag Handle for Mobile */}
        <div className="hidden max-md:block w-12 h-1 bg-border rounded-full mx-auto mb-5 shrink-0" />
        <h2 className="mb-[18px] text-lg font-extrabold text-text">Add Board</h2>
        <form onSubmit={addBoard} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-extrabold tracking-wide text-text-muted">Board Identifier (ESP32 ID)</label>
            <input
              className="w-full px-4 py-2.5 rounded-lg border-[1.5px] border-border bg-input text-text text-sm outline-none transition-all focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-bg)]"
              type="text"
              value={boardIdentifier}
              onChange={(e) => setBoardIdentifier(e.target.value)}
              placeholder="e.g., ESP32_001"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-extrabold tracking-wide text-text-muted">Display Name</label>
            <input
              className="w-full px-4 py-2.5 rounded-lg border-[1.5px] border-border bg-input text-text text-sm outline-none transition-all focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-bg)]"
              type="text"
              value={boardName}
              onChange={(e) => setBoardName(e.target.value)}
              placeholder="e.g., Living Room"
            />
          </div>
          <div className="mt-5 flex justify-end gap-2.5">
            <button
              type="button"
              className="inline-flex min-h-[36px] items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-xs font-semibold text-text transition-all hover:bg-card-alt cursor-pointer"
              onClick={() => setShowAddBoardModal(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex min-h-[36px] items-center justify-center gap-2 rounded-lg bg-accent px-5 py-2 text-xs font-extrabold text-[var(--btn-text)] transition-all hover:bg-accent-hover cursor-pointer shadow-gold-glow"
            >
              Add Board
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
