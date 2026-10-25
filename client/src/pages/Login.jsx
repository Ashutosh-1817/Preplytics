import { useCallback, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import GoogleSignInButton from '../components/GoogleSignInButton.jsx';
import './AuthForm.css';
import AuthAside from '../components/AuthAside.jsx';

function Login() {
  const { login, googleLogin } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleGoogle = useCallback(
    async (credential) => {
      setError('');
      try {
        await googleLogin(credential);
        navigate('/');
      } catch (err) {
        setError(err.response?.data?.error?.message || 'Google sign-in failed. Please try again.');
      }
    },
    [googleLogin, navigate]
  );

  const handleGoogleError = useCallback((message) => setError(message), []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      const apiError = err.response?.data?.error;
      if (apiError?.code === 'EMAIL_NOT_VERIFIED') {
        navigate('/verify-email', { state: { email: apiError.details?.email || email, emailSent: true, fromLogin: true } });
        return;
      }
      setError(apiError?.message || 'Login failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <AuthAside />
      <form className="auth-form surface" onSubmit={handleSubmit}>
        <div className="auth-brand">Preplytics</div>
        <h1 className="text-stat" style={{ fontSize: 'var(--text-xl)' }}>Welcome back</h1>

        {error && <p className="auth-error">{error}</p>}

        <label className="auth-label">
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="auth-input"
          />
        </label>

        <label className="auth-label">
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="auth-input"
          />
        </label>

        <div style={{ textAlign: 'right', marginTop: 'calc(var(--space-2) * -1)' }}>
          <Link to="/forgot-password" style={{ color: 'var(--signal)', fontSize: 'var(--text-sm)' }}>Forgot password?</Link>
        </div>

        <button type="submit" className="btn btn-primary" disabled={isSubmitting} style={{ width: '100%' }}>
          {isSubmitting ? 'Logging in…' : 'Log in'}
        </button>

        <div className="auth-divider"><span>or</span></div>
        <GoogleSignInButton onCredential={handleGoogle} onError={handleGoogleError} text={'signin_with'} />

        <p className="text-muted" style={{ fontSize: 'var(--text-sm)', textAlign: 'center' }}>
          Don't have an account? <Link to="/signup" style={{ color: 'var(--signal)' }}>Sign up</Link>
        </p>
      </form>
    </div>
  );
}

export default Login;