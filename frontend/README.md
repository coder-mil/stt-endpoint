# STT Endpoint — Frontend

React 18 + Vite + React Router. Páginas:

| Rota        | Componente          | Auth |
|-------------|---------------------|------|
| `/`         | Home (landing + docs) | opcional |
| `/login`    | Login               | —    |
| `/register` | Cadastro            | —    |
| `/forgot`   | Esqueci a senha     | —    |
| `/reset`    | Resetar senha       | —    |
| `/dashboard`| Dashboard protegido| sim  |
| `/docs`     | Resumo da API       | opcional |

O dev server (`npm run dev`) faz **proxy** de tudo que começa com
`/auth`, `/api`, `/csrf-mint`, `/docs`, `/openapi.json`, `/health`, `/ready`
para o auth-service em `http://localhost:4000`.

## Setup

```bash
npm install
npm run dev     # http://localhost:5173
```

## Build de produção

```bash
npm run build       # → dist/
npm run preview     # serve dist/
```

Bundle atual: ~187 kB (60 kB gzip). Apenas React + React Router DOM.

## Lint

```bash
npm run lint
```

## Como fala com o backend

`src/lib/api.js` é um fetch wrapper que:

1. Injeta `X-CSRF-Token` em todo método não-GET
2. Sempre usa `credentials: 'include'` (cookies de auth)
3. Decodifica JSON, retorna `body` e propaga erros com `.status`

Não usa libs externas (`axios`, `swr`, etc) — fetched direto.

## Proximos passos

- [ ] Trocar o `useState` polling por `useSWR` ou similar
- [ ] Drag-and-drop de arquivos na home
- [ ] Mostrar player do áudio no histórico
- [ ] Página de admin (`/admin`) — requer `role: 'admin'`
- [ ] Theming toggle (light/dark já tem cores prontas)
