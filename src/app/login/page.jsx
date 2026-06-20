'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

const SECURITY_QUESTIONS = [
  "What is your pet's name?",
  "What city were you born in?",
  "What is your favorite book?",
  "What is your mother's maiden name?",
  "What was your first school?",
];

export default function LoginPage() {
  const [view, setView] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [q1, setQ1] = useState(SECURITY_QUESTIONS[0]);
  const [a1, setA1] = useState('');
  const [q2, setQ2] = useState(SECURITY_QUESTIONS[1]);
  const [a2, setA2] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotQ1, setForgotQ1] = useState('');
  const [forgotQ2, setForgotQ2] = useState('');
  const [forgotA1, setForgotA1] = useState('');
  const [forgotA2, setForgotA2] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      window.location.href = '/';
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (!a1.trim() || !a2.trim()) {
      setError('Please answer both security questions');
      return;
    }
    if (q1 === q2) {
      setError('Please select two different security questions');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      if (data.user) {
        await supabase.rpc('create_security_profile', {
          p_user_id: data.user.id,
          p_email: email,
          p_q1: q1,
          p_a1: a1,
          p_q2: q2,
          p_a2: a2,
        });
      }
      setSuccess('Account created successfully! You can now log in.');
      setView('login');
      setPassword('');
      setConfirmPassword('');
      setA1('');
      setA2('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google' });
    if (error) setError(error.message);
  };

  const handleForgotSubmitEmail = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_security_questions', { p_email: forgotEmail });
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('No account found with this email');
      }
      setForgotQ1(data[0].q1);
      setForgotQ2(data[0].q2);
      setView('forgot-questions');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotVerify = async (e) => {
    e.preventDefault();
    setError('');
    if (!forgotA1.trim() || !forgotA2.trim()) {
      setError('Please answer both questions');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('verify_security_answers', {
        p_email: forgotEmail,
        p_a1: forgotA1,
        p_a2: forgotA2,
      });
      if (error) throw error;
      if (!data) {
        throw new Error('Security answers are incorrect');
      }
      await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: window.location.origin,
      });
      setSuccess('Security questions verified! A password reset link has been sent to your email.');
      setView('login');
      setForgotEmail('');
      setForgotA1('');
      setForgotA2('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const switchView = (newView) => {
    setView(newView);
    setError('');
    setSuccess('');
  };

  return (
    <div className="flex items-center justify-center min-h-screen p-6 bg-auth-bg animate-fade-in select-none">
      <div className="bg-auth-card px-8 py-9 rounded-[22px] shadow-2xl shadow-gold-glow w-full max-w-[420px] animate-scale-in border border-border">
        <h1 className="text-center text-3xl font-extrabold mb-2 text-accent tracking-tight shadow-gold-glow">Smart Home</h1>
        <p className="text-center text-xs text-text-muted mb-6 font-bold uppercase tracking-wider">
          {view === 'login' && 'Sign in to your account'}
          {view === 'signup' && 'Create a new account'}
          {view === 'forgot' && 'Reset your password'}
          {view === 'forgot-questions' && 'Answer security questions'}
        </p>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/35 bg-red-500/10 px-3.5 py-2.5 text-xs font-bold text-red-500">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 rounded-lg border border-green-500/35 bg-green-500/10 px-3.5 py-2.5 text-xs font-bold text-green-500">
            {success}
          </div>
        )}

        {view === 'login' && (
          <form className="flex flex-col gap-4" onSubmit={handleLogin}>
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
                placeholder="Your password"
                required
              />
            </div>
            <button
              className="w-full py-3 rounded-lg text-sm font-bold bg-accent text-[#0a0800] transition-all hover:bg-accent-hover active:translate-y-0 cursor-pointer shadow-gold-glow mt-2"
              type="submit"
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
            <div className="relative my-2 text-center text-[10px] font-extrabold uppercase tracking-widest text-text-muted before:absolute before:top-1/2 before:left-0 before:h-px before:w-[40%] before:bg-border after:absolute after:top-1/2 after:right-0 after:h-px after:w-[40%] after:bg-border">
              <span>or</span>
            </div>
            <button
              className="w-full py-2.5 rounded-lg text-sm font-semibold border-[1.5px] border-border bg-card text-text transition-all hover:bg-card-alt cursor-pointer"
              type="button"
              onClick={handleGoogleSignIn}
            >
              Sign in with Google
            </button>
            <div className="text-center mt-2 flex flex-col gap-2">
              <button
                className="bg-transparent text-xs font-bold text-accent hover:underline cursor-pointer inline-block mx-auto"
                type="button"
                onClick={() => switchView('forgot')}
              >
                Forgot password?
              </button>
              <span className="text-xs text-text-muted">
                Don&apos;t have an account?{' '}
                <button
                  className="bg-transparent font-bold text-accent hover:underline cursor-pointer"
                  type="button"
                  onClick={() => switchView('signup')}
                >
                  Sign up
                </button>
              </span>
            </div>
          </form>
        )}

        {view === 'signup' && (
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
                {SECURITY_QUESTIONS.map((q) => <option key={q} value={q}>{q}</option>)}
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
                {SECURITY_QUESTIONS.map((q) => <option key={q} value={q}>{q}</option>)}
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
        )}

        {view === 'forgot' && (
          <form className="flex flex-col gap-4" onSubmit={handleForgotSubmitEmail}>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-extrabold tracking-wide text-text-muted">Email Address</label>
              <input
                className="w-full px-4 py-2.5 rounded-lg border-[1.5px] border-border bg-input text-text text-sm outline-none transition-all focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-bg)]"
                type="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>
            <button
              className="w-full py-3 rounded-lg text-sm font-bold bg-accent text-[#0a0800] transition-all hover:bg-accent-hover active:translate-y-0 cursor-pointer shadow-gold-glow mt-2"
              type="submit"
              disabled={loading}
            >
              {loading ? 'Looking up...' : 'Continue'}
            </button>
            <div className="text-center mt-2">
              <button
                className="bg-transparent text-xs font-bold text-accent hover:underline cursor-pointer"
                type="button"
                onClick={() => switchView('login')}
              >
                Back to login
              </button>
            </div>
          </form>
        )}

        {view === 'forgot-questions' && (
          <form className="flex flex-col gap-4" onSubmit={handleForgotVerify}>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-text-muted block leading-snug">{forgotQ1}</label>
              <input
                className="w-full px-4 py-2.5 rounded-lg border-[1.5px] border-border bg-input text-text text-sm outline-none transition-all focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-bg)]"
                type="text"
                value={forgotA1}
                onChange={(e) => setForgotA1(e.target.value)}
                placeholder="Your answer"
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-text-muted block leading-snug">{forgotQ2}</label>
              <input
                className="w-full px-4 py-2.5 rounded-lg border-[1.5px] border-border bg-input text-text text-sm outline-none transition-all focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-bg)]"
                type="text"
                value={forgotA2}
                onChange={(e) => setForgotA2(e.target.value)}
                placeholder="Your answer"
                required
              />
            </div>
            <button
              className="w-full py-3 rounded-lg text-sm font-bold bg-accent text-[#0a0800] transition-all hover:bg-accent-hover active:translate-y-0 cursor-pointer shadow-gold-glow mt-2"
              type="submit"
              disabled={loading}
            >
              {loading ? 'Verifying...' : 'Verify & Send Reset Link'}
            </button>
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
        )}
      </div>
    </div>
  );
}
