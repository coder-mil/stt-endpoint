# STT Endpoint

Microsserviço **HTTP STT** (speech-to-text) FastAPI baseado em
[`faster-whisper`](https://github.com/SYSTRAN/faster-whisper). Projetado
para ser deployado isoladamente e consumido pelo
[`whatsapp-engine`](https://github.com/MauricioMilano/whatsapp-engine) (ou
qualquer cliente HTTP).

## Highlights

- **Faster-Whisper** (CTranslate2) — ~4× mais rápido e 2× menos RAM que
  o Whisper original da OpenAI.
- **GPU/CPU fallback automático** — tenta CUDA, recai em CPU+int8 uma vez
  se a GPU estiver indisponível.
- **Fila em processo com semáforo** — limita transcrições simultâneas
  (whisper é RAM-pesado, recomendado `STT_MAX_CONCURRENT=1`).
- **Auth via `X-API-Key`** — simples e stateless.
- **Logging JSON estruturado** — adequado para Loki/CloudWatch/Datadog.
- **Endpoints `health`/`ready`** — probes prontos pra Kubernetes ou
  Docker Compose.

## Visão geral

```
┌───────────────────┐   POST /v1/transcribe  ┌────────────────────┐
│  whatsapp-engine  │ ─────────────────────► │   stt-endpoint     │
│  (ou qualquer     │  multipart, X-API-Key  │   (este serviço)   │
│   cliente HTTP)   │ ◄───────────────────── │   faster-whisper   │
└───────────────────┘   { text, language }   └────────────────────┘
```

## Comparação de modelos Whisper

| Modelo     | Tamanho | RAM (CPU) | Velocidade (CPU 1×) | Precisão |
|------------|--------:|----------:|--------------------:|----------|
| `tiny`     |  ~75 MB |    ~390 MB|           ~10× real |    ★★☆     |
| `base`     | ~142 MB |    ~500 MB|           ~7× real  |    ★★★     |
| `small`    | ~466 MB |    ~1 GB  |           ~3× real  |    ★★★★   |
| `medium`   |  ~1.5 GB|    ~3 GB  |           ~1× real  |    ★★★★☆  |
| `large-v3` |  ~3 GB  |    ~5 GB  |         ~0.3× real  |    ★★★★★  |

*Velocidade expressa em "X vezes mais rápido que o áudio" — 5× = processa
5 segundos de áudio em 1 segundo.*

Recomendação inicial: **`base`** em GPU ou **`tiny`** em CPU para conversas
curtas. Promova para `medium` quando precisar de nomes próprios ou sotaques
fortes.

## Endpoints

| Método | Caminho                | Auth | Descrição |
|--------|------------------------|------|-----------|
| GET    | `/health`              | —    | Liveness probe. |
| GET    | `/ready`               | —    | Readiness + estado do modelo + estatísticas da fila. |
| POST   | `/v1/transcribe`       | sim  | Recebe multipart `audio=@file` (e opcional `language=pt`). Retorna `{id,status,result:{text,language,duration,model}}`. |
| GET    | `/v1/jobs/{job_id}`    | sim  | Status de um job criado (útil pra clientes assíncronos). |

### Exemplo — cURL

```bash
curl -X POST http://localhost:8000/v1/transcribe \
  -H "X-API-Key: $STT_API_KEY" \
  -F "audio=@recording.webm" \
  -F "language=pt"
```

### Exemplo — resposta

```json
{
  "id": "8b2f...",
  "status": "done",
  "result": {
    "text": "Olá, gostaria de agendar um corte para amanhã.",
    "language": "pt",
    "duration": 3.42,
    "model": "base"
  },
  "created_at": 1719688800.123,
  "started_at": 1719688800.456,
  "finished_at": 1719688804.901
}
```

## Como rodar

### Local (dev)

```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

cp .env.example .env
# edite .env — pelo menos STT_API_KEY

uvicorn app.main:app --reload --port 8000
```

### Docker (recomendado p/ deploy)

```bash
cp .env.example .env
# edite STT_API_KEY para algo forte
docker compose up --build
```

Para GPU, use um Dockerfile com base CUDA
(veja `docker-compose.yml` — perfil `cuda`):

```bash
docker compose --profile cuda up --build
```

## Variáveis de ambiente

Todas têm prefixo `STT_`. Veja [`.env.example`](.env.example) para a lista
completa. Principais:

| Variável                | Padrão       | Significado |
|-------------------------|--------------|-------------|
| `STT_API_KEY`           | (obrigatório)| Segredo enviado no header `X-API-Key`. |
| `STT_MODEL_SIZE`        | `base`       | `tiny`/`base`/`small`/`medium`/`large-v3`. |
| `STT_DEVICE`            | `cuda`       | `cuda` ou `cpu`. Cai pra CPU automaticamente em falha. |
| `STT_COMPUTE_TYPE`      | `float16`    | `float16` (GPU), `int8` (CPU). |
| `STT_LANGUAGE`          | `pt`         | Força o idioma (`pt`, `en`...). Vazio = auto-detect. |
| `STT_MAX_CONCURRENT`    | `1`          | Limite de transcrições simultâneas. |
| `STT_MAX_FILE_SIZE_MB`  | `25`         | Upload máximo aceito. |
| `STT_TIMEOUT_SECONDS`   | `120`        | Timeout duro por job. |
| `STT_MODELS_DIR`        | `./models`   | Onde faster-whisper guarda o modelo baixado. |
| `STT_LOG_LEVEL`         | `INFO`       | `DEBUG`/`INFO`/`WARNING`/`ERROR`. |

## Testes

```bash
pytest -q
```

Os testes usam um `Transcriber` mockado — **whisper não é baixado nem
executado** durante `pytest`. CI-friendly.

## Limitações conhecidas

- **Sem persistência de jobs** — a fila é in-process; reinício zera tudo.
- **Sem TTS** — só transcreve. Para TTS, veja o
  [`voice-chat`](https://github.com/MauricioMilano/voice-chat).
- **Whisper `tiny`/`base` erram nomes próprios** — para esse caso use
  `medium` ou `large-v3`.
- **Custo de CPU sem GPU** — `large-v3` em CPU é inviável (10× tempo real).
  Fique em `tiny`/`base` se for CPU-only.

## Licença

MIT — veja [LICENSE](LICENSE).
