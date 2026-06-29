import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [devToken, setDevToken] = useState(null);
  const [error, setError] = useState(null);

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await fetch('/csrf-mint', { credentials: 'include' });
      const r = await api.forgot(email);
      setDone(true);
      setDevToken(r.devToken);
    } catch (err) {
      setError(err.message || 'Falha ao enviar email.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>Esqueci a senha</h1>
        <p className="muted">
          Vamos enviar um link de redefinição para o seu email.
        </p>
        {error && <div className="error">{error}</div>}
        {done ? (
          <div className="success">
            Se esse email estiver cadastrado, enviaremos um link em instantes.
            {devToken && (
              <div style={{ marginTop: 12, fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                <strong>(modo dev)</strong> token: <code>{devToken.slice(0, 12)}…</code>
                <br />
                <Link to={`/reset?token=${encodeURIComponent(devToken)}`}>
                  usar token agora →
                </Link>
              </div>
            )}
          </div>
        ) : (
          <>
            <label htmlFor="email">Email</label>
            <input
              id="email" type="email" required
              value={email} onChange={(e) => setEmail(e.target.value)}
            />
            <div className="row">
              <Link to="/login">Voltar pro login</Link>
              <button className="primary" type="submit" disabled={loading}>
                {loading ? 'Enviando…' : 'Enviar link'}
              </button>
            </div>
          </>
        )}
      </form>
    </main>
  );
}
