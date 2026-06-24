'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import Toast from '@/components/Toast';
import Loader from '@/components/Loader';
import { Trash2 } from 'lucide-react';

export default function BoardsPage() {
  const [user, setUser] = useState(null);
  const [boards, setBoards] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  // Modal drag-to-close gesture state for mobile
  const [modalDragY, setModalDragY] = useState(0);
  const [modalDragging, setModalDragging] = useState(false);
  const [modalStartY, setModalStartY] = useState(0);

  const handleModalTouchStart = (e) => {
    setModalStartY(e.touches[0].clientY);
    setModalDragging(true);
  };

  const handleModalTouchMove = (e) => {
    if (!modalDragging) return;
    if (e.currentTarget.scrollTop > 0) return;
    const deltaY = e.touches[0].clientY - modalStartY;
    if (deltaY > 0) {
      setModalDragY(deltaY);
    }
  };

  const handleModalTouchEnd = () => {
    setModalDragging(false);
    if (modalDragY > 80) {
      setShowModal(false);
    }
    setModalDragY(0);
  };

  // Form
  const [boardIdentifier, setBoardIdentifier] = useState('');
  const [boardName, setBoardName] = useState('');
  const [editingBoard, setEditingBoard] = useState(null);
  const [editName, setEditName] = useState('');

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = '/login'; return; }
      setUser(user);
    };
    init();
  }, []);

  const fetchBoards = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('boards').select('id, name, board_identifier').eq('user_id', user.id).order('created_at');
    if (data) setBoards(data);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const startTime = Date.now();

    supabase
      .from('boards')
      .select('id, name, board_identifier')
      .eq('user_id', user.id)
      .order('created_at')
      .then(({ data }) => {
        if (cancelled) return;
        if (data) setBoards(data);
        
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, 500 - elapsed);
        setTimeout(() => {
          if (!cancelled) setLoading(false);
        }, remaining);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  // Realtime subscription
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('boards-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'boards',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setBoards(prev => {
              if (prev.some(b => b.id === payload.new.id)) return prev;
              return [...prev, payload.new];
            });
          } else if (payload.eventType === 'UPDATE') {
            setBoards(prev => prev.map(b => b.id === payload.new.id ? payload.new : b));
          } else if (payload.eventType === 'DELETE') {
            setBoards(prev => prev.filter(b => b.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const addBoard = async (e) => {
    e.preventDefault();
    if (!boardIdentifier.trim()) { setToast('Board identifier is required'); return; }

    // Insert board
    const { data: board, error: boardError } = await supabase.from('boards').insert({
      user_id: user.id,
      board_identifier: boardIdentifier.trim(),
      name: boardName.trim() || 'New Board',
    }).select('id').single();

    if (boardError) { setToast(boardError.message); return; }

    // Auto-create 4 devices for the board
    const deviceInserts = [];
    for (let i = 0; i < 4; i++) {
      deviceInserts.push({
        user_id: user.id,
        board_id: board.id,
        relay_index: i,
        name: `Device ${i + 1}`,
        is_on: false,
      });
    }
    const { error: devicesError } = await supabase.from('devices').insert(deviceInserts);
    if (devicesError) { setToast(devicesError.message); return; }

    setShowModal(false);
    setBoardIdentifier('');
    setBoardName('');
    await fetchBoards();
    setToast('Board added with 4 devices');
  };

  const deleteBoard = async (id) => {
    const confirmed = window.confirm('Delete this board and all its devices?');
    if (!confirmed) return;
    await supabase.from('boards').delete().eq('id', id);
    setBoards(prev => prev.filter(b => b.id !== id));
    setToast('Board deleted');
  };

  const startEdit = (board) => {
    setEditingBoard(board.id);
    setEditName(board.name);
  };

  const saveEdit = async (boardId) => {
    if (editName.trim()) {
      await supabase.from('boards').update({ name: editName.trim() }).eq('id', boardId);
      setBoards(prev => prev.map(b => b.id === boardId ? { ...b, name: editName.trim() } : b));
    }
    setEditingBoard(null);
  };

  if (loading) {
    return <Loader message="Loading boards..." />;
  }

  return (
    <>
      <div className="mx-auto w-[min(100%-32px,960px)] pt-[104px] pb-8 animate-fade-up max-md:w-[min(100%-24px,620px)] max-md:pt-[92px] select-none">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-extrabold text-text tracking-tight">Boards</h2>
          <button
            className="inline-flex min-h-[30px] items-center justify-center gap-2 rounded-lg bg-accent px-4 py-1 text-xs font-extrabold text-[#0a0800] transition-all duration-250 cursor-pointer hover:bg-accent-hover active:translate-y-0 shadow-gold-glow"
            onClick={() => setShowModal(true)}
          >
            Add Board
          </button>
        </div>

        <p className="mt-0.5 mb-5 text-[13px] text-text-muted font-bold">Each board is a physical ESP32 module with 4 relay outputs.</p>

        {boards.length === 0 ? (
          <div className="grid min-h-[220px] place-items-center rounded-[18px] border border-dashed border-border bg-white/[0.03] px-5 py-10 text-center text-sm font-semibold text-text-muted animate-scale-in">
            No boards yet. Add your first ESP32 board.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {boards.map((board) => (
              <div
                key={board.id}
                className="relative overflow-hidden rounded-[18px] border border-border bg-card p-[18px] shadow-lg transition-all duration-200 hover:-translate-y-px hover:border-accent/40 hover:shadow-2xl flex items-center justify-between  "
              >
                <div className="min-w-0">
                  {editingBoard === board.id ? (
                    <input
                      className="min-w-[120px] border-0 border-b border-dashed border-accent bg-transparent text-sm font-extrabold text-text outline-0 focus:shadow-[0_6px_0_-5px_var(--accent)]"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={() => saveEdit(board.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(board.id); }}
                      autoFocus
                    />
                  ) : (
                    <div
                      className="text-sm font-extrabold text-text hover:border-border hover:bg-input border border-transparent rounded px-1.5 cursor-pointer max-w-full truncate"
                      onClick={() => startEdit(board)}
                      title="Click to rename"
                    >
                      {board.name}
                    </div>
                  )}
                  <div className="text-xs font-bold text-text-muted mt-1 bg-bg px-2.5 py-0.5 rounded-md inline-block">
                    ID: {board.board_identifier}
                  </div>
                </div>
                <button
                  className="flex justify-between cursor-pointer transition-all duration-200 border border-1 hover:border-[red] p-1 rounded-lg hover:text-[red]"
                  onClick={() => deleteBoard(board.id)}
                >
                  <Trash2 />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/65 p-[22px] backdrop-blur-md animate-scale-in max-md:items-end max-md:p-0" onClick={() => setShowModal(false)}>
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
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex min-h-[36px] items-center justify-center gap-2 rounded-lg bg-accent px-5 py-2 text-xs font-extrabold text-[#0a0800] transition-all hover:bg-accent-hover cursor-pointer shadow-gold-glow"
                >
                  Add Board
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Toast message={toast} onClose={() => setToast('')} />
    </>
  );
}
