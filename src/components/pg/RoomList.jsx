'use client';

import { Cpu } from 'lucide-react';
import { isBoardOnline } from './deviceKind';

/**
 * PG rooms, sourced honestly from boards: each ESP32 board controls one
 * room, so board name = room name, device count and online presence come
 * straight from live state. No room table exists in the backend.
 */
export default function RoomList({
  boards,
  devices,
  selectedId,
  onSelect,
}) {
  return (
    <nav aria-label="Rooms" className="flex flex-row lg:flex-col gap-2 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0">
      <p className="hidden lg:block text-[11px] font-extrabold uppercase tracking-[0.12em] text-(--pg-muted) px-1">
        Rooms
      </p>
      {boards.map((board) => {
        const count = devices.filter((d) => d.board_id === board.id).length;
        const online = isBoardOnline(board);
        const selected = board.id === selectedId;
        return (
          <button
            key={board.id}
            onClick={() => onSelect(board.id)}
            aria-current={selected ? 'true' : undefined}
            className={`shrink-0 min-w-[210px] lg:min-w-0 w-auto lg:w-full min-h-[56px] flex items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-left transition-all cursor-pointer ${
              selected
                ? 'border-(--pg-brand-line) bg-(--pg-brand-faint)'
                : 'border-(--pg-line) bg-(--pg-card) hover:border-(--pg-brand-line)'
            }`}
          >
              <span
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                selected ? 'bg-(--pg-deep) text-(--pg-tile-ico)' : 'bg-(--pg-faint) text-(--pg-brand)'
              }`}
            >
              <Cpu size={16} strokeWidth={2.5} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block truncate text-sm font-bold text-(--pg-ink)">
                {board.name}
              </span>
              <span className="block whitespace-nowrap text-[11px] font-semibold text-(--pg-muted) mt-0.5">
                {count} device{count === 1 ? '' : 's'}
              </span>
            </span>
            <span
              aria-label={online ? 'Online' : 'Offline'}
              title={online ? 'Online' : 'Offline'}
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${online ? 'bg-emerald-500' : 'bg-red-500'}`}
            />
          </button>
        );
      })}
    </nav>
  );
}
