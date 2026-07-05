'use client';

import React, { useState, useEffect } from 'react';

export default function EditBoardModal({
  showEditBoardModal,
  setShowEditBoardModal,
  editingBoardObj, // { id, name, board_identifier }
  editingBoardDevices, // Array of 4 devices
  saveFullBoardEdit, // (boardId, newName, newIdentifier, newDeviceNames) => Promise
  modalDragY,
  modalDragging,
  handleModalTouchStart,
  handleModalTouchMove,
  handleModalTouchEnd
}) {
  const [boardName, setBoardName] = useState('');
  const [boardIdentifier, setBoardIdentifier] = useState('');
  const [deviceNames, setDeviceNames] = useState(['', '', '', '']);

  // Pre-fill form when modal opens or when editing a different board
  useEffect(() => {
    if (showEditBoardModal && editingBoardObj) {
      setBoardName(editingBoardObj.name || '');
      setBoardIdentifier(editingBoardObj.board_identifier || '');
      
      const newDevNames = ['', '', '', ''];
      if (editingBoardDevices && editingBoardDevices.length > 0) {
        editingBoardDevices.forEach(d => {
          if (d.relay_index >= 0 && d.relay_index <= 3) {
            newDevNames[d.relay_index] = d.name;
          }
        });
      }
      setDeviceNames(newDevNames);
    }
  // We explicitly ignore editingBoardDevices in dependencies to prevent the form from 
  // resetting on every parent re-render (which happens on touch events for the drag gesture).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showEditBoardModal, editingBoardObj?.id]);

  const handleDeviceNameChange = (index, value) => {
    const updated = [...deviceNames];
    updated[index] = value;
    setDeviceNames(updated);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!editingBoardObj) return;
    saveFullBoardEdit(editingBoardObj.id, boardName, boardIdentifier, deviceNames);
  };

  if (!showEditBoardModal) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/65 p-[22px] backdrop-blur-md animate-scale-in max-md:items-end max-md:p-0"
      onClick={() => setShowEditBoardModal(false)}
    >
      <div
        onTouchStart={handleModalTouchStart}
        onTouchMove={handleModalTouchMove}
        onTouchEnd={handleModalTouchEnd}
        style={{
          transform: `translateY(${modalDragY}px)`,
          transition: modalDragging ? 'none' : 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
        className="max-h-[88vh] w-[min(100%,440px)] overflow-auto rounded-[18px] border border-border bg-card p-6 shadow-2xl animate-fade-up max-md:w-full max-md:max-h-[92vh] max-md:rounded-t-[24px] max-md:rounded-b-none max-md:border-t max-md:border-x-0 max-md:border-b-0 max-md:pb-10 max-md:animate-slide-up max-md:shadow-none flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="hidden max-md:block w-12 h-1 bg-border rounded-full mx-auto mb-5 shrink-0" />
        <h2 className="mb-4 text-lg font-extrabold text-text">Edit Board & Devices</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-extrabold tracking-wide text-text-muted">Board Name</label>
            <input
              type="text"
              value={boardName}
              onChange={(e) => setBoardName(e.target.value)}
              placeholder="e.g., Living Room"
              required
              className="w-full px-4 py-2.5 rounded-lg border-[1.5px] border-border bg-input text-text text-sm outline-none transition-all focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-bg)]"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-extrabold tracking-wide text-text-muted">Board ID</label>
            <input
              type="text"
              value={boardIdentifier}
              onChange={(e) => setBoardIdentifier(e.target.value)}
              placeholder="e.g., BOARD-XYZ"
              required
              className="w-full px-4 py-2.5 rounded-lg border-[1.5px] border-border bg-input text-text text-sm outline-none transition-all focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-bg)]"
            />
          </div>
          
          <div className="mt-2 text-xs font-extrabold tracking-wide text-text-muted mb-[-4px]">Device Names</div>
          <div className="grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-text-muted/70">Relay {i}</label>
                <input
                  type="text"
                  value={deviceNames[i]}
                  onChange={(e) => handleDeviceNameChange(i, e.target.value)}
                  placeholder={`Device ${i + 1}`}
                  required
                  className="w-full px-3 py-2 rounded-lg border border-border bg-input text-text text-xs outline-none transition-all focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-bg)]"
                />
              </div>
            ))}
          </div>

          <div className="mt-4 flex justify-end gap-2.5">
            <button
              type="button"
              className="inline-flex min-h-[36px] items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-xs font-semibold text-text transition-all hover:bg-card-alt cursor-pointer"
              onClick={() => setShowEditBoardModal(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex min-h-[36px] items-center justify-center gap-2 rounded-lg bg-accent px-5 py-2 text-xs font-extrabold text-[#0a0800] transition-all hover:bg-accent-hover cursor-pointer shadow-gold-glow"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
