'use client';

import React from 'react';

export default function ForgotQuestionsForm({
  failedAttempts,
  forgotQ1,
  forgotQ2,
  forgotA1,
  setForgotA1,
  forgotA2,
  setForgotA2,
  recoveryInput,
  setRecoveryInput,
  loading,
  handleVerifyRecoveryOTP,
  handleForgotVerify,
  switchView
}) {
  return (
    <form className="flex flex-col gap-4" onSubmit={failedAttempts >= 3 ? handleVerifyRecoveryOTP : handleForgotVerify}>
      {failedAttempts >= 3 && (
        <div className="p-3 rounded-xl border border-red-500/20 bg-red-500/5 text-red-500 text-xs font-bold leading-relaxed animate-fade-in">
          ⚠️ Verification locked after 3 failed attempts. A recovery bypass code has been sent to your email.
        </div>
      )}

      <div className={`flex flex-col gap-1 transition-all ${failedAttempts >= 3 ? 'opacity-50' : ''}`}>
        <label className="text-xs font-bold text-text-muted block leading-snug">{forgotQ1}</label>
        <input
          className="w-full px-4 py-2.5 rounded-lg border-[1.5px] border-border bg-input text-text text-sm outline-none transition-all focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-bg)]"
          type="text"
          value={forgotA1}
          onChange={(e) => setForgotA1(e.target.value)}
          placeholder="Your answer"
          disabled={failedAttempts >= 3}
          required
        />
      </div>
      <div className={`flex flex-col gap-1 transition-all ${failedAttempts >= 3 ? 'opacity-50' : ''}`}>
        <label className="text-xs font-bold text-text-muted block leading-snug">{forgotQ2}</label>
        <input
          className="w-full px-4 py-2.5 rounded-lg border-[1.5px] border-border bg-input text-text text-sm outline-none transition-all focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-bg)]"
          type="text"
          value={forgotA2}
          onChange={(e) => setForgotA2(e.target.value)}
          placeholder="Your answer"
          disabled={failedAttempts >= 3}
          required
        />
      </div>

      {failedAttempts >= 3 ? (
        <div className="flex flex-col gap-1 mt-2 border-t border-border pt-4 animate-scale-in">
          <label className="text-xs font-extrabold tracking-wide text-accent">6-Digit Recovery Code</label>
          <input
            className="w-full px-4 py-2.5 rounded-lg border-[1.5px] border-accent/40 bg-input text-text text-center tracking-[0.25em] font-mono text-lg outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-bg)]"
            type="text"
            maxLength={6}
            value={recoveryInput}
            onChange={(e) => setRecoveryInput(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            required
            autoFocus
          />
          <button
            className="w-full py-3 rounded-lg text-sm font-bold bg-accent text-[#0a0800] transition-all hover:bg-accent-hover active:translate-y-0 cursor-pointer shadow-gold-glow mt-4"
            type="submit"
            disabled={loading}
          >
            {loading ? 'Verifying...' : 'Verify Code & Send Reset Link'}
          </button>
        </div>
      ) : (
        <button
          className="w-full py-3 rounded-lg text-sm font-bold bg-accent text-[#0a0800] transition-all hover:bg-accent-hover active:translate-y-0 cursor-pointer shadow-gold-glow mt-2"
          type="submit"
          disabled={loading}
        >
          {loading ? 'Verifying...' : 'Verify & Send Reset Link'}
        </button>
      )}

      <div className="text-center mt-2">
        <button
          className="bg-transparent text-xs font-bold text-accent hover:underline cursor-pointer"
          type="button"
          onClick={() => switchView('forgot')}
        >
          Back
        </button>
      </div>
    </form>
  );
}
