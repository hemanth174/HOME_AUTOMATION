'use client';

import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import ThemeToggle from '@/components/ThemeToggle';
import Toast from '@/components/Toast';
import { Eye, EyeOff, ArrowLeft, Zap, Timer, Activity } from 'lucide-react';
import SignupForm from '@/components/SignupForm';
import ForgotQuestionsForm from '@/components/ForgotQuestionsForm';
import LoginForm from './LoginForm';

const SECURITY_QUESTIONS = [
  "What is your pet's name?",
  "What city were you born in?",
  "What is your favorite book?",
  "What is your mother's maiden name?",
  "What was your first school?",
];

const getAuthRedirectUrl = () => {
  const origin = window.location.origin;
  const isLocalDevelopment =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';

  return isLocalDevelopment
    ? origin
    : process.env.NEXT_PUBLIC_SITE_URL || origin;
};

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
  const [showPass, setShowPass] = useState(false);

  // Security questions lock & recovery override states
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [recoveryCode, setRecoveryCode] = useState('');
  const [recoveryInput, setRecoveryInput] = useState('');
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
      
      // Send welcome email via Nodemailer API
      try {
        await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email,
            subject: 'Welcome to Smart Home!',
            text: `Welcome to Smart Home Automation Panel! Your account has been registered successfully.\n\nSecure your home control panel from anywhere, set presets, schedule alarms, and track live physical status.`,
            html: `
              <div style="font-family: sans-serif; padding: 20px; color: #111;">
                <h2 style="color: #c9a84c;">Welcome to Smart Home!</h2>
                <p>Your account has been registered successfully.</p>
                <p>Control devices, configure automation schedules, track analytics, and secure your home dashboard seamlessly.</p>
                <hr style="border: 0; border-top: 1px solid #eee;" />
                <p style="font-size: 11px; color: #666;">This is an automated notification from your Smart Home panel.</p>
              </div>
            `,
          }),
        });
      } catch (e) {
        console.warn('Welcome email failed:', e);
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
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: getAuthRedirectUrl() }
    });
    if (error) setError(error.message);
  };

  const handleGithubSignIn = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: getAuthRedirectUrl() }
    });
    if (error) setError(error.message);
  };

  const handleMicrosoftSignIn = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        scopes: 'email',
        redirectTo: getAuthRedirectUrl()
      }
    });
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
        const newAttempts = failedAttempts + 1;
        setFailedAttempts(newAttempts);
        
        if (newAttempts >= 3) {
          const code = Math.floor(100000 + Math.random() * 900000).toString();
          setRecoveryCode(code);
          
          try {
            await fetch('/api/send-email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: forgotEmail,
                subject: 'Smart Home Security - Account Recovery Code',
                text: `Your security recovery verification code is: ${code}\n\nUse this code to bypass security questions and reset your password.`,
                html: `
                  <div style="font-family: sans-serif; padding: 20px; color: #111; max-width: 500px; border: 1px solid #eee; border-radius: 12px;">
                    <h2 style="color: #c9a84c; margin-top: 0;">Account Recovery Verification</h2>
                    <p>Your security questions have been locked after 3 failed attempts.</p>
                    <p>Use the following 6-digit verification code to bypass security questions and reset your password:</p>
                    <div style="background: #f7f7f7; padding: 16px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 4px; border-radius: 8px; color: #c9a84c; margin: 20px 0; border: 1px dashed #c9a84c;">
                      ${code}
                    </div>
                    <p style="font-size: 12px; color: #666;">This code is valid for this session only. If you did not initiate this request, please contact security.</p>
                    <hr style="border: 0; border-top: 1px solid #eee;" />
                    <p style="font-size: 11px; color: #666;">This is an automated notification from your Smart Home panel.</p>
                  </div>
                `
              })
            });
            throw new Error('Security questions locked. A recovery code has been sent to your email.');
          } catch (mailErr) {
            throw new Error(`Security questions locked. ${mailErr.message}`);
          }
        } else {
          throw new Error(`Security answers are incorrect. ${3 - newAttempts} attempt(s) remaining.`);
        }
      }
      
      await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: getAuthRedirectUrl(),
      });
      setSuccess('Security questions verified! A password reset link has been sent to your email.');
      setView('login');
      resetForgotState();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyRecoveryOTP = async (e) => {
    e.preventDefault();
    setError('');
    if (recoveryInput.length !== 6) {
      setError('Please enter a valid 6-digit recovery code');
      return;
    }
    if (recoveryInput !== recoveryCode) {
      setError('Incorrect recovery code. Please try again.');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: getAuthRedirectUrl(),
      });
      if (error) throw error;
      setSuccess('Recovery code verified! A password reset link has been sent to your email.');
      setView('login');
      resetForgotState();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const resetForgotState = () => {
    setForgotEmail('');
    setForgotA1('');
    setForgotA2('');
    setRecoveryInput('');
    setRecoveryCode('');
    setFailedAttempts(0);
  };

  const switchView = (newView) => {
    setView(newView);
    setError('');
    setSuccess('');
    if (newView === 'login' || newView === 'forgot') {
      resetForgotState();
    }
  };

  return (
    <div
      className="relative w-full grid lg:grid-cols-[1.05fr_1fr] min-h-screen overflow-x-clip"
      style={{ minHeight: '100svh' }}
    >
      {/* Desktop brand panel — fixed dark surface. Colors are locked via .login-brand in globals.css so the light-theme global override can't turn them dark. */}
      <aside className="login-brand hidden lg:flex relative flex-col justify-between overflow-hidden px-12 py-10">
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
          style={{
            background:
              'radial-gradient(90% 60% at 20% 10%, rgba(0,255,65,0.12) 0%, transparent 60%), radial-gradient(70% 55% at 85% 90%, rgba(0,227,253,0.12) 0%, transparent 60%)',
          }}
        />
        <Link href="/" className="login-brand-back relative z-10 flex items-center gap-2 text-xs font-extrabold tracking-widest transition-colors w-fit min-h-[44px]">
          <ArrowLeft size={14} />
          <span>BACK TO HOME</span>
        </Link>
        <div className="relative z-10 max-w-md">
          <div className="mb-5 flex h-16 w-52 items-center justify-center overflow-hidden rounded-xl bg-white shadow-lg">
            <img src="/vikatech-logo.png" alt="VikaTech" className="h-full w-full object-contain" />
          </div>
          <h2 className="login-brand-title text-4xl xl:text-5xl font-extrabold leading-[1.05] tracking-tight">
            One login.
            <br />
            Every switchboard.
          </h2>
          <p className="login-brand-sub mt-4 text-sm leading-relaxed">
            Sign in to monitor relays live, run presets and alarms, and audit energy across home and commercial sites.
          </p>
          <ul className="login-brand-list mt-8 space-y-3 text-[13px] font-semibold">
            <li className="flex items-center gap-3">
              <span className="login-brand-icon login-brand-icon-1 w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                <Zap size={17} />
              </span>
              Live relay state with AC feedback
            </li>
            <li className="flex items-center gap-3">
              <span className="login-brand-icon login-brand-icon-2 w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                <Timer size={17} />
              </span>
              Presets, alarms & offline schedules
            </li>
            <li className="flex items-center gap-3">
              <span className="login-brand-icon login-brand-icon-3 w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                <Activity size={17} />
              </span>
              Per-device energy analytics
            </li>
          </ul>
        </div>
        <p className="login-brand-foot relative z-10 text-[11px] font-semibold">© 2026 Electric Warriors. Shock, Inspire, Lead.</p>
      </aside>

      {/* Task column */}
      <div className="relative flex items-center justify-center px-4 sm:px-6 py-20 sm:py-10 min-w-0">
        <div className="absolute top-4 left-4 z-50 lg:hidden" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <Link
            href="/"
            className="flex items-center gap-2 px-3 min-h-[44px] rounded-xl border border-border bg-card text-xs font-extrabold text-text hover:bg-card-alt hover:border-accent/40 transition-all cursor-pointer select-none"
            aria-label="Back to home"
          >
            <ArrowLeft size={14} />
            <span>Back</span>
          </Link>
        </div>

        <div className="absolute top-4 right-4 z-50" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <ThemeToggle />
        </div>

        <div className="w-full max-w-[440px] min-w-0">
          {/* Mobile brand header — compact, no kicker per craft-floor */}
          <div className="lg:hidden text-center mb-5">
            <div className="mx-auto mb-3 flex h-14 w-44 items-center justify-center overflow-hidden rounded-xl bg-white shadow-sm">
              <img src="/vikatech-logo.png" alt="VikaTech" className="h-full w-full object-contain" />
            </div>
            <h1 className="text-[32px] leading-[1.1] font-extrabold tracking-tight text-text">Smart Home</h1>
          </div>

          <div className="bg-auth-card px-5 sm:px-8 py-7 sm:py-9 rounded-2xl shadow-2xl shadow-gold-glow w-full border border-border">
            <h1 className="hidden lg:block text-center text-[40px] leading-none font-extrabold mb-2 text-accent tracking-tight">Smart Home</h1>
        <p className="text-center text-[13px] text-text-muted mb-6 font-bold uppercase tracking-wider">
          {view === 'login' && 'Sign in to your account'}
          {view === 'signup' && 'Create a new account'}
          {view === 'forgot' && 'Reset your password'}
          {view === 'forgot-questions' && 'Answer security questions'}
        </p>

        {view === 'login' && <LoginForm email={email} setEmail={setEmail} password={password} setPassword={setPassword} showPass={showPass} setShowPass={setShowPass} loading={loading} handleLogin={handleLogin} handleGoogleSignIn={handleGoogleSignIn} handleGithubSignIn={handleGithubSignIn} handleMicrosoftSignIn={handleMicrosoftSignIn} switchView={switchView} />}

        {view === 'signup' && (
          <SignupForm
            email={email}
            setEmail={setEmail}
            password={password}
            setPassword={setPassword}
            confirmPassword={confirmPassword}
            setConfirmPassword={setConfirmPassword}
            q1={q1}
            setQ1={setQ1}
            a1={a1}
            setA1={setA1}
            q2={q2}
            setQ2={setQ2}
            a2={a2}
            setA2={setA2}
            loading={loading}
            handleSignup={handleSignup}
            switchView={switchView}
            securityQuestions={SECURITY_QUESTIONS}
          />
        )}

        {view === 'forgot' && (
          <form className="flex flex-col gap-4" onSubmit={handleForgotSubmitEmail}>
            <div className="flex flex-col gap-1.5 min-w-0">
              <label htmlFor="forgot-email" className="text-xs font-extrabold tracking-wide text-text-muted">Email Address</label>
              <input
                id="forgot-email"
                className="w-full px-4 min-h-[48px] rounded-xl border-[1.5px] border-border bg-input text-text text-base outline-none transition-all focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/40"
                type="email"
                autoComplete="email"
                inputMode="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>
            <button
              className="w-full min-h-[52px] py-3 rounded-xl text-[15px] font-bold bg-accent text-[var(--btn-text)] transition-all hover:bg-accent-hover active:translate-y-0 cursor-pointer shadow-gold-glow mt-1 disabled:opacity-60"
              type="submit"
              disabled={loading}
            >
              {loading ? 'Looking up...' : 'Continue'}
            </button>
            <div className="text-center mt-1">
              <button
                className="bg-transparent min-h-[44px] px-4 text-[13px] font-bold text-accent hover:underline cursor-pointer"
                type="button"
                onClick={() => switchView('login')}
              >
                Back to login
              </button>
            </div>
          </form>
        )}

        {view === 'forgot-questions' && (
          <ForgotQuestionsForm
            failedAttempts={failedAttempts}
            forgotQ1={forgotQ1}
            forgotQ2={forgotQ2}
            forgotA1={forgotA1}
            setForgotA1={setForgotA1}
            forgotA2={forgotA2}
            setForgotA2={setForgotA2}
            recoveryInput={recoveryInput}
            setRecoveryInput={setRecoveryInput}
            loading={loading}
            handleVerifyRecoveryOTP={handleVerifyRecoveryOTP}
            handleForgotVerify={handleForgotVerify}
            switchView={switchView}
          />
        )}
        </div>
        </div>
      </div>
      {error && <Toast message={error} onClose={() => setError('')} />}
      {success && <Toast message={success} onClose={() => setSuccess('')} />}
    </div>
  );
}
