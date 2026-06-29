import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';

export default function Register() {
  const { register, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await register({ email, password, name });
      // log in immediately
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
        <h1>Criar conta</h1>
        <p className="muted">Rápido e gratuito (rodando local).</p>
        {error && <div className="error">{error}</div>}
        <label htmlFor="name">Nome (opcional)</label>
        <input
          id="name" type="text" autoComplete="name"
          value={name} onChange={(e) => setName(e.target.value)}
        />
        <label htmlFor="email">Email</label>
        <input
          id="email" type="email" autoComplete="email" required
          value={email} onChange={(e) => setEmail(e.target.value)}
        />
        <label htmlFor="password">Senha (mín. 10 caracteres)</label>
        <input
          id="password" type="password" autoComplete="new-password" required
          value={password} onChange={(e) => setPassword(e.target.value)}
          minLength={10}
        />
        <div className="row">
          <Link to="/login">Já tenho conta</Link>
          <button className="primary" type="submit" disabled={loading}>
            {loading ? 'Criando…' : 'Criar conta'}
          </button>
        </div>
      </form>
    </main>
  );
}

function msgFor(err) {
  if (err.status === 409) return 'Esse email já está cadastrado.';
  if (err.status === 400) {
    const reason = err.body?.details?.[0]?.msg || 'dados inválidos';
    return `Dados inválidos: ${reason}`;
  }
  if (err.status === 429) return 'Muitas tentativas. Tente novamente em alguns minutos.';
  return err.message || 'Algo deu errado.';
}
