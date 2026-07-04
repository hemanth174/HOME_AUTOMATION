'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Toast from '@/components/Toast';
import Loader from '@/components/Loader';
import Link from 'next/link';
import { X, KeyRound, Zap } from 'lucide-react';

export default function ProfilePage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [updating, setUpdating] = useState(false);
  const [toast, setToast] = useState('');
  const [promptUpdate, setPromptUpdate] = useState(false);

  // Energy settings state
  const [tariff, setTariff] = useState('8.00');
  const [voltage, setVoltage] = useState('230');
  const [currency, setCurrency] = useState('INR');
  const [savingEnergy, setSavingEnergy] = useState(false);

  // Password states
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // MFA states
  const [showMfaModal, setShowMfaModal] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaInput, setMfaInput] = useState('');
  const [mfaError, setMfaError] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);
  const [verifyingCurrentEmail, setVerifyingCurrentEmail] = useState(false);

  // Swipe dismiss states
  const [translateY, setTranslateY] = useState(0);
  const [touchStart, setTouchStart] = useState(0);

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
      setNewEmail(user.email || '');

      // Fetch energy settings
      const { data: settings } = await supabase
        .from('user_settings')
        .select('tariff_per_kwh, voltage, currency')
        .eq('user_id', user.id)
        .maybeSingle();
      if (settings) {
        setTariff(String(settings.tariff_per_kwh));
        setVoltage(String(settings.voltage));
        setCurrency(settings.currency || 'INR');
      }

      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 500 - elapsed);
      setTimeout(() => {
        if (active) setLoading(false);
      }, remaining);
    };
    fetchUser();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      setPromptUpdate(params.get('promptUpdate') === 'true');
    }
  }, []);

  const isGoogle = user?.app_metadata?.provider === 'google' || user?.identities?.some(id => id.provider === 'google');
  const isEmailVerified = user && (user.user_metadata?.email_verified === true || isGoogle);

  const sendOtpEmail = async (emailAddress, code, isVerification) => {
    const subject = isVerification 
      ? 'Smart Home Security - Email Verification Code'
      : 'Smart Home Security - Profile Update Verification Code';
    const text = isVerification
      ? `Your email verification code is: ${code}\n\nUse this code to verify your email address.`
      : `Your security verification code is: ${code}\n\nUse this code to authorize updates to your profile name, email, or password.`;
    const title = isVerification ? 'Email Verification' : 'Profile Security Verification';
    const desc = isVerification 
      ? 'Please enter the following 6-digit verification code to confirm and verify your email address:'
      : 'We received a request to update your security profile details (Name/Email/Password). Please enter the following 6-digit verification code to confirm and authorize these modifications:';

    const response = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: emailAddress,
        subject,
        text,
        html: `
          <div style="font-family: sans-serif; padding: 20px; color: #111; max-width: 500px; border: 1px solid #eee; border-radius: 12px;">
            <h2 style="color: #c9a84c; margin-top: 0;">${title}</h2>
            <p>${desc}</p>
            <div style="background: #f7f7f7; padding: 16px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 4px; border-radius: 8px; color: #c9a84c; margin: 20px 0; border: 1px dashed #c9a84c;">
              ${code}
            </div>
            <p style="font-size: 12px; color: #666;">This code is valid for this session only. If you did not initiate this request, please secure your account immediately.</p>
            <hr style="border: 0; border-top: 1px solid #eee;" />
            <p style="font-size: 11px; color: #666;">This is an automated security alert from your Smart Home panel.</p>
          </div>
        `
      })
    });
    const resData = await response.json();
    if (!response.ok) throw new Error(resData.error || 'Failed to deliver verification code');
  };

  const handleSaveEnergySettings = async (e) => {
    e.preventDefault();
    const parsedTariff = parseFloat(tariff);
    const parsedVoltage = parseInt(voltage);
    if (isNaN(parsedTariff) || parsedTariff <= 0) { setToast('Please enter a valid tariff rate.'); return; }
    if (isNaN(parsedVoltage) || parsedVoltage < 100 || parsedVoltage > 500) { setToast('Voltage must be between 100 and 500V.'); return; }
    setSavingEnergy(true);
    try {
      const { error } = await supabase.from('user_settings').upsert({
        user_id: user.id,
        tariff_per_kwh: parsedTariff,
        voltage: parsedVoltage,
        currency,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });
      if (error) throw error;
      setToast('Energy settings saved successfully!');
    } catch (err) {
      setToast('Failed to save settings: ' + err.message);
    } finally {
      setSavingEnergy(false);
    }
  };

  const handleTriggerEmailVerification = async () => {
    setMfaLoading(true);
    setVerifyingCurrentEmail(true);
    setShowMfaModal(true);
    setMfaError('');
    setMfaInput('');
    setTranslateY(0);

    const generatedCode = Math.floor(100000 + Math.random() * 900000).toString();
    setMfaCode(generatedCode);

    try {
      await sendOtpEmail(user.email, generatedCode, true);
    } catch (err) {
      setMfaError(err.message);
    } finally {
      setMfaLoading(false);
    }
  };

  const handleSubmitProfileChanges = async (e) => {
    e.preventDefault();
    const currentName = user.user_metadata?.full_name || user.user_metadata?.name || '';
    const hasNameChanged = newName.trim() !== currentName;
    const hasEmailChanged = newEmail.trim().toLowerCase() !== user.email.toLowerCase();
    const hasPasswordChanged = !isGoogle && newPassword.length > 0;

    if (!newName.trim()) {
      setToast('Name cannot be empty');
      return;
    }
    if (!newEmail.trim()) {
      setToast('Email cannot be empty');
      return;
    }
    if (!hasNameChanged && !hasEmailChanged && !hasPasswordChanged) {
      setToast('No changes to update');
      return;
    }

    if (hasPasswordChanged) {
      if (newPassword.length < 6) {
        setToast('Password must be at least 6 characters');
        return;
      }
      if (newPassword !== confirmPassword) {
        setToast('Passwords do not match');
        return;
      }
    }

    setMfaLoading(true);
    setVerifyingCurrentEmail(false);
    setShowMfaModal(true);
    setMfaError('');
    setMfaInput('');
    setTranslateY(0);

    const generatedCode = Math.floor(100000 + Math.random() * 900000).toString();
    setMfaCode(generatedCode);

    try {
      await sendOtpEmail(user.email, generatedCode, false);
    } catch (err) {
      setMfaError(err.message);
    } finally {
      setMfaLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (mfaInput.length !== 6) {
      setMfaError('Please enter a 6-digit verification code');
      return;
    }
    if (mfaInput !== mfaCode) {
      setMfaError('Incorrect verification code. Please try again.');
      return;
    }

    setMfaLoading(true);
    setUpdating(true);
    try {
      if (verifyingCurrentEmail) {
        const { data, error } = await supabase.auth.updateUser({
          data: { ...user.user_metadata, email_verified: true }
        });
        if (error) throw error;
        setUser(data.user);
        setToast('Email verified successfully!');
        setShowMfaModal(false);
      } else {
        const updates = {};
        const currentName = user.user_metadata?.full_name || user.user_metadata?.name || '';
        
        if (newName.trim() !== currentName) {
          updates.data = { ...user.user_metadata, full_name: newName.trim() };
        }
        
        const hasEmailChanged = newEmail.trim().toLowerCase() !== user.email.toLowerCase();
        if (hasEmailChanged) {
          updates.email = newEmail.trim().toLowerCase();
        }

        if (!isGoogle && newPassword) {
          updates.password = newPassword;
        }

        const { data, error } = await supabase.auth.updateUser(updates);
        if (error) throw error;

        setUser(data.user);
        setToast(hasEmailChanged ? 'Profile updated! Please check both your old and new emails to confirm the address change.' : 'Profile updated successfully!');
        setPromptUpdate(false);
        setNewPassword('');
        setConfirmPassword('');
        setShowMfaModal(false);
      }
    } catch (err) {
      setMfaError(err.message);
    } finally {
      setMfaLoading(false);
      setUpdating(false);
    }
  };

  useEffect(() => {
    if (showMfaModal) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [showMfaModal]);

  const handleTouchStart = (e) => setTouchStart(e.touches[0].clientY);
  const handleTouchMove = (e) => {
    const diff = e.touches[0].clientY - touchStart;
    if (diff > 0) setTranslateY(diff);
  };
  const handleTouchEnd = () => {
    if (translateY > 100) {
      setShowMfaModal(false);
      setMfaInput('');
      setMfaError('');
    }
    setTranslateY(0);
  };

  if (loading) return <Loader message="Loading profile..." />;

  const metadata = user.user_metadata || {};
  const fullName = metadata.full_name || metadata.name || user.email.split('@')[0];
  const avatarUrl = metadata.avatar_url;
  const initials = fullName.substring(0, 2).toUpperCase();

  return (
    <div className="mx-auto w-[min(100%-32px,960px)] pt-[104px] pb-8 animate-fade-up max-md:w-[min(100%-24px,620px)] max-md:pt-[92px]">
      <div className="flex justify-between items-center mb-5">
        <h2 className="text-lg font-extrabold text-text tracking-tight">Account Profile</h2>
      </div>

      {promptUpdate && (
        <div className="mb-6 p-4 rounded-xl border border-accent bg-accent-bg text-accent text-xs font-bold animate-fade-in shadow-gold-glow flex flex-col gap-1">
          <span>🔔 Profile Action Required</span>
          <span className="text-text-muted font-semibold">Please update your Full Name below to complete your profile setup.</span>
        </div>
      )}

      <div className="relative overflow-hidden rounded-[18px] border border-border bg-card p-8 shadow-lg">
        <div className="flex flex-col items-center gap-6">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={fullName}
              className="w-24 h-24 rounded-full border-2 border-accent object-cover shadow-gold-glow shrink-0"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-24 h-24 rounded-full border-2 border-accent bg-accent-bg flex items-center justify-center text-3xl font-black text-accent shadow-gold-glow shrink-0">
              {initials}
            </div>
          )}

          <div className="text-center">
            <h2 className="text-2xl font-extrabold text-text leading-tight">{fullName}</h2>
            <p className="text-xs text-text-muted mt-1">{user.email}</p>
          </div>

          <form onSubmit={handleSubmitProfileChanges} className="w-full max-w-md border-t border-border pt-6 flex flex-col gap-4">
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

            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center">
                <label className="text-xs font-extrabold tracking-wide text-text-muted">Email Address</label>
                {isEmailVerified ? (
                  <span className="text-[10px] font-bold text-green-500 bg-green-500/10 px-2 py-0.5 rounded-md border border-green-500/20">Verified</span>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-red-500 bg-red-500/10 px-2 py-0.5 rounded-md border border-red-500/20 animate-pulse">Unverified</span>
                    <button
                      type="button"
                      onClick={handleTriggerEmailVerification}
                      className="text-[10px] font-extrabold text-accent hover:underline cursor-pointer"
                    >
                      Verify Now
                    </button>
                  </div>
                )}
              </div>
              <input
                className="w-full px-4 py-2.5 rounded-lg border-[1.5px] border-border bg-input text-text text-sm outline-none transition-all focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-bg)] disabled:opacity-50"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="Enter your email"
                disabled={isGoogle}
                required
              />
            </div>

            {!isGoogle ? (
              <>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-extrabold tracking-wide text-text-muted">New Password (leave blank to keep current)</label>
                  <input
                    className="w-full px-4 py-2.5 rounded-lg border-[1.5px] border-border bg-input text-text text-sm outline-none transition-all focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-bg)]"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min 6 characters"
                  />
                </div>
                {newPassword && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-extrabold tracking-wide text-text-muted">Confirm New Password</label>
                    <input
                      className="w-full px-4 py-2.5 rounded-lg border-[1.5px] border-border bg-input text-text text-sm outline-none transition-all focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-bg)]"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                      required={!!newPassword}
                    />
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col gap-1 p-3.5 rounded-xl border border-border bg-card-alt text-xs text-text-muted">
                <span className="font-extrabold text-accent">🔐 Google Managed Credentials</span>
                <span>You are logged in with Google OAuth. Your email verification status and password security are managed directly by Google.</span>
              </div>
            )}
            
            <button
              className="w-full py-2.5 rounded-lg text-xs font-extrabold bg-accent text-[#0a0800] transition-all hover:bg-accent-hover cursor-pointer shadow-gold-glow"
              type="submit"
              disabled={updating}
            >
              {updating ? 'Saving changes...' : 'Save Profile Changes'}
            </button>
          </form>

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

      {/* Energy Settings Card */}
      <div id="energy-settings" className="relative overflow-hidden rounded-[18px] border border-border bg-card p-8 shadow-lg mt-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-accent-bg flex items-center justify-center text-accent border border-accent/20 shadow-gold-glow">
            <Zap size={18} className="stroke-[2.5px]" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-text tracking-tight">Energy &amp; Billing Settings</h2>
            <p className="text-xs font-semibold text-text-muted">Configure your electricity tariff and household voltage for accurate cost calculations.</p>
          </div>
        </div>

        <form onSubmit={handleSaveEnergySettings} className="flex flex-col gap-4 max-w-md">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-extrabold tracking-wide text-text-muted">Electricity Tariff</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-text-muted">
                  {currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '₹'}
                </span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={tariff}
                  onChange={e => setTariff(e.target.value)}
                  className="w-full pl-7 pr-3 py-2.5 rounded-lg border-[1.5px] border-border bg-input text-text text-sm outline-none transition-all focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-bg)]"
                  placeholder="8.00"
                  required
                />
              </div>
              <span className="text-[10px] font-semibold text-text-muted">per kWh</span>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-extrabold tracking-wide text-text-muted">Household Voltage</label>
              <div className="relative">
                <input
                  type="number"
                  min="100"
                  max="500"
                  step="1"
                  value={voltage}
                  onChange={e => setVoltage(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border-[1.5px] border-border bg-input text-text text-sm outline-none transition-all focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-bg)]"
                  placeholder="230"
                  required
                />
              </div>
              <span className="text-[10px] font-semibold text-text-muted">Volts (V) — India: 230V, US: 120V</span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-extrabold tracking-wide text-text-muted">Currency Symbol</label>
            <select
              value={currency}
              onChange={e => setCurrency(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border-[1.5px] border-border bg-input text-text text-sm outline-none transition-all focus:border-accent cursor-pointer"
            >
              <option value="INR">₹ INR — Indian Rupee</option>
              <option value="USD">$ USD — US Dollar</option>
              <option value="EUR">€ EUR — Euro</option>
              <option value="GBP">£ GBP — British Pound</option>
            </select>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-xl bg-accent-bg/40 border border-accent/15 text-[11px] font-semibold text-text-muted">
            <Zap size={13} className="text-accent shrink-0" />
            <span>Cost = Energy (kWh) × <strong className="text-text">{currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '₹'}{tariff || '?'}/kWh</strong> · Current (A) = Watts ÷ <strong className="text-text">{voltage || '?'}V</strong></span>
          </div>

          <button
            type="submit"
            disabled={savingEnergy}
            className="inline-flex min-h-[38px] items-center justify-center gap-2 rounded-lg bg-accent px-6 py-2 text-xs font-extrabold text-[#0a0800] transition-all hover:bg-accent-hover cursor-pointer shadow-gold-glow disabled:opacity-50 disabled:cursor-not-allowed self-start"
          >
            {savingEnergy ? 'Saving...' : 'Save Energy Settings'}
          </button>
        </form>
      </div>

      {showMfaModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center">
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300"
            onClick={() => {
              setShowMfaModal(false);
              setMfaInput('');
              setMfaError('');
            }}
          />
          
          <div 
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{ transform: translateY > 0 ? `translateY(${translateY}px)` : undefined }}
            className={`relative bg-card w-full border border-border max-md:fixed max-md:bottom-0 max-md:left-0 max-md:right-0 max-md:rounded-t-[24px] max-md:p-6 max-md:pb-10 max-md:border-t max-md:border-x-0 md:w-[420px] md:rounded-[20px] md:p-8 md:shadow-2xl flex flex-col items-center ${
              translateY === 0 ? 'transition-all duration-200 ease-out' : ''
            }`}
          >
            <div className="w-12 h-1.5 bg-border rounded-full mb-6 cursor-grab active:cursor-grabbing md:hidden shrink-0" />
            
            <button
              type="button"
              onClick={() => {
                setShowMfaModal(false);
                setMfaInput('');
                setMfaError('');
              }}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-accent-bg/10 transition-all cursor-pointer border-none bg-transparent max-md:hidden"
            >
              <X size={16} />
            </button>

            <div className="w-12 h-12 rounded-full bg-accent-bg border border-accent/20 flex items-center justify-center text-accent mb-4 shadow-gold-glow/10 animate-pulse">
              <KeyRound size={22} className="stroke-[2.5px]" />
            </div>

            <h3 className="text-base font-extrabold text-text text-center tracking-tight mb-1">
              {verifyingCurrentEmail ? 'Email Verification' : 'MFA Security Verification'}
            </h3>
            <p className="text-xs text-text-muted text-center leading-relaxed mb-6 px-4">
              Enter the 6-digit verification code sent to <strong>{user?.email}</strong> to {verifyingCurrentEmail ? 'verify your email address' : 'authorize these profile modifications'}.
            </p>

            {mfaError && (
              <div className="w-full mb-4 p-3 rounded-xl border border-red-500/20 bg-red-500/5 text-red-500 text-xs font-bold text-center animate-shake leading-snug">
                ⚠️ {mfaError}
              </div>
            )}

            <form onSubmit={handleVerifyOtp} className="w-full flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <input
                  type="text"
                  maxLength={6}
                  value={mfaInput}
                  onChange={(e) => setMfaInput(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className="w-full px-4 py-3 rounded-xl border-[1.5px] border-border bg-input text-text text-center tracking-[0.3em] font-mono text-xl outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-bg)]"
                  disabled={mfaLoading}
                  required
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={mfaLoading}
                className="w-full py-3 rounded-lg text-xs font-extrabold bg-accent text-[#0a0800] transition-all hover:bg-accent-hover cursor-pointer shadow-gold-glow flex items-center justify-center gap-2"
              >
                {mfaLoading ? 'Verifying...' : verifyingCurrentEmail ? 'Confirm Verification' : 'Confirm & Save Changes'}
              </button>
            </form>
          </div>
        </div>
      )}

      <Toast message={toast} onClose={() => setToast('')} />
    </div>
  );
}
