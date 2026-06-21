'use client';

import React, { memo } from 'react';
import { ChevronUp } from 'lucide-react';

const BoardCard = memo(function BoardCard({
  board,
  boardDevices,
  expandedBoards,
  toggleBoard,
  editingBoard,
  editName,
  setEditName,
  startEditBoard,
  saveEditBoard,
  turnBoardDevicesOn,
  turnBoardDevicesOff,
  editingDevice,
  startEditDevice,
  saveEditDevice,
  getFeedbackStatus,
  toggleDevice
}) {
  const isExpanded = expandedBoards[board.id];
  const isOnline = board.last_seen 
    ? (Date.now() - new Date(board.last_seen).getTime() < 5 * 60 * 1000) 
    : false;

  return (
    <div className="relative overflow-hidden rounded-[18px] border border-border bg-card shadow-lg backdrop-blur-md transition-all duration-250 ease-out hover:border-accent/40 animate-fade-up">
      <div
        className="flex min-h-[58px] cursor-pointer select-none items-center justify-between gap-3 bg-card-alt border-b border-border px-[18px] py-[15px] max-[430px]:px-3.5 max-[430px]:py-[13px] hover:bg-card/40 transition-all"
        onClick={() => toggleBoard(board.id)}
      >
        <div className="flex items-center gap-2.5 min-w-0" onClick={(e) => e.stopPropagation()}>
          {editingBoard === board.id ? (
            <input
              className="min-w-[120px] border-0 border-b border-dashed border-accent bg-transparent text-[inherit] font-[inherit] text-text outline-0 focus:shadow-[0_6px_0_-5px_var(--accent)]"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={() => saveEditBoard(board.id)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveEditBoard(board.id); }}
              autoFocus
            />
          ) : (
            <span
              className="max-w-full truncate text-[14px] font-extrabold text-text hover:border-border hover:bg-input border border-transparent rounded px-1 cursor-text"
              onDoubleClick={() => startEditBoard(board)}
              title="Double-click to rename"
            >
              {board.name}
            </span>
          )}
          
          {/* Connection Indicator Badge */}
          <span className={`flex items-center gap-1 text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded ${isOnline ? 'text-emerald-500 bg-emerald-500/10' : 'text-red-500 bg-red-500/10'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
            {isOnline ? 'Online' : 'Offline'}
          </span>

          <span className="text-[11px] text-text-muted font-bold whitespace-nowrap bg-bg px-2 py-0.5 rounded-md">
            {boardDevices.length} devices
          </span>
        </div>
        
        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            className="inline-flex h-[26px] items-center justify-center rounded bg-card border border-border px-2.5 py-0.5 text-[10px] font-extrabold text-text transition-all duration-200 hover:bg-card-alt hover:border-accent/40 cursor-pointer"
            onClick={() => turnBoardDevicesOn(board.id, board.name)}
          >
            All On
          </button>
          <button
            className="inline-flex h-[26px] items-center justify-center rounded bg-card border border-border px-2.5 py-0.5 text-[10px] font-extrabold text-text transition-all duration-200 hover:bg-card-alt hover:border-accent/40 cursor-pointer"
            onClick={() => turnBoardDevicesOff(board.id, board.name)}
          >
            All Off
          </button>
          <button
            className={`grid h-7 w-7 place-items-center rounded-full border border-border text-[10px] text-accent transition-all duration-300 font-bold cursor-pointer ${isExpanded ? 'rotate-180 bg-accent-bg' : ''}`}
            onClick={() => toggleBoard(board.id)}
          >
            <ChevronUp size={14} />
          </button>
        </div>
      </div>

      <div className={`grid gap-3 overflow-hidden px-4 opacity-0 transition-all duration-300 ease-out max-md:grid-cols-2 max-md:gap-2.5 max-md:px-3 ${isExpanded ? 'grid-cols-4 max-h-[1200px] p-4 opacity-100 max-md:p-3' : 'max-h-0'}`}>
        {boardDevices.map((device) => {
          const feedback = getFeedbackStatus(device);
          return (
            <div
              className={`flex min-h-[122px] flex-col items-center justify-center gap-[13px] rounded-2xl border px-3 py-4 text-center transition-all duration-250 ease-out hover:-translate-y-0.5 max-[430px]:min-h-[108px] max-[430px]:px-2.5 max-[430px]:py-[13px] ${
                feedback.manualOn
                  ? 'border-red-500/60 bg-red-500/10 shadow-[0_0_16px_rgba(239,68,68,0.25)] animate-pulse-dot-red'
                  : device.is_on
                    ? 'border-accent/50 bg-accent-bg shadow-gold-glow animate-glow-pulse hover:border-accent/45 hover:bg-accent-bg'
                    : 'border-border bg-white/[0.025] hover:border-accent/45 hover:bg-accent-bg'
              }`}
              key={device.id}
            >
              <div className="flex min-w-0 flex-col items-center gap-1 w-full">
                {editingDevice === device.id ? (
                  <input
                    className="w-full text-center border-0 border-b border-dashed border-accent bg-transparent text-[inherit] font-[inherit] text-text outline-0 focus:shadow-[0_6px_0_-5px_var(--accent)]"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={() => saveEditDevice(device.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveEditDevice(device.id); }}
                    autoFocus
                  />
                ) : (
                  <span
                    className="break-words text-[12px] font-bold leading-tight text-text hover:border-border hover:bg-input border border-transparent rounded px-1.5 cursor-pointer max-w-full"
                    onClick={() => startEditDevice(device)}
                    title="Click to rename"
                  >
                    {device.name}
                  </span>
                )}
                <span
                  className={`text-[10px] font-extrabold uppercase tracking-[0.05em] ${
                    feedback.className === 'manual'
                      ? 'text-red-400'
                      : feedback.className === 'match'
                        ? 'text-[#73C983]'
                        : 'text-text-muted'
                  }`}
                >
                  {feedback.text}
                </span>
              </div>
              <div
                className="relative h-[24px] w-11 shrink-0 rounded-full border border-border bg-toggle-track transition-all duration-250 cursor-pointer"
                onClick={() => toggleDevice(device)}
              >
                <div
                  className={`absolute top-[2px] left-[2px] h-[18px] w-[18px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.25)] transition-transform duration-250 ease-out ${device.is_on ? 'translate-x-[20px]' : ''}`}
                />
              </div>
            </div>
          );
        })}
        {boardDevices.length === 0 && (
          <div className="col-span-full py-6 text-center text-text-muted text-xs font-semibold">
            No devices on this board
          </div>
        )}
      </div>
    </div>
  );
});

export default BoardCard;
