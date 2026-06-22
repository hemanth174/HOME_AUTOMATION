'use client';

import React, { memo } from 'react';
import { ChevronUp, Pencil, LucidePower, LucidePowerOff } from 'lucide-react';

const BoardCard = memo(function BoardCard({
  board,
  boardDevices,
  expandedBoards,
  toggleBoard,
  turnBoardDevicesOn,
  turnBoardDevicesOff,
  getFeedbackStatus,
  toggleDevice,
  openFullEditBoard
}) {
  const isExpanded = expandedBoards[board.id];
  const anyOn = boardDevices.some(d => d.is_on);

  return (
    <div className="relative overflow-hidden rounded-[18px] border border-border bg-card shadow-lg backdrop-blur-md transition-all duration-250 ease-out hover:border-accent/40 animate-fade-up">
      <div
        className="flex flex-wrap min-h-[58px] cursor-pointer select-none items-center justify-between gap-3 bg-card-alt border-b border-border px-[18px] py-[15px] max-[430px]:px-3.5 max-[430px]:py-[13px] hover:bg-card/40 transition-all"
        onClick={() => toggleBoard(board.id)}
      >
        <div className="flex items-center gap-2.5 min-w-0" onClick={(e) => e.stopPropagation()}>
          <span
            className="max-w-full truncate text-[14px] font-extrabold text-text px-1"
            title={board.name}
          >
            {board.name}
          </span>
          <span className="text-[11px] text-text-muted font-bold whitespace-nowrap bg-bg px-2 py-0.5 rounded-md">
            {boardDevices.length} devices
          </span>
        </div>
        
        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            className={`inline-flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full border transition-all duration-250 cursor-pointer hover:scale-105 active:scale-95 ${
              anyOn 
                ? 'border-accent bg-accent text-[#0a0800] shadow-gold-glow'
                : 'border-border bg-card text-text-muted hover:border-accent hover:text-accent hover:shadow-[0_0_12px_rgba(201,168,76,0.3)]'
            }`}
            onClick={() => {
              if (anyOn) turnBoardDevicesOff(board.id, board.name);
              else turnBoardDevicesOn(board.id, board.name);
            }}
            title={anyOn ? "Turn All Off" : "Turn All On"}
          >
            {anyOn ? <LucidePowerOff size={14} strokeWidth={2.5} /> : <LucidePower size={14} strokeWidth={2.5} />}
          </button>
          <button
            className={`grid h-7 w-7 place-items-center rounded-full border border-border text-[10px] text-accent transition-all duration-300 font-bold cursor-pointer ${isExpanded ? 'rotate-180 bg-accent-bg' : ''}`}
            onClick={() => toggleBoard(board.id)}
            title="Expand / Collapse"
          >
            <ChevronUp size={14} />
          </button>
          <button
            className="grid h-7 w-7 place-items-center rounded-full border border-border text-text-muted transition-all duration-200 hover:text-accent hover:border-accent hover:bg-accent-bg cursor-pointer"
            onClick={() => openFullEditBoard(board)}
            title="Edit Board & Devices"
          >
            <Pencil size={12} />
          </button>
        </div>
      </div>

      <div className={`grid gap-3 overflow-hidden px-4 opacity-0 transition-all duration-300 ease-out max-md:grid-cols-2 max-md:gap-2.5 max-md:px-3 ${isExpanded ? 'grid-cols-4 max-h-[1200px] p-4 opacity-100 max-md:p-3' : 'max-h-0'}`}>
        {boardDevices.map((device) => {
          const feedback = getFeedbackStatus(device);
          return (
            <div
              className={`flex min-h-[96px] flex-col items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-center transition-all duration-250 ease-out hover:-translate-y-0.5 max-[430px]:min-h-[84px] max-[430px]:px-2.5 max-[430px]:py-2 max-[430px]:gap-1.5 ${
                feedback.manualOn
                  ? 'border-red-500/60 bg-red-500/10 shadow-[0_0_16px_rgba(239,68,68,0.25)] animate-pulse-dot-red'
                  : device.is_on
                    ? 'border-accent/50 bg-accent-bg shadow-gold-glow animate-glow-pulse hover:border-accent/45 hover:bg-accent-bg'
                    : 'border-border bg-white/[0.025] hover:border-accent/45 hover:bg-accent-bg'
              }`}
              key={device.id}
            >
              <div className="flex min-w-0 flex-col items-center w-full">
                <span
                  className="break-words text-[14px] font-bold leading-tight text-text px-1 max-w-full"
                  title={device.name}
                >
                  {device.name}
                </span>
                <span
                  className={`text-[11px] font-extrabold uppercase tracking-[0.05em] mt-0.5 ${
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
              <button
                className={`inline-flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-full border transition-all duration-250 cursor-pointer hover:scale-105 active:scale-95 mt-1 ${
                  device.is_on 
                    ? 'border-accent bg-accent text-[#0a0800] shadow-gold-glow'
                    : 'border-border bg-card text-text-muted hover:border-accent hover:text-accent hover:shadow-[0_0_12px_rgba(201,168,76,0.3)]'
                }`}
                onClick={() => toggleDevice(device)}
                title={device.is_on ? 'Turn Off' : 'Turn On'}
              >
                {device.is_on ? <LucidePowerOff size={15} strokeWidth={2.5} /> : <LucidePower size={15} strokeWidth={2.5} />}
              </button>
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
