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
    <form className="flex flex-col gap-4 min-w-0" onSubmit={failedAttempts >= 3 ? handleVerifyRecoveryOTP : handleForgotVerify}>
      {failedAttempts >= 3 && (
        <div role="alert" className="p-3 rounded-xl border border-red-500/20 bg-red-500/5 text-red-500 text-[13px] font-bold leading-relaxed animate-fade-in">
          Verification locked after 3 failed attempts. A recovery bypass code has been sent to your email.
        </div>
      )}

      <div className={`flex flex-col gap-1.5 min-w-0 transition-all ${failedAttempts >= 3 ? 'opacity-50' : ''}`}>
        <label htmlFor="forgot-a1" className="text-xs font-bold text-text-muted block leading-snug">{forgotQ1}</label>
        <input
          id="forgot-a1"
          className="w-full px-4 min-h-[48px] rounded-xl border-[1.5px] border-border bg-input text-text text-base outline-none transition-all focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/40"
          type="text"
          autoComplete="off"
          value={forgotA1}
          onChange={(e) => setForgotA1(e.target.value)}
          placeholder="Your answer"
          disabled={failedAttempts >= 3}
          required
        />
      </div>
      <div className={`flex flex-col gap-1.5 min-w-0 transition-all ${failedAttempts >= 3 ? 'opacity-50' : ''}`}>
        <label htmlFor="forgot-a2" className="text-xs font-bold text-text-muted block leading-snug">{forgotQ2}</label>
        <input
          id="forgot-a2"
          className="w-full px-4 min-h-[48px] rounded-xl border-[1.5px] border-border bg-input text-text text-base outline-none transition-all focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/40"
          type="text"
          autoComplete="off"
          value={forgotA2}
          onChange={(e) => setForgotA2(e.target.value)}
          placeholder="Your answer"
          disabled={failedAttempts >= 3}
          required
        />
      </div>

      {failedAttempts >= 3 ? (
        <div className="flex flex-col gap-1.5 mt-2 border-t border-border pt-4 animate-scale-in min-w-0">
          <label htmlFor="recovery-code" className="text-xs font-extrabold tracking-wide text-accent">6-Digit Recovery Code</label>
          <input
            id="recovery-code"
            className="w-full px-4 min-h-[52px] rounded-xl border-[1.5px] border-accent/40 bg-input text-text text-center tracking-[0.25em] font-mono text-lg outline-none focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/40"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={recoveryInput}
            onChange={(e) => setRecoveryInput(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            required
            autoFocus
          />
          <button
            className="w-full min-h-[52px] py-3 rounded-xl text-[15px] font-bold bg-accent text-[var(--btn-text)] transition-all hover:bg-accent-hover active:translate-y-0 cursor-pointer shadow-gold-glow mt-3 disabled:opacity-60"
            type="submit"
            disabled={loading}
          >
            {loading ? 'Verifying...' : 'Verify Code & Send Reset Link'}
          </button>
        </div>
      ) : (
        <button
          className="w-full min-h-[52px] py-3 rounded-xl text-[15px] font-bold bg-accent text-[var(--btn-text)] transition-all hover:bg-accent-hover active:translate-y-0 cursor-pointer shadow-gold-glow mt-1 disabled:opacity-60"
          type="submit"
          disabled={loading}
        >
          {loading ? 'Verifying...' : 'Verify & Send Reset Link'}
        </button>
      )}

      <div className="text-center mt-1">
        <button
          className="bg-transparent min-h-[44px] px-4 text-[13px] font-bold text-accent hover:underline cursor-pointer"
          type="button"
          onClick={() => switchView('forgot')}
        >
          Back
        </button>
      </div>
    </form>
  );
}
