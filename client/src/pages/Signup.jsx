import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import './AuthForm.css';

function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      await signup(name, email, password);
      navigate('/');
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

        <p className="text-muted" style={{ fontSize: 'var(--text-sm)', textAlign: 'center' }}>
          Already have an account? <Link to="/login" style={{ color: 'var(--signal)' }}>Log in</Link>
        </p>
      </form>
    </div>
  );
}

export default Signup;