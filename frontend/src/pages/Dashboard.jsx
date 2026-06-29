import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';

export default function Dashboard() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [language, setLanguage] = useState('pt');

  async function refresh() {
    setLoading(true);
    try {
      const r = await api.listTranscriptions();
      setItems(r.items || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function onUpload(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await api.uploadTranscription(file, language);
      await refresh();
    } catch (err) {
      setError(err.body?.error || err.message);
    } finally {
      setUploading(false);
    }
  }

  async function onDelete(id) {
    if (!confirm('Apagar essa transcrição?')) return;
    try {
      await api.deleteTranscription(id);
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <main className="container">
      <h1>Olá, {user?.name || user?.email}</h1>
      <p style={{ color: 'var(--fg-1)' }}>
        Envie um áudio (.webm, .mp3, .wav) e aguarde a transcrição. Idiomas: pt-BR (default) ou en.
        Máximo 25 MB por arquivo.
      </p>

      <div className="dash-grid">
        <div className="card">
          <h3>Enviar novo áudio</h3>
          <label htmlFor="lang">Idioma</label>
          <select id="lang" value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="pt">Português (BR)</option>
            <option value="en">English</option>
            <option value="es">Español</option>
          </select>
          <div style={{ marginTop: 16 }}>
            <input
              type="file" accept="audio/*" id="up" disabled={uploading}
              onChange={onUpload}
            />
          </div>
          {uploading && (
            <p style={{ color: 'var(--fg-1)', marginTop: 12 }}>
              Transcrevendo… pode demorar alguns segundos.
            </p>
          )}
          {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}
        </div>

        <div className="card">
          <h3>Sua conta</h3>
          <dl className="kv">
            <dt>Email</dt><dd>{user?.email}</dd>
            <dt>Função</dt><dd>{user?.role}</dd>
            <dt>API key</dt>
            <dd>
              <code>stt_sk_***…</code>
              <br /><small style={{ color: 'var(--fg-2)' }}>
                (em produção, expor no dashboard via botão “revelar”)
              </small>
            </dd>
          </dl>
        </div>
      </div>

      <section>
        <h2 style={{ marginTop: 40 }}>Histórico</h2>
        {loading && <div className="empty">Carregando…</div>}
        {!loading && items.length === 0 && (
          <div className="empty">
            Nenhuma transcrição ainda. Envie o primeiro áudio ↑
          </div>
        )}
        <div className="history">
          {items.map((it) => (
            <div key={it.id} className="history-item">
              <div className="meta">
                <span className={`status ${it.status === 'done' ? 'done' : it.status === 'error' ? 'error' : ''}`}>
                  {it.status}
                </span>
                <span>{it.filename || 'audio'}</span>
                <span>·</span>
                <span>{it.language || 'pt'}</span>
                <span>·</span>
                <span>{(it.bytes / 1024).toFixed(1)} KB</span>
                <span>·</span>
                <span>{new Date(it.createdAt).toLocaleString('pt-BR')}</span>
                <button
                  style={{ marginLeft: 'auto', padding: '4px 10px', fontSize: '0.85rem' }}
                  onClick={() => onDelete(it.id)}
                >
                  Apagar
                </button>
              </div>
              {it.textPreview && <div className="text">{it.textPreview}</div>}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
