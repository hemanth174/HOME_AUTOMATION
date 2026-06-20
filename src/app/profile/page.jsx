'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Toast from '@/components/Toast';
import Loader from '@/components/Loader';
import Link from 'next/link';

export default function ProfilePage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [updating, setUpdating] = useState(false);
  const [toast, setToast] = useState('');
  const [promptUpdate, setPromptUpdate] = useState(false);

  useEffect(() => {
    let active = true;
    const fetchUser = async () => {
      const startTime = Date.now();
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;
      if (!user) {
        window.location.href = '/login';
        return;
      }
      setUser(user);
      const metadata = user.user_metadata || {};
      setNewName(metadata.full_name || metadata.name || '');

      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 2000 - elapsed);
      setTimeout(() => {
        if (active) setLoading(false);
      }, remaining);
    };
    fetchUser();

    return () => {
      active = false;
    };
  }, []);

  // Parse query params safely on client
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      setPromptUpdate(params.get('promptUpdate') === 'true');
    }
  }, []);

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (!newName.trim()) {
      setToast('Name cannot be empty');
      return;
    }
    setUpdating(true);
    try {
      const { data, error } = await supabase.auth.updateUser({
        data: { full_name: newName.trim() }
      });
      if (error) throw error;
      setUser(data.user);
      setToast('Profile updated successfully!');
      setPromptUpdate(false);
    } catch (err) {
      setToast(err.message);
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return <Loader message="Loading profile..." />;
  }

  const metadata = user.user_metadata || {};
  const isGoogle = user.app_metadata?.provider === 'google' || user.identities?.some(id => id.provider === 'google');
  const fullName = metadata.full_name || metadata.name || user.email.split('@')[0];
  const avatarUrl = metadata.avatar_url;
  const initials = fullName.substring(0, 2).toUpperCase();

  return (
    <div className="mx-auto w-[min(100%-32px,960px)] pt-[104px] pb-8 animate-fade-up max-md:w-[min(100%-24px,620px)] max-md:pt-[92px] select-none">
      <div className="flex justify-between items-center mb-5">
        <h2 className="text-lg font-extrabold text-text tracking-tight">Account Profile</h2>
      </div>

      {promptUpdate && (
        <div className="mb-6 p-4 rounded-xl border border-accent bg-accent-bg text-accent text-xs font-bold animate-fade-in shadow-gold-glow flex flex-col gap-1">
          <span>🔔 Profile Action Required</span>
          <span className="text-text-muted font-semibold">Please update your Full Name below to complete your profile setup.</span>
        </div>
      )}

      <div className="relative overflow-hidden rounded-[18px] border border-border bg-card p-8 shadow-lg backdrop-blur-md animate-scale-in">
        <div className="flex flex-col items-center gap-6">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={fullName}
              className="w-24 h-24 rounded-full border-2 border-accent object-cover shadow-gold-glow shrink-0 animate-scale-in"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-24 h-24 rounded-full border-2 border-accent bg-accent-bg flex items-center justify-center text-3xl font-black text-accent shadow-gold-glow shrink-0 animate-scale-in">
              {initials}
            </div>
          )}

          <div className="text-center">
            <h2 className="text-2xl font-extrabold text-text leading-tight">{fullName}</h2>
            <p className="text-xs text-text-muted mt-1">{user.email}</p>
          </div>

          {/* Profile Edit Form */}
          <form onSubmit={handleUpdateProfile} className="w-full max-w-md border-t border-border pt-6 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-extrabold tracking-wide text-text-muted">Display Name / Full Name</label>
              <input
                className="w-full px-4 py-2.5 rounded-lg border-[1.5px] border-border bg-input text-text text-sm outline-none transition-all focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-bg)]"
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Enter your name"
                required
              />
            </div>
            
            <button
              className="w-full py-2.5 rounded-lg text-xs font-extrabold bg-accent text-[#0a0800] transition-all hover:bg-accent-hover cursor-pointer shadow-gold-glow"
              type="submit"
              disabled={updating}
            >
              {updating ? 'Saving changes...' : 'Save Profile Changes'}
            </button>
          </form>

          {/* Account Details */}
          <div className="w-full max-w-md border-t border-border pt-6 flex flex-col gap-4 text-left">
            <div className="flex justify-between py-2 border-b border-border last:border-b-0">
              <span className="text-xs font-extrabold text-text-muted uppercase tracking-wider">Authentication Provider</span>
              <span className="text-xs font-bold text-text bg-accent-bg px-2.5 py-0.5 rounded-md text-accent border border-accent/20">
                {isGoogle ? 'Google OAuth' : 'Email & Password'}
              </span>
            </div>

            <div className="flex justify-between py-2 border-b border-border last:border-b-0">
              <span className="text-xs font-extrabold text-text-muted uppercase tracking-wider">Account Created</span>
              <span className="text-xs font-bold text-text">
                {new Date(user.created_at).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </span>
            </div>

            <div className="flex justify-between py-2 border-b border-border last:border-b-0">
              <span className="text-xs font-extrabold text-text-muted uppercase tracking-wider">User ID</span>
              <span className="text-xs font-mono text-text truncate max-w-[200px]" title={user.id}>
                {user.id}
              </span>
            </div>
          </div>

          <div className="mt-4 flex gap-4 w-full justify-center">
            <Link
              href="/"
              className="inline-flex min-h-[38px] items-center justify-center gap-2 rounded-lg border border-border bg-card px-6 py-2 text-xs font-semibold text-text transition-all hover:bg-card-alt cursor-pointer"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>

      <Toast message={toast} onClose={() => setToast('')} />
    </div>
  );
}
