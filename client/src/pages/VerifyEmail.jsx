import { useEffect, useState } from 'react';
import { useLocation, useNavigate, Link, Navigate } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import './AuthForm.css';
import AuthAside from '../components/AuthAside.jsx';

const PENDING_KEY = 'preplytics.pendingVerifyEmail';
const COOLDOWN_SECONDS = 60;

const readPending = () => {
  try {
    return sessionStorage.getItem(PENDING_KEY) || '';
  } catch {
    return '';
  }
};

function VerifyEmail() {
  const { verifyEmail, resendCode } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // The email arrives through router state; sessionStorage keeps it across a page refresh
  const email = location.state?.email || readPending();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState(
    location.state?.emailSent === false
      ? "We couldn't send the email just now. Press “Send a new code” in a moment."
      : location.state?.fromLogin
        ? 'Your email is not verified yet. We sent you a code.'
        : ''
  );
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(location.state?.waitSeconds > 0 ? location.state.waitSeconds : COOLDOWN_SECONDS);

  useEffect(() => {
    if (email) {
      try {
        sessionStorage.setItem(PENDING_KEY, email);
      } catch {
        // storage blocked: the page still works while it stays open
      }
    }
  }, [email]);

  useEffect(() => {
    if (wait <= 0) return undefined;
    const timer = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  if (!email) return <Navigate to="/signup" replace />;

  const handleVerify = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setBusy(true);
    try {
      await verifyEmail(email, code);
      try {
        sessionStorage.removeItem(PENDING_KEY);
      } catch {
        // nothing to clean up
      }
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Could not verify. Please try again.');
      setBusy(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setInfo('');
    try {
      await resendCode(email);
      setInfo('A new code is on its way. Check your inbox and spam folder.');
      setWait(COOLDOWN_SECONDS);
    } catch (err) {
      const seconds = err.response?.data?.error?.details?.waitSeconds;
      if (seconds) setWait(seconds);
      setError(err.response?.data?.error?.message || 'Could not send a new code.');
    }
  };

  return (
    <div className="auth-page">
      <AuthAside />
      <form className="auth-form surface" onSubmit={handleVerify}>
        <div className="auth-brand">Preplytics</div>
        <div className="auth-icon"><MailCheck size={26} /></div>
        <h1 className="text-stat" style={{ fontSize: 'var(--text-xl)' }}>Check your email</h1>
        <p className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>
          We sent a 6-digit code to <strong style={{ color: 'var(--ink)' }}>{email}</strong>. It expires in 10 minutes.
        </p>

        {info && <p className="auth-info">{info}</p>}
        {error && <p className="auth-error">{error}</p>}

        <input
          className="auth-input auth-code-input"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          placeholder="000000"
          aria-label="6-digit verification code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          autoFocus
        />

        <button type="submit" className="btn btn-primary" disabled={busy || code.length !== 6} style={{ width: '100%' }}>
          {busy ? 'Verifying…' : 'Verify and continue'}
        </button>

        <p className="text-muted" style={{ fontSize: 'var(--text-sm)', textAlign: 'center' }}>
          Didn't get it?{' '}
          {wait > 0 ? (
            <span>Send a new code in {wait}s</span>
          ) : (
            <button type="button" className="auth-link-btn" onClick={handleResend}>Send a new code</button>
          )}
        </p>
        <p className="text-muted" style={{ fontSize: 'var(--text-sm)', textAlign: 'center' }}>
          Wrong email? <Link to="/signup" style={{ color: 'var(--signal)' }}>Start again</Link>
        </p>
      </form>
    </div>
  );
}

export default VerifyEmail;