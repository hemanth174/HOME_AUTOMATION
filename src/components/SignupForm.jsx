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
    <form className="flex flex-col gap-3.5 max-h-[70vh] overflow-y-auto pr-1" onSubmit={handleSignup}>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-extrabold tracking-wide text-text-muted">Email</label>
        <input
          className="w-full px-4 py-2.5 rounded-lg border-[1.5px] border-border bg-input text-text text-sm outline-none transition-all focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-bg)]"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-extrabold tracking-wide text-text-muted">Password</label>
        <input
          className="w-full px-4 py-2.5 rounded-lg border-[1.5px] border-border bg-input text-text text-sm outline-none transition-all focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-bg)]"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Min 6 characters"
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-extrabold tracking-wide text-text-muted">Confirm Password</label>
        <input
          className="w-full px-4 py-2.5 rounded-lg border-[1.5px] border-border bg-input text-text text-sm outline-none transition-all focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-bg)]"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Confirm password"
          required
        />
      </div>
      <div className="relative my-2 text-center text-[10px] font-extrabold uppercase tracking-widest text-text-muted before:absolute before:top-1/2 before:left-0 before:h-px before:w-[22%] before:bg-border after:absolute after:top-1/2 after:right-0 after:h-px after:w-[22%] after:bg-border">
        <span>Security Questions</span>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-extrabold tracking-wide text-text-muted">Security Question 1</label>
        <select
          className="w-full px-4 py-2.5 rounded-lg border-[1.5px] border-border bg-input text-text text-sm outline-none transition-all focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-bg)]"
          value={q1}
          onChange={(e) => setQ1(e.target.value)}
        >
          {securityQuestions.map((q) => <option key={q} value={q}>{q}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-extrabold tracking-wide text-text-muted">Answer 1</label>
        <input
          className="w-full px-4 py-2.5 rounded-lg border-[1.5px] border-border bg-input text-text text-sm outline-none transition-all focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-bg)]"
          type="text"
          value={a1}
          onChange={(e) => setA1(e.target.value)}
          placeholder="Your answer"
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-extrabold tracking-wide text-text-muted">Security Question 2</label>
        <select
          className="w-full px-4 py-2.5 rounded-lg border-[1.5px] border-border bg-input text-text text-sm outline-none transition-all focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-bg)]"
          value={q2}
          onChange={(e) => setQ2(e.target.value)}
        >
          {securityQuestions.map((q) => <option key={q} value={q}>{q}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-extrabold tracking-wide text-text-muted">Answer 2</label>
        <input
          className="w-full px-4 py-2.5 rounded-lg border-[1.5px] border-border bg-input text-text text-sm outline-none transition-all focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-bg)]"
          type="text"
          value={a2}
          onChange={(e) => setA2(e.target.value)}
          placeholder="Your answer"
          required
        />
      </div>
      <button
        className="w-full py-3 rounded-lg text-sm font-bold bg-accent text-[#0a0800] transition-all hover:bg-accent-hover active:translate-y-0 cursor-pointer shadow-gold-glow mt-2 shrink-0"
        type="submit"
        disabled={loading}
      >
        {loading ? 'Creating account...' : 'Create Account'}
      </button>
      <div className="text-center mt-1 shrink-0">
        <span className="text-xs text-text-muted">
          Already have an account?{' '}
          <button
            className="bg-transparent font-bold text-accent hover:underline cursor-pointer"
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
