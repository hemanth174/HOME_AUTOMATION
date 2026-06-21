'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import ThemeToggle from '@/components/ThemeToggle';
import Toast from '@/components/Toast';
import GoogleImage from '../../../public/GoogleImage.png';
import { Eye, EyeClosed } from 'lucide-react';
import SignupForm from '@/components/SignupForm';
import ForgotQuestionsForm from '@/components/ForgotQuestionsForm';

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
        redirectTo: window.location.origin,
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
        redirectTo: window.location.origin,
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
    <div className="relative min-h-screen w-full flex items-center justify-center p-6">
      <div className="absolute top-5 right-5 z-50">
        <ThemeToggle />
      </div>
    
      <div className="bg-auth-card px-8 py-9 rounded-[22px] shadow-2xl shadow-gold-glow w-full max-w-[420px]  border border-border">
        <h1 className="text-center text-5xl font-extrabold mb-2 text-accent ">Smart Home</h1>
        <p className="text-center text-xs text-text-muted mb-6 font-bold uppercase tracking-wider">
          {view === 'login' && 'Sign in to your account'}
          {view === 'signup' && 'Create a new account'}
          {view === 'forgot' && 'Reset your password'}
          {view === 'forgot-questions' && 'Answer security questions'}
        </p>

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
             <div className='flex rounded-lg border-[1.5px] border-border'>
               <input
                className="w-full px-4 py-2.5  bg-input text-text text-sm outline-none transition-all focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-bg)]"
                type={showPass ? "password" : "text"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                required
              />
              <button className='border-[1.5px] border-border p-2' onClick={()=>setShowPass(!showPass)} type="button">{showPass ? <EyeClosed />:<Eye/>}</button>
             </div>
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
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="flex items-center justify-center gap-3 w-full py-2.5 rounded-lg text-sm font-semibold border-[1.5px] border-border bg-card text-text transition-all hover:bg-card-alt hover:border-accent/40 active:scale-[0.99] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span>Signing in...</span>
              ) : (
                <>
                  <img className="h-5 w-5 object-contain" src={GoogleImage.src} alt="Google logo" />
                  <span>Continue with Google</span>
                </>
              )}
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
      {error && <Toast message={error} onClose={() => setError('')} />}
      {success && <Toast message={success} onClose={() => setSuccess('')} />}
    </div>
  );
}
