export default function Docs() {
  return (
    <main className="container">
      <h1>API docs</h1>
      <p style={{ color: 'var(--fg-1)' }}>
        Documentação interativa (Swagger UI) e OpenAPI spec estão no auth-service
        (mesma base que o dashboard). Abra em nova aba:
      </p>
      <p>
        <a href="/docs" target="_blank" rel="noreferrer">
          <button className="primary">Abrir Swagger UI em nova aba</button>
        </a>{' '}
        <a href="/openapi.json" target="_blank" rel="noreferrer">
          <button>Baixar openapi.json</button>
        </a>
      </p>

      <section>
        <h2>Resumo rápido</h2>
        <div className="endpoints">
          <div className="ep-row"><span className="method-tag post">POST</span><span className="path">/auth/register</span><span className="desc">email + senha</span></div>
          <div className="ep-row"><span className="method-tag post">POST</span><span className="path">/auth/login</span><span className="desc">retorna cookies + body</span></div>
          <div className="ep-row"><span className="method-tag post">POST</span><span className="path">/auth/refresh</span><span className="desc">rotação de tokens</span></div>
          <div className="ep-row"><span className="method-tag post">POST</span><span className="path">/auth/logout</span><span className="desc">revoga sessão</span></div>
          <div className="ep-row"><span className="method-tag get">GET</span><span className="path">/auth/me</span><span className="desc">usuário atual</span></div>
          <div className="ep-row"><span className="method-tag post">POST</span><span className="path">/auth/forgot-password</span><span className="desc">envia token</span></div>
          <div className="ep-row"><span className="method-tag post">POST</span><span className="path">/auth/reset-password</span><span className="desc">consome token</span></div>
          <div className="ep-row"><span className="method-tag post">POST</span><span className="path">/api/transcriptions</span><span className="desc">multipart audio</span></div>
          <div className="ep-row"><span className="method-tag get">GET</span><span className="path">/api/transcriptions</span><span className="desc">histórico</span></div>
          <div className="ep-row"><span className="method-tag delete">DEL</span><span className="path">/api/transcriptions/:id</span><span className="desc">apagar</span></div>
        </div>
        <p style={{ color: 'var(--fg-2)', marginTop: 16, fontSize: '0.88rem' }}>
          Em todo POST/PUT/DELETE envia também o header <code>X-CSRF-Token</code> cujo valor
          deve ser igual ao cookie <code>csrf_token</code> (double-submit).
        </p>
      </section>
    </main>
  );
}
