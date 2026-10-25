import { useCallback, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import GoogleSignInButton from '../components/GoogleSignInButton.jsx';
import './AuthForm.css';

function Signup() {
  const { signup, googleLogin } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
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
      const result = await signup(name, email, password);
      navigate('/verify-email', { state: { email: result.email, emailSent: result.emailSent, waitSeconds: result.waitSeconds } });
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Signup failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-form surface" onSubmit={handleSubmit}>
        <div className="auth-brand">Preplytics</div>
        <h1 className="text-stat" style={{ fontSize: 'var(--text-xl)' }}>Create your account</h1>

        {error && <p className="auth-error">{error}</p>}

        <label className="auth-label">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required className="auth-input" />
        </label>

        <label className="auth-label">
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="auth-input" />
        </label>

        <label className="auth-label">
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} className="auth-input" />
        </label>

        <button type="submit" className="btn btn-primary" disabled={isSubmitting} style={{ width: '100%' }}>
          {isSubmitting ? 'Creating account…' : 'Sign up'}
        </button>

        <div className="auth-divider"><span>or</span></div>
        <GoogleSignInButton onCredential={handleGoogle} onError={handleGoogleError} text={'signup_with'} />

        <p className="text-muted" style={{ fontSize: 'var(--text-sm)', textAlign: 'center' }}>
          Already have an account? <Link to="/login" style={{ color: 'var(--signal)' }}>Log in</Link>
        </p>
      </form>
    </div>
  );
}

export default Signup;