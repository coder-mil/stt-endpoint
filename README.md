# STT Endpoint

Microsserviço HTTP STT (speech-to-text) em FastAPI, com **dashboard web**
incluído. Composto por três partes que rodam juntas:

```
.
├── app/                   # FastAPI STT (Python, faster-whisper)
├── auth-service/          # Express auth gateway (Node, Prisma + SQLite)
└── frontend/              # React + Vite UI (dashboard, login, etc.)
```

Ver documentação detalhada por subsistema:

- **STT puro:** leia o código em `app/main.py`.
- **Auth gateway:** [`auth-service/README.md`](auth-service/README.md)
- **Frontend UI:** [`frontend/README.md`](frontend/README.md)

## Stack

| Subsistema    | Stack                                        | Porta padrão |
|---------------|----------------------------------------------|--------------|
| STT (Python)  | FastAPI · faster-whisper · uvicorn           | `8000`       |
| Auth (Node)   | Express · Prisma · SQLite · JWT · CSRF       | `4000`       |
| Frontend      | React 18 · React Router · Vite               | `5173`       |

## Quickstart (Docker, recomendado)

```bash
cp .env.example .env             # preencha JWT_*, CSRF_*, STT_API_KEY
docker compose up --build        # primeira vez: 1-3 min (baixa modelo Whisper)
open http://localhost:8080
```

A imagem do STT vem com o modelo Whisper **pré-baked** — não há download
durante a primeira transcrição.

## Quickstart (dev local, sem Docker)

```bash
# 1. Backend Python (STT real)
pip install -e ".[dev]"
cp .env.example .env        # fill in STT_API_KEY
uvicorn app.main:app --reload --port 8000

# 2. Auth gateway
cd auth-service
npm install
cp .env.example .env        # fill in JWT_*, STT_*
npx prisma db push --skip-generate --accept-data-loss
npm run dev                 # http://localhost:4000

# 3. Frontend
cd ../frontend
npm install
npm run dev                 # http://localhost:5173
```

Abre <http://localhost:5173>, faz o fluxo **Register → Login → Dashboard →
Upload de áudio** e em segundos vê a transcrição na lista.

## Features

| Categoria       | O que tem |
|-----------------|-----------|
| Auth            | Register · login · logout · JWT access (15 min) + refresh (30 d) · rotação de refresh · bcrypt(12) |
| Password reset  | Token de uso único, expira em 30 min, invalida todas as sessões |
| Cookies         | httpOnly + Secure (em prod) + SameSite · CSRF double-submit |
| CSRF            | Double-submit cookie com `X-CSRF-Token` (testado em supertest) |
| Rate limit      | Persistente em SQLite (sobrevive restart) · headers `X-RateLimit-*` + `Retry-After` |
| CORS            | Allow-list via env, fallback controlado |
| Swagger         | OpenAPI 3.0 + UI em `/docs`, spec em `/openapi.json` |
| Helmet          | Headers de segurança padrão |
| Transcrição     | Proxy para STT upstream com audit log em DB |
| Validation      | express-validator (registro/login/reset) |
| Logs            | JSON estruturado (1 linha por evento) |

## API endpoints (atrás do auth-service)

| Método | Caminho                       | Auth        | Descrição |
|--------|-------------------------------|-------------|-----------|
| GET    | `/csrf-mint`                  | —           | Devolve + seta `csrf_token` cookie |
| POST   | `/auth/register`              | —           | Cria conta |
| POST   | `/auth/login`                 | —           | Login (cookies + body) |
| POST   | `/auth/refresh`               | refresh     | Rotaciona tokens |
| POST   | `/auth/logout`                | —           | Revoga sessão |
| GET    | `/auth/me`                    | sim         | Usuário atual |
| POST   | `/auth/forgot-password`       | —           | Token de reset (em dev vem na resposta) |
| POST   | `/auth/reset-password`        | —           | Consome token + invalida sessões |
| POST   | `/api/transcriptions`         | sim         | multipart audio → upstream STT |
| GET    | `/api/transcriptions`         | sim         | Histórico do usuário |
| GET    | `/api/transcriptions/:id`     | sim         | Detalhe |
| DELETE | `/api/transcriptions/:id`     | sim         | Apagar |
| GET    | `/health`                     | —           | Liveness |
| GET    | `/ready`                      | —           | DB + status |
| GET    | `/docs`                       | —           | Swagger UI |
| GET    | `/openapi.json`               | —           | Spec |

Documentação completa interativa em <http://localhost:4000/docs>.

## Deploy em produção

Defina:

- `COOKIE_SECURE=true` (HTTPS)
- `CORS_ORIGINS=https://app.mauriciomilano.com`
- `STT_ENDPOINT=http://stt-interno:8000` (mesma VPC)
- `STT_API_KEY` segura (openssl rand -base64 32)
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CSRF_SECRET` fortes e distintos

## License

MIT — Copyright (c) 2026 MauricioMilano.
