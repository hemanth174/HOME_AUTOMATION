'use client';

import React from 'react';

export default function SignupForm({
  email,
  setEmail,
  password,
  setPassword,
  confirmPassword,
  setConfirmPassword,
  q1,
  setQ1,
  a1,
  setA1,
  q2,
  setQ2,
  a2,
  setA2,
  loading,
  handleSignup,
  switchView,
  securityQuestions
}) {
  return (
    <form className="flex flex-col gap-4 max-h-[62svh] lg:max-h-[60vh] overflow-y-auto pr-1 -mr-1" onSubmit={handleSignup}>
      <div className="flex flex-col gap-1.5 min-w-0">
        <label htmlFor="signup-email" className="text-xs font-extrabold tracking-wide text-text-muted">Email</label>
        <input
          id="signup-email"
          className="w-full px-4 min-h-[48px] rounded-xl border-[1.5px] border-border bg-input text-text text-base outline-none transition-all focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/40"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
        />
      </div>
      <div className="flex flex-col gap-1.5 min-w-0">
        <label htmlFor="signup-password" className="text-xs font-extrabold tracking-wide text-text-muted">Password</label>
        <input
          id="signup-password"
          className="w-full px-4 min-h-[48px] rounded-xl border-[1.5px] border-border bg-input text-text text-base outline-none transition-all focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/40"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Min 6 characters"
          required
        />
      </div>
      <div className="flex flex-col gap-1.5 min-w-0">
        <label htmlFor="signup-confirm" className="text-xs font-extrabold tracking-wide text-text-muted">Confirm Password</label>
        <input
          id="signup-confirm"
          className="w-full px-4 min-h-[48px] rounded-xl border-[1.5px] border-border bg-input text-text text-base outline-none transition-all focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/40"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Confirm password"
          required
        />
      </div>
      <div className="relative my-2 text-center text-[10px] font-extrabold uppercase tracking-widest text-text-muted before:absolute before:top-1/2 before:left-0 before:h-px before:w-[22%] before:bg-border after:absolute after:top-1/2 after:right-0 after:h-px after:w-[22%] after:bg-border">
        <span>Security Questions</span>
      </div>
      <div className="flex flex-col gap-1.5 min-w-0">
        <label htmlFor="signup-q1" className="text-xs font-extrabold tracking-wide text-text-muted">Security Question 1</label>
        <select
          id="signup-q1"
          className="w-full px-4 min-h-[48px] rounded-xl border-[1.5px] border-border bg-input text-text text-base outline-none transition-all focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/40"
          value={q1}
          onChange={(e) => setQ1(e.target.value)}
        >
          {securityQuestions.map((q) => <option key={q} value={q}>{q}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1.5 min-w-0">
        <label htmlFor="signup-a1" className="text-xs font-extrabold tracking-wide text-text-muted">Answer 1</label>
        <input
          id="signup-a1"
          className="w-full px-4 min-h-[48px] rounded-xl border-[1.5px] border-border bg-input text-text text-base outline-none transition-all focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/40"
          type="text"
          autoComplete="off"
          value={a1}
          onChange={(e) => setA1(e.target.value)}
          placeholder="Your answer"
          required
        />
      </div>
      <div className="flex flex-col gap-1.5 min-w-0">
        <label htmlFor="signup-q2" className="text-xs font-extrabold tracking-wide text-text-muted">Security Question 2</label>
        <select
          id="signup-q2"
          className="w-full px-4 min-h-[48px] rounded-xl border-[1.5px] border-border bg-input text-text text-base outline-none transition-all focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/40"
          value={q2}
          onChange={(e) => setQ2(e.target.value)}
        >
          {securityQuestions.map((q) => <option key={q} value={q}>{q}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1.5 min-w-0">
        <label htmlFor="signup-a2" className="text-xs font-extrabold tracking-wide text-text-muted">Answer 2</label>
        <input
          id="signup-a2"
          className="w-full px-4 min-h-[48px] rounded-xl border-[1.5px] border-border bg-input text-text text-base outline-none transition-all focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/40"
          type="text"
          autoComplete="off"
          value={a2}
          onChange={(e) => setA2(e.target.value)}
          placeholder="Your answer"
          required
        />
      </div>
      <button
        className="w-full min-h-[52px] py-3 rounded-xl text-[15px] font-bold bg-accent text-[var(--btn-text)] transition-all hover:bg-accent-hover active:translate-y-0 cursor-pointer shadow-gold-glow mt-1 shrink-0 disabled:opacity-60"
        type="submit"
        disabled={loading}
      >
        {loading ? 'Creating account...' : 'Create Account'}
      </button>
      <div className="text-center mt-1 shrink-0">
        <span className="text-[13px] text-text-muted">
          Already have an account?{' '}
          <button
            className="bg-transparent min-h-[44px] px-1 font-bold text-accent hover:underline cursor-pointer"
            type="button"
            onClick={() => switchView('login')}
          >
            Sign in
          </button>
        </span>
      </div>
    </form>
  );
}
