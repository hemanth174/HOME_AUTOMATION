'use client';

import { Eye, EyeOff } from 'lucide-react';

function GoogleIcon() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.7l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.3-.4-3.5z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg className="h-5 w-5 shrink-0 fill-current" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 .5C5.73.5.5 5.73.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2.17c-3.2.7-3.88-1.37-3.88-1.37-.53-1.34-1.3-1.7-1.3-1.7-1.06-.72.08-.71.08-.71 1.17.08 1.79 1.2 1.79 1.2 1.04 1.78 2.73 1.27 3.4.97.1-.75.4-1.27.73-1.56-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.43-2.69 5.4-5.25 5.69.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5z" />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="2" y="2" width="9" height="9" fill="#F25022" />
      <rect x="13" y="2" width="9" height="9" fill="#7FBA00" />
      <rect x="2" y="13" width="9" height="9" fill="#00A4EF" />
      <rect x="13" y="13" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}

export default function LoginForm({ email, setEmail, password, setPassword, showPass, setShowPass, loading, handleLogin, handleGoogleSignIn, handleGithubSignIn, handleMicrosoftSignIn, switchView }) {
  return <form className="flex flex-col gap-4" onSubmit={handleLogin} noValidate={false}>
    <div className="flex flex-col gap-1.5 min-w-0"><label htmlFor="login-email" className="text-xs font-extrabold tracking-wide text-text-muted">Email</label><input id="login-email" className="w-full px-4 min-h-[48px] rounded-xl border-[1.5px] border-border bg-input text-text text-base outline-none transition-all focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/40 focus:shadow-[0_0_0_3px_var(--accent-bg)]" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required /></div>
    <div className="flex flex-col gap-1.5 min-w-0"><label htmlFor="login-password" className="text-xs font-extrabold tracking-wide text-text-muted">Password</label><div className="flex rounded-xl border-[1.5px] border-border bg-input overflow-hidden focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--accent-bg)] transition-all"><input id="login-password" className="w-full min-w-0 flex-1 px-4 min-h-[48px] bg-transparent text-text text-base outline-none" type={showPass ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" required /><button className="w-[52px] min-h-[48px] flex items-center justify-center text-text-muted hover:text-text active:scale-95 transition-all cursor-pointer shrink-0" onClick={() => setShowPass(!showPass)} type="button" aria-label={showPass ? 'Hide password' : 'Show password'} aria-pressed={showPass}>{showPass ? <Eye size={20} /> : <EyeOff size={20} />}</button></div></div>
    <button className="w-full min-h-[52px] py-3 rounded-xl text-[15px] font-bold bg-accent text-[var(--btn-text)] transition-all hover:bg-accent-hover active:translate-y-0 cursor-pointer shadow-gold-glow mt-1 disabled:opacity-60" type="submit" disabled={loading}>{loading ? 'Signing in...' : 'Sign In'}</button>
    <div className="relative my-2 text-center text-[10px] font-extrabold uppercase tracking-widest text-text-muted before:absolute before:top-1/2 before:left-0 before:h-px before:w-[40%] before:bg-border after:absolute after:top-1/2 after:right-0 after:h-px after:w-[40%] after:bg-border"><span>or</span></div>
    <div className="flex flex-col gap-2.5">
      <button type="button" onClick={handleGoogleSignIn} disabled={loading} className="flex items-center justify-center gap-3 w-full min-h-[48px] py-3 rounded-xl text-[15px] font-semibold border-[1.5px] border-border bg-card text-text transition-all hover:bg-card-alt hover:border-accent/40 active:scale-[0.99] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"><GoogleIcon /><span>Continue with Google</span></button>
      <button type="button" onClick={handleGithubSignIn} disabled={loading} className="flex items-center justify-center gap-3 w-full min-h-[48px] py-3 rounded-xl text-[15px] font-semibold border-[1.5px] border-border bg-card text-text transition-all hover:bg-card-alt hover:border-accent/40 active:scale-[0.99] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"><GitHubIcon /><span>Continue with GitHub</span></button>
      <button type="button" onClick={handleMicrosoftSignIn} disabled={loading} className="flex items-center justify-center gap-3 w-full min-h-[48px] py-3 rounded-xl text-[15px] font-semibold border-[1.5px] border-border bg-card text-text transition-all hover:bg-card-alt hover:border-accent/40 active:scale-[0.99] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"><MicrosoftIcon /><span>Continue with Microsoft</span></button>
    </div>
    <div className="text-center mt-2 flex flex-col gap-1"><button className="bg-transparent min-h-[44px] px-4 text-[13px] font-bold text-accent hover:underline cursor-pointer inline-block mx-auto" type="button" onClick={() => switchView('forgot')}>Forgot password?</button><span className="text-[13px] text-text-muted">Don&apos;t have an account? <button className="bg-transparent min-h-[44px] px-1 font-bold text-accent hover:underline cursor-pointer" type="button" onClick={() => switchView('signup')}>Sign up</button></span></div>
  </form>;
}
