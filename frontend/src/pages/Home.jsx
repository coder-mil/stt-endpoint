import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';

export default function Home() {
  const { user } = useAuth();
  return (
    <main className="container">
      <section className="hero">
        <h1>Speech-to-Text, sem complicação.</h1>
        <p>
          Microserviço FastAPI + faster-whisper. GPU/CPU fallback, fila interna, auth simples via
          API key. Self-hostable, REST puro — ou use a interface web para enviar áudios do
          navegador.
        </p>
        <div className="hero-cta">
          {user ? (
            <Link to="/dashboard"><button className="primary">Abrir dashboard</button></Link>
          ) : (
            <>
              <Link to="/register"><button className="primary">Criar conta grátis</button></Link>
              <Link to="/login"><button>Entrar</button></Link>
            </>
          )}
          <a href="/docs" target="_blank" rel="noreferrer"><button>Ver API docs</button></a>
        </div>
      </section>

      <section>
        <h2>O que está pronto</h2>
        <p>Tudo que você precisa pra um app STT em produção.</p>
        <div className="cards">
          <div className="card"><h3>Transcrição por HTTP</h3><p><code>POST /v1/transcribe</code> com multipart. Retorna texto + idioma + duração.</p></div>
          <div className="card"><h3>Auth + Tokens</h3><p>JWT access (15 min) + refresh (30 d) com rotação. Cookies httpOnly. CSRF double-submit.</p></div>
          <div className="card"><h3>Fila interna</h3><p>Semáforo limita concorrência. Cada trabalho tem ID e status consultável.</p></div>
          <div className="card"><h3>GPU → CPU</h3><p>Se CUDA falhar, faz fallback automático pra CPU int8 e retenta uma vez.</p></div>
          <div className="card"><h3>Reset de senha</h3><p>Token assinado, expira em 30 min, invalida todas as sessões ao trocar.</p></div>
          <div className="card"><h3>Rate limit + CORS</h3><p>Persiste em SQLite, sobrevive a restart. CORS por lista configurável.</p></div>
          <div className="card"><h3>Swagger UI</h3><p>Documentação interativa em <code>/docs</code>. OpenAPI 3.0 em <code>/openapi.json</code>.</p></div>
          <div className="card"><h3>Dashboard</h3><p>Envie áudios do navegador, veja histórico de transcrições, baixe texto.</p></div>
        </div>
      </section>

      <section>
        <h2>Endpoints</h2>
        <p>Públicos (sem login) — utilitários.</p>
        <div className="endpoints">
          <div className="ep-row"><span className="method-tag get">GET</span><span className="path">/health</span><span className="desc">liveness</span></div>
          <div className="ep-row"><span className="method-tag get">GET</span><span className="path">/ready</span><span className="desc">readiness + fila</span></div>
          <div className="ep-row"><span className="method-tag get">GET</span><span className="path">/docs</span><span className="desc">Swagger UI</span></div>
          <div className="ep-row"><span className="method-tag get">GET</span><span className="path">/openapi.json</span><span className="desc">spec</span></div>
          <div className="ep-row"><span className="method-tag post">POST</span><span className="path">/v1/transcribe</span><span className="desc">com <code>X-API-Key</code></span></div>
        </div>
      </section>

      <section>
        <h2>Como funciona</h2>
        <pre><code>{`# 1. pegar a chave de API no /dashboard (autenticado)
# 2. transcrever um áudio:
curl -X POST http://localhost:8000/v1/transcribe \\
  -H "X-API-Key: stt_sk_..." \\
  -F "audio=@recording.webm" \\
  -F "language=pt"

# Resposta
{
  "id": "8b2f...",
  "status": "done",
  "result": { "text": "...", "language": "pt", "duration": 3.4 }
}`}</code></pre>
      </section>

      <footer className="footer">
        MIT licensed · <a href="https://github.com/coder-mil/stt-endpoint" target="_blank" rel="noreferrer">github.com/coder-mil/stt-endpoint</a>
      </footer>
    </main>
  );
}
