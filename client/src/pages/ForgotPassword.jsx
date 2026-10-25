import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import './AuthForm.css';
import AuthAside from '../components/AuthAside.jsx';

const messageOf = (err, fallback) => err.response?.data?.error?.message || fallback;

function ForgotPassword() {
  const { forgotPassword, resetPassword } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState('email'); // 'email' | 'reset'
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const requestCode = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await forgotPassword(email.trim());
      setInfo(`If an account exists for ${email.trim()}, we sent a 6-digit code. Check your inbox and spam folder.`);
      setStep('reset');
    } catch (err) {
      setError(messageOf(err, 'Could not send the code. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const submitReset = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await resetPassword(email.trim(), code, password);
      navigate('/login', { replace: true });
    } catch (err) {
      setError(messageOf(err, 'Could not reset the password. Please try again.'));
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <AuthAside />
      {step === 'email' ? (
        <form className="auth-form surface" onSubmit={requestCode}>
          <div className="auth-brand">Preplytics</div>
          <h1 className="text-stat" style={{ fontSize: 'var(--text-xl)' }}>Reset your password</h1>
          <p className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>Enter your email and we'll send you a 6-digit code.</p>
          {error && <p className="auth-error">{error}</p>}
          <label className="auth-label">
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="auth-input" autoFocus />
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy} style={{ width: '100%' }}>
            {busy ? 'Sending…' : 'Send code'}
          </button>
          <p className="text-muted" style={{ fontSize: 'var(--text-sm)', textAlign: 'center' }}>
            <Link to="/login" style={{ color: 'var(--signal)' }}>Back to log in</Link>
          </p>
        </form>
      ) : (
        <form className="auth-form surface" onSubmit={submitReset}>
          <div className="auth-brand">Preplytics</div>
          <h1 className="text-stat" style={{ fontSize: 'var(--text-xl)' }}>Enter the code</h1>
          {info && <p className="auth-info">{info}</p>}
          {error && <p className="auth-error">{error}</p>}
          <input
            className="auth-input auth-code-input"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            aria-label="6-digit reset code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            autoFocus
          />
          <label className="auth-label">
            New password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} className="auth-input" />
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy || code.length !== 6 || password.length < 8} style={{ width: '100%' }}>
            {busy ? 'Saving…' : 'Set new password'}
          </button>
          <p className="text-muted" style={{ fontSize: 'var(--text-sm)', textAlign: 'center' }}>
            <button type="button" className="auth-link-btn" onClick={() => { setStep('email'); setCode(''); setInfo(''); setError(''); }}>
              Use a different email
            </button>
          </p>
        </form>
      )}
    </div>
  );
}

export default ForgotPassword;