# STT Endpoint — Auth Service

Gateway Express + Prisma + SQLite que:

- **Autentica** usuários com JWT (access + refresh rotativo) ou API-key
  (header `X-API-Key`) para o upstream STT em FastAPI
- **Persiste** transcrições (audit log) por usuário
- **Documenta** em OpenAPI 3.0 + Swagger UI
- **Hardenizado** com Helmet, CORS configurável, rate limit em SQLite,
  CSRF double-submit cookie, bcrypt(12), HTTPS-only cookies em prod

## Setup

```bash
npm install
cp .env.example .env
# Preencha JWT_ACCESS_SECRET (openssl rand -base64 32)
# Preencha JWT_REFRESH_SECRET e CSRF_SECRET (iguais ou diferentes)
# STT_ENDPOINT=http://localhost:8000
# STT_API_KEY=o mesmo do FastAPI
npx prisma db push --skip-generate --accept-data-loss
npm run dev
# http://localhost:4000
```

## Testes

```bash
DATABASE_URL="file:./test.db" npm test
```

5 testes cobrem: auth flow completo, CSRF, rate limit, password reset, OpenAPI.

## Fluxo de uso

1. `GET /csrf-mint` → guarda `csrf_token` cookie (expira em 12h)
2. `POST /auth/register` com `X-CSRF-Token` → cria conta
3. `POST /auth/login` → recebe cookies `access_token` (15 min) e `refresh_token` (30 d) + body JSON
4. Toda request autenticada envia `access_token` (cookie OU `Authorization: Bearer ***)
5. `POST /api/transcriptions` envia áudio multipart → grava audit + proxys STT
6. `POST /auth/logout` revoga a sessão

## Variáveis

Veja `.env.example`. Tudo é obrigatório exceto onde indicado.

## Endpoints

Tabela completa no [README raiz](../README.md).
