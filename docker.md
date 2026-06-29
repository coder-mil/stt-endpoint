# Deploying with Docker

`docker compose` sobe os três serviços juntos. O domínio público (`localhost:8080` em dev,
seu domínio em prod) **vê um único serviço**: o nginx do frontend, que internamente
direciona `/api`, `/auth`, `/csrf-mint`, `/docs`, `/openapi.json`, `/health` para o
auth-service, e o STT é interno (só o auth fala com ele).

```
                           Browser (https://app.seu.dominio)
                                          │
                                          ▼
                                ┌───────────────────┐
                  :8080  ───────►│  frontend (nginx) │
                                └────────┬──────────┘
                                         │ /api/auth/* → proxy
                                         ▼
                                ┌───────────────────┐
                                │   auth-service    │ :4000 (interno)
                                │  (Express+Prisma) │
                                └────────┬──────────┘
                                         │ STT proxy
                                         ▼
                                ┌───────────────────┐
                                │   stt (FastAPI)   │ :8000 (interno)
                                └───────────────────┘
```

## Pré-requisitos

- Docker 24+ com `compose` v2
- (Opcional, GPU) NVIDIA driver + `nvidia-container-toolkit`

## Subir CPU

```bash
cp .env.example .env
$EDITOR .env                      # preencha JWT_*, CSRF_*, STT_API_KEY
docker compose up --build -d
docker compose ps                 # até "healthy" em todos
docker compose logs -f auth       # opcional: ver logs ao vivo
```

Abra <http://localhost:8080>. Clicar em **Criar conta** leva ao fluxo register → login → dashboard.

## Subir GPU (NVIDIA)

```bash
docker compose --profile gpu up --build -d
```

A imagem CUDA (~3 GB) substitui a CPU; o mesmo `:8080` responde. Veja no `/ready`
qual device está ativo.

## Variáveis obrigatórias (em `.env`)

| Var                  | Onde    | Gerar com |
|----------------------|---------|-----------|
| `STT_API_KEY`        | auth → STT | `openssl rand -base64 32` |
| `JWT_ACCESS_SECRET`  | auth     | `openssl rand -base64 32` |
| `JWT_REFRESH_SECRET` | auth     | `openssl rand -base64 32` (pode ser igual ao access) |
| `CSRF_SECRET`        | auth     | `openssl rand -base64 32` |

Recomendado usar **valores distintos** para cada um. Mas todos precisam estar
presentes ou o serviço **não sobe** (validação fail-fast em `lib/env.js`).

## Configuração em produção (HTTPS)

1. Botar um reverse proxy com HTTPS na frente (Traefik, Caddy, Cloudflare Tunnel,
   nginx) que faça terminação TLS e mantenha `X-Forwarded-Proto: https`.
2. Ajustar `.env`:
   ```env
   COOKIE_SECURE=true
   CORS_ORIGINS=https://app.mauriciomilano.com
   JWT_* / CSRF_* / STT_API_KEY = (use gerador)
   ```
3. Garantir que o nginx do frontend propaga `X-Forwarded-Proto` (já faz).
4. (Opcional) trocar SQLite por Postgres:
   ```prisma
   datasource db { provider = "postgresql" url = env("DATABASE_URL") }
   ```
   E adicionar um serviço `db:` no compose.

## Healthchecks úteis

| URL                                       | Verifica |
|-------------------------------------------|----------|
| <http://localhost:8080/health>             | nginx up |
| <http://localhost:8080/ready> (proxied)   | DB up    |
| <http://localhost:8080/docs>              | Swagger UI |
| <http://localhost:8080/openapi.json>      | Spec     |
| Direto no `auth`: `docker compose exec auth wget -qO- :4000/ready` | DB |
| Direto no `stt`:  `docker compose exec stt curl :8000/ready`       | fila |

## Reset total

```bash
docker compose down -v   # mata containers + apaga volumes (DB!)
docker compose up --build
```

> ⚠️ `-v` apaga `auth_data` (SQLite) e `stt_models` (Whisper cache). Remova
> apenas o volume certo se não quiser perder tudo:
> `docker volume rm stt-endpoint_stt_models` ou `..._auth_data`.

## Limites / tamanhos

- **Upload de áudio**: 25 MB cap (ajustável em `STT_MAX_FILE_SIZE_MB`)
- **DB**: SQLite até ~1 GB confortavelmente; depois disso migre pra Postgres
- **Modelos Whisper**: `tiny`~75MB, `base`~142MB, `medium`~1.5GB, `large-v3`~3GB

## Build manual sem compose

Se quiser buildar localmente (CI por exemplo):

```bash
docker build -t coder-mil/stt-endpoint:cpu ./app
docker build -t coder-mil/stt-endpoint-auth:local ./auth-service
docker build -t coder-mil/stt-endpoint-ui:local ./frontend
```

## Logs

```bash
docker compose logs -f --tail=100 auth
```

Auth-service loga em JSON estruturado (1 linha por evento). Para dev legível:
```bash
docker compose exec auth sh -c 'sed -i s/NODE_ENV=production/NODE_ENV=development/ /etc/profile; bash'
```

…mas recomendado é só configurar coletor (Loki/CloudWatch/Datadog) com parser
de JSON.
