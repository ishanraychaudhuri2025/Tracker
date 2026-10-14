import { useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import { supabase } from '../lib/supabase';

type AuthMode = 'signin' | 'signup' | 'reset';

export default function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) {
      setError('Cloud authentication is not configured yet. Add the Supabase URL and publishable key to the deployment environment.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (mode === 'signup') {
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (authError) throw authError;
        if (data.session) {
          setNotice('Account created. Your personal workspace is being prepared.');
        } else {
          setNotice('Check your inbox for the confirmation link, then return here to sign in.');
          setMode('signin');
        }
      } else if (mode === 'reset') {
        const { error: authError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: window.location.origin,
        });
        if (authError) throw authError;
        setNotice('If an account exists for that email, a password reset link is on its way.');
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (authError) throw authError;
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Authentication failed. Please try again.';
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setError('');
    setNotice('');
  };

  return <main className="auth-screen">
    <div className="auth-orbit auth-orbit-one" aria-hidden="true"/>
    <div className="auth-orbit auth-orbit-two" aria-hidden="true"/>
    <section className="auth-layout">
      <div className="auth-brand-column">
        <div className="auth-brand-lockup">
          <span className="auth-brand-mark"><svg viewBox="0 0 36 36" aria-hidden="true"><path d="M19.8 3.5 7 20.2h8.2l-1.8 12.3L29 14.9h-8.4L19.8 3.5Z" fill="currentColor"/></svg></span>
          <span>streako <i>/ OS</i></span>
        </div>
        <div className="auth-brand-copy">
          <span className="auth-eyebrow"><span/> YOUR PERSONAL PERFORMANCE SYSTEM</span>
          <h1>Build momentum.<br/><em>Keep what matters.</em></h1>
          <p>Your routines, daily tasks, calendar and focus sessions—saved securely to your account and ready whenever you are.</p>
          <div className="auth-value-list">
            <div><span><ShieldCheck size={16}/></span><div><b>Private by design</b><small>Your workspace is isolated to your account.</small></div></div>
            <div><span><Zap size={16}/></span><div><b>Synced across sessions</b><small>Check in here, pick up where you left off.</small></div></div>
            <div><span><Sparkles size={16}/></span><div><b>Progress without pressure</b><small>Small, repeatable actions beat perfect streaks.</small></div></div>
          </div>
        </div>
        <div className="auth-footnote">STREAKO ANALYTICS · PERSONAL DATA SYSTEM</div>
      </div>

      <div className="auth-form-column">
        <div className="auth-form-header">
          <span className="auth-form-icon"><LockKeyhole size={17}/></span>
          <span className="auth-form-kicker">{mode === 'signup' ? 'START YOUR WORKSPACE' : mode === 'reset' ? 'ACCOUNT RECOVERY' : 'WELCOME BACK'}</span>
        </div>
        <h2>{mode === 'signup' ? 'Create your account' : mode === 'reset' ? 'Reset your password' : 'Sign in to Streako'}</h2>
        <p className="auth-form-subtitle">{mode === 'signup' ? 'A calmer system starts with a clean slate.' : mode === 'reset' ? 'We’ll email you a secure reset link.' : 'Your next small win is waiting.'}</p>
        <form onSubmit={submit} className="auth-form">
          <label>Email address <span className="auth-input-wrap"><Mail size={15}/><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required maxLength={254}/></span></label>
          {mode !== 'reset' && <label>Password <span className="auth-input-wrap"><LockKeyhole size={15}/><input type={showPassword ? 'text' : 'password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === 'signup' ? 'At least 8 characters' : 'Enter your password'} minLength={8} maxLength={128} required/><button type="button" className="auth-password-toggle" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={15}/> : <Eye size={15}/>}</button></span></label>}
          {mode === 'signin' && <button type="button" className="auth-forgot" onClick={() => switchMode('reset')}>Forgot password?</button>}
          {error && <div role="alert" className="auth-message auth-error">{error}</div>}
          {notice && <div role="status" className="auth-message auth-success">{notice}</div>}
          <button type="submit" className="auth-submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Continue'} {!busy && <ArrowRight size={15}/>}</button>
        </form>
        {mode === 'signup' ? <p className="auth-switch">Already have an account? <button type="button" onClick={() => switchMode('signin')}>Sign in</button></p>
          : mode === 'reset' ? <p className="auth-switch"><button type="button" onClick={() => switchMode('signin')}>Back to sign in</button></p>
          : <p className="auth-switch">New to Streako? <button type="button" onClick={() => switchMode('signup')}>Create an account</button></p>}
        <div className="auth-secure-note"><ShieldCheck size={13}/> Secure account access · Encrypted in transit</div>
      </div>
    </section>
  </main>;
}
