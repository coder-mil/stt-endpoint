import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(msgFor(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>Entrar</h1>
        <p className="muted">Acesse seu painel de transcrições.</p>
        {error && <div className="error">{error}</div>}
        <label htmlFor="email">Email</label>
        <input
          id="email" type="email" autoComplete="email" required
          value={email} onChange={(e) => setEmail(e.target.value)}
        />
        <label htmlFor="password">Senha</label>
        <input
          id="password" type="password" autoComplete="current-password" required
          value={password} onChange={(e) => setPassword(e.target.value)}
        />
        <div className="row">
          <Link to="/forgot">Esqueci a senha</Link>
          <button className="primary" type="submit" disabled={loading}>
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </div>
        <p className="muted" style={{ textAlign: 'center', marginTop: 28 }}>
          Sem conta? <Link to="/register">Criar agora</Link>
        </p>
      </form>
    </main>
  );
}

function msgFor(err) {
  if (err.status === 401) return 'Email ou senha incorretos.';
  if (err.status === 429) return 'Muitas tentativas. Tente novamente em alguns minutos.';
  if (err.status === 403) return 'Sessão expirada (CSRF). Recarregue a página e tente de novo.';
  return err.message || 'Algo deu errado.';
}
