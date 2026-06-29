import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const tokenFromUrl = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await fetch('/csrf-mint', { credentials: 'include' });
      await api.reset(tokenFromUrl, password);
      setDone(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(
        err.status === 400
          ? 'Token inválido ou expirado. Solicite um novo.'
          : err.message
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>Definir nova senha</h1>
        <p className="muted">Mínimo 10 caracteres.</p>
        {error && <div className="error">{error}</div>}
        {done ? (
          <div className="success">
            Senha atualizada. Redirecionando pro login…
          </div>
        ) : (
          <>
            <label htmlFor="password">Nova senha</label>
            <input
              id="password" type="password" required minLength={10}
              value={password} onChange={(e) => setPassword(e.target.value)}
            />
            <div className="row">
              <Link to="/login">Cancelar</Link>
              <button className="primary" type="submit" disabled={loading || !tokenFromUrl}>
                {loading ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
            {!tokenFromUrl && (
              <p className="error" style={{ marginTop: 12 }}>
                Token ausente. Abra o link enviado por email.
              </p>
            )}
          </>
        )}
      </form>
    </main>
  );
}
