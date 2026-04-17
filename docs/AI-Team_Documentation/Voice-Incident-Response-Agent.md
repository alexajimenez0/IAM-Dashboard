# Voice Incident Response Agent — Planning Document

## Overview

A voice-driven incident response agent that allows security engineers to interact with the IAM Dashboard hands-free during active incidents. The shipped UI (`VoiceIRAgent.tsx`) uses the browser **Web Speech API** for speech-to-text with **`continuous: false`** — **push-to-talk** via the **mic button** (click to start listening, click again to stop while listening), plus **quick-command** buttons and **typed** input. There is **no** “Hey Argus” wake phrase or passive listening mode in the current code. Live findings come from the dashboard context; **Claude via Amazon Bedrock** is used for LLM triage from the dashboard and (for voice) enrichment on select intents; **Amazon Polly** is wired for Argus TTS when not in mock mode (see Phase 4).

This extends the existing AI remediation engine (AI-3) with a real-time voice interface. A future optional wake phrase (transcript-based or a SDK such as Porcupine) is **not** shipped today.

---

## Use Case

**Scenario:** A critical IAM finding fires at 2am. The on-call engineer opens the Argus panel, presses the **mic** (or uses a quick command), and says:

> "Give me a summary of critical findings"

Argus responds verbally (Polly when configured, else browser TTS) and can show an LLM triage card for select intents — minimal clicking.

---

## Voice capture (shipped)

**Shipped behavior:** `continuous: false` — **one utterance per mic activation** (push-to-talk). **Quick-command** buttons send text intents directly; **text input** uses the same `processCommand` / intent router as STT.

**Not shipped:** There is **no** “Hey Argus” toggle, **no** `continuous: true` passive listening, and **no** wake-phrase stripping in `VoiceIRAgent.tsx` (those were removed; see file header comment in source).

```text
Panel open → user presses mic (or types / taps quick command)
        │
        ▼
Web Speech API final transcript (or text)
        │
        ▼
processCommand → intent match → buildResponse → Polly (preferred) / browser TTS
```

**Why Web Speech API:**
- Built into Chrome and Edge — no install, no cost for STT in the browser path
- Runs in the browser; no AWS Transcribe usage until/unless you swap in Phase 4
- Sufficient for a controlled dashboard environment; false triggers possible on similar-sounding phrases
- Can be upgraded to Porcupine (Picovoice) or server-side verification later if needed

---

## Architecture Flow

> **Shipped path** — STT is entirely in-browser (Web Speech API). Amazon Transcribe is **not** active in the current implementation; it remains a future optional upgrade (see Phase 4).

```text
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                         │
│                                                                 │
│   Web Speech API — push-to-talk (`continuous: false`)           │
│        │                                                        │
│        ▼                                                        │
│   Final transcript produced in-browser (no backend STT call)   │
│        │                                                        │
│        ▼                                                        │
│   processCommand → useVoiceIntent                               │
│   ├── Tier 1: regex matchIntent() — synchronous, zero network   │
│   └── Tier 2: POST /api/v1/voice/intent (Bedrock fallback)      │
│        │           only when regex returns "unknown"            │
│        ▼                                                        │
│   buildResponse() → response card rendered in panel            │
│        │                                                        │
│        ▼                                                        │
│   pollySpeak() → POST /api/v1/tts/synthesize                    │
│        │           falls back to SpeechSynthesisUtterance       │
│        ▼                                                        │
│   For briefing/critical/threat: fetchLLMBriefing()             │
│        └── POST /api/v1/llm/triage → LLMTriageCard in panel    │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     BACKEND (Python/Flask)                      │
│                                                                 │
│   POST /api/v1/voice/intent                                     │
│        └── Amazon Bedrock (Claude) — intent classification      │
│                                                                 │
│   POST /api/v1/tts/synthesize                                   │
│        └── Amazon Polly Neural ──► audio/mpeg                   │
│                                                                 │
│   POST /api/v1/llm/triage                                       │
│        └── Amazon Bedrock (Claude) ──► triage summary           │
└─────────────────────────────────────────────────────────────────┘
```

---

## AWS Services Required

| Service | Role | Status |
|---|---|---|
| Web Speech API (browser) | STT for push-to-talk utterances — free, no AWS | **Active** |
| Amazon Polly Neural | Text-to-speech — `POST /api/v1/tts/synthesize`; falls back to browser TTS | **Active** |
| Amazon Bedrock (Claude) | Intent classification fallback (`/api/v1/voice/intent`) and LLM triage (`/api/v1/llm/triage`) | **Active** |
| Existing backend | Findings data source — already running | **Active** |
| Amazon Transcribe | Optional server-side STT upgrade (not shipped) | Future / Phase 4 optional |

---

## Full Cost Breakdown

### Web Speech API (browser STT)

**Free** for the browser STT path. No AWS usage until you add Transcribe or other backend voice endpoints.

---

### Amazon Transcribe (Speech-to-Text)

| Tier | Price |
|---|---|
| Standard streaming/batch | $0.024 / minute |
| Free tier (first 12 months) | 60 minutes / month free |

Each voice command is typically a few seconds of audio (push-to-talk).

- 100 queries/month ≈ **$0.04**
- 1000 queries/month ≈ **$0.40**

---

### Amazon Polly (Text-to-Speech)

| Voice Type | Price | Free Tier (12 months) |
|---|---|---|
| Standard voices | $4.00 / 1M characters | 5M characters/month |
| Neural voices (more natural) | $16.00 / 1M characters | 1M characters/month |

Each Argus response is ~500-800 characters.

- 100 responses/month ≈ **$0.003** (Standard) / **$0.013** (Neural)
- 1000 responses/month ≈ **$0.03** (Standard) / **$0.13** (Neural)

**Recommendation:** Use Neural voices — the cost difference is negligible and the quality is significantly better for a security tool.

---

### Amazon Bedrock — Claude

| Model | Input | Output | Use |
|---|---|---|---|
| Claude 3 Haiku | $0.25 / 1M tokens | $1.25 / 1M tokens | Local dev / testing |
| Claude 3.5 Sonnet | $3.00 / 1M tokens | $15.00 / 1M tokens | Production |

Each voice query sends ~1500 tokens total (findings context + prompt + response).

- 100 queries/month ≈ **$0.04** (Haiku) / **$0.40** (Sonnet)
- 1000 queries/month ≈ **$0.40** (Haiku) / **$4.00** (Sonnet)

**Strategy:** Use Haiku for local Docker testing, swap to Sonnet for production via a single env var change.

---

### Total Estimated Monthly Cost

| Volume | Transcribe | Polly (Neural) | Claude Haiku | Claude Sonnet | Total (Haiku) | Total (Sonnet) |
|---|---|---|---|---|---|---|
| 100 queries | $0.04 | $0.013 | $0.04 | $0.40 | **~$0.09** | **~$0.45** |
| 1000 queries | $0.40 | $0.13 | $0.40 | $4.00 | **~$0.93** | **~$4.53** |

For a dev/demo environment this is essentially free. Free tiers on Transcribe and Polly cover the first 12 months of light usage entirely.

> Note: Amazon Lex is not needed for the current MVP. Web Speech API handles capture in-browser; intent routing uses **`useVoiceIntent`** — regex fast-path first, optional **Bedrock** fallback for `unknown` (see `src/hooks/useVoiceIntent.ts`). Lex would only be needed for complex multi-turn slot-filling flows.

---

## Local Docker Infrastructure

### New service: `voice-agent`

Add to `docker-compose.yml`:

```yaml
voice-agent:
  build:
    context: .
    dockerfile: Dockerfile.voice
  ports:
    - "5001:5001"
  environment:
    - AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
    - AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
    - AWS_DEFAULT_REGION=${AWS_DEFAULT_REGION}
    - BEDROCK_MODEL_ID=${BEDROCK_MODEL_ID}
  depends_on:
    - backend
  volumes:
    - ./backend:/app
```

### New env vars needed in `.env`

```
# Use Haiku for local dev, Sonnet for production
BEDROCK_MODEL_ID=anthropic.claude-3-haiku-20240307-v1:0
# BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0

# AWS keys already exist in .env for existing services
```

### New file: `Dockerfile.voice`

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    boto3 flask flask-cors
COPY backend/ .
EXPOSE 5001
CMD ["python", "voice_agent.py"]
```

---

## Backend Endpoints (shipped)

| Endpoint | Method | Description |
|---|---|---|
| `/api/v1/tts/synthesize` | POST | Accepts `{text, voice, engine}`, returns `audio/mpeg` (Polly Neural) or `{error, fallback:true}` 503 |
| `/api/v1/voice/intent` | POST | Bedrock intent classification fallback — called only when client regex returns `"unknown"` |
| `/api/v1/llm/triage` | POST | LLM triage summary for a finding (used by `fetchLLMBriefing` on briefing/critical/threat intents) |

> **Not shipped:** `/api/voice/transcribe` (Transcribe-based STT), `/api/voice/respond`, and `/api/voice/synthesize` are planning artifacts from an earlier design. The active TTS route is `/api/v1/tts/synthesize`.

---

## New Frontend Components

| Component | Description |
|---|---|
| `VoiceIRAgent.tsx` | Main UI — ARGUS pill, live panel, push-to-talk mic, quick commands, text input, audit log |

### Command pipeline (`VoiceIRAgent.tsx` + `useVoiceIntent`)

STT finals, quick-command clicks, and text submit all call **`processCommand`**, which awaits **`resolveIntent`** from **`useVoiceIntent`** (regex first, then optional Bedrock for ambiguous utterances). The agent card uses **`buildResponse`**, but TTS may use Bedrock’s **`spoken_reply`** when returned. **`fetchLLMBriefing`** still adds the separate **LLM triage** card for `briefing` / `critical` / `threat`. There is no wake-phrase buffer.

---

## Intent Examples

| Voice / text input (examples) | Routed intent (examples) | Action |
|---|---|---|
| "Give me a briefing" / SITREP quick command | `briefing` | SITREP card + optional LLM triage for top finding |
| "Show critical findings" / CRITICAL quick command | `critical` | Critical list + optional LLM triage |
| "What's the threat level?" | `threat` | Threat assessment + optional LLM triage |
| "Run a scan" / SCAN quick command | `scan` | Scan intent (pattern in `matchIntent`) |

*(Regex patterns live in `matchIntent` inside `src/hooks/useVoiceIntent.ts`; Bedrock may override when regex returns `unknown`.)*

---

## Guardrails

The voice agent reuses the existing **AI-3 guardrails pipeline** (see `Guardrails & Safety Rules.md`):

- All Claude responses go through schema validation
- `requires_review: true` always — Argus never auto-remediates
- Voice responses are read-only summaries and recommendations
- No AWS API calls are triggered by voice commands in MVP

---

## MVP Scope

- [x] Push-to-talk voice path — Web Speech API (`continuous: false` in `VoiceIRAgent.tsx`); no wake phrase
- [ ] `/api/voice/transcribe` endpoint using Amazon Transcribe
- [ ] `/api/voice/respond` endpoint — intent routing + Claude (Bedrock) + Polly synthesis
- [x] `VoiceIRAgent.tsx` — listening indicators, transcript, Polly + browser TTS fallback
- [ ] Docker service wired up with env vars
- [ ] 4 core intents: summarize critical, filter by severity, scan stats, recommend fix

## Out of Scope (MVP)

- Multi-turn conversation
- Auto-remediation via voice
- Voice authentication / speaker recognition
- Mobile push alerts
- Continuous listening + transcript wake phrase (“Hey Argus”) — **removed** from shipped UI; custom wake word (e.g. Porcupine) remains a possible **future** upgrade

---

## What You Need to Get Started

1. Copy **`env.example`** → **`.env`** in the project root. Add your real values; **do not commit** `.env`.
2. In **AWS → Bedrock → Model access**, turn on the same model you set in **`BEDROCK_MODEL_ID`** (e.g. Claude Haiku).
3. Use **Chrome or Edge** for Argus (voice input uses the browser’s speech API).

Details for local Docker and AWS keys are in the next section.

---

## Local setup (beginner-friendly)

When you run the stack with **Docker Compose**, the **Flask** container reads variables from your **host `.env`**. Two different AWS setups matter:

### 1. Claude (smart replies / triage / voice “unknown” fallback)

Set in **`.env`**:

- **`BEDROCK_API_KEY`** — from the AWS Bedrock console (API keys). If it ends with **`=`**, that’s normal; don’t delete it.
- **`BEDROCK_MODEL_ID`** — must match a model you enabled in Bedrock.
- **`AWS_DEFAULT_REGION`** (or **`AWS_REGION`**) — e.g. `us-east-1`, same region as Bedrock.

Used by the Python backend for **`/api/v1/llm/*`** and **`/api/v1/voice/intent`**.

### 2. Polly (AWS text-to-speech for Argus)

Polly uses your normal **IAM access keys**, **not** the Bedrock API key:

- **`AWS_ACCESS_KEY_ID`**
- **`AWS_SECRET_ACCESS_KEY`**

That user needs permission for **`polly:SynthesizeSpeech`**. If you leave the template values like `your-aws-access-key-id`, Polly won’t work — Argus will still **speak** using the **browser’s** voice instead.

### 3. Frontend (how the browser finds Flask)

Usually leave these as in **`env.example`** for Docker dev:

- **`VITE_IR_API_BASE`** — e.g. `http://localhost:3001/api/v1`
- **`VITE_FLASK_PROXY_TARGET`** — e.g. `http://app:5000`
- **`VITE_DATA_MODE`** — use **`live`** to hit the real backend; **`mock`** uses fake data and skips many calls.

### After you edit `.env`

Restart the app container so it reloads env vars, for example:

`docker compose up -d --force-recreate app`

### Quick checks

- **Logs:** `docker logs -f --tail 200 cybersecurity-dashboard` — look for **503** (often Bedrock/auth) or **405** on TTS paths.
- **Signing in with Cognito** in the UI does **not** replace these keys; Flask still uses **`.env`** for Claude and Polly.

---

## Phases vs environments (Dev, Staging, Production)

The numbered **implementation phases** in this document are **delivery milestones** (what gets built and verified), not AWS account or URL names. A phase does not automatically mean “we are in production.”

| Milestone | Typical environment | What it means |
|---|---|---|
| **Phases 1–3** | **Development** (local) | Work happens on developer machines and **Docker Compose** (`localhost`, `.env` / Bedrock API keys as in onboarding). This is **not** production. |
| **Phase 4** | **Development** first; then **Staging** | Voice + Polly + triage features are implemented and exercised **locally**; you then validate the same build against a **staging** deployment (shared AWS app account, staging API URL, staging IAM) before any prod cutover. |
| **Phase 5** | **Staging** (primary); **Production** after sign-off | Formal E2E, edge cases, guardrails, and model comparison should run against **staging**-like config and data. **“Production-ready”** here means **cleared to deploy** to **Production** — the phase is mostly **pre-production QA**, not “Phase 5 only runs in prod.” |
| **Production** (operational) | **Production** | Customer-facing or official SOC deployment: production AWS account (or equivalent), **IAM roles** (avoid long-lived personal API keys), monitoring, change control. Reached **after** Phase 5 sign-off and a normal release process — not defined by the phase number alone. |

**Short answer:** Phase 4 is still fundamentally **dev/feature work** (first proven locally). Phase 5 is **staging-centric validation** that **gates** going to **production**; neither phase *is* production by itself.

### API Gateway — staging, production, or dev?

**Implementing Argus / LLM / TTS behind Amazon API Gateway is not automatically “staging” or “production.”** API Gateway is **infrastructure**: you attach it to integrations (e.g. Lambda) and deploy **stages** — commonly named `dev`, `staging`, and `prod` (or separate API instances per AWS account). The **same pattern** can serve:

- a **development** stage (shared team URL, low guardrails),
- a **staging** stage (pre-prod validation, realistic IAM and data), and
- a **production** stage (customer or official SOC traffic).

So: **Gateway = how traffic enters AWS**; **which environment** depends on **which stage/account/URL** you point the frontend at (`VITE_IR_API_BASE` or equivalent), not on the fact that Gateway exists.

---

## Implementation Timeline

### ✅ Phase 1 — UI/UX Placement (COMPLETE)
- [x] `src/components/ir/VoiceIRAgent.tsx` built and placed
- [x] "ARGUS" header pill with threat indicator and live status
- [x] Waveform animation — active pulse when listening/speaking
- [x] Live transcript panel with user/agent message bubbles
- [x] Audit log tab — STT, TTS, intent entries with session dividers, export to `.log`
- [x] Quick command buttons — SITREP, CRITICAL, THREAT, SLA, HIGH RISK, SCAN
- [x] Text input fallback for non-mic environments
- [x] Keyboard shortcut — backtick `` ` `` to toggle panel
- [x] Web Speech API — push-to-talk only (`continuous: false`, `webkitSpeechRecognition`)
- [x] TTS: Polly Neural when live (`/api/v1/tts/synthesize`), `SpeechSynthesisUtterance` fallback (mock mode skips Polly)
- [x] Intent resolution — regex fast-path + optional Bedrock fallback (`useVoiceIntent`); named intents include briefing, critical, threat, sla, latest, show_findings, compliance, scan, help, high, isolate, revoke, disable_key, navigate
- [x] Live findings data wired via `useActiveScanResults` hook
- [x] SLA breach detection logic
- [x] Confidence score display on STT entries

**Status:** Frontend fully functional with local browser TTS and Web Speech API

---

### ✅ Phase 2 — AWS Setup (COMPLETE)
- [x] Bedrock API key generated from AWS Console → Bedrock → API keys
- [x] `BEDROCK_API_KEY` added to `.env`
- [x] `BEDROCK_MODEL_ID=anthropic.claude-3-haiku-20240307-v1:0` added to `.env`
- [x] `AWS_DEFAULT_REGION=us-east-1` confirmed in `.env`
- [x] `AmazonBedrockFullAccess`, `AmazonTranscribeFullAccess`, `AmazonPollyFullAccess` attached to IAM user
- [x] Credential strategy decided: long-term Bedrock API key in `.env` for local Docker dev, IAM role for production Lambda

**Status:** AWS credentials configured, Bedrock model accessible

---

### ✅ Phase 3 — Backend Wired to Claude (COMPLETE)
- [x] `BEDROCK_API_KEY`, `BEDROCK_MODEL_ID`, and `AWS_DEFAULT_REGION` passed into `app` container via `docker-compose.yml` (values from host `.env`; verify with `docker compose config` → `services.app.environment`)
- [x] `_get_bedrock_client()` added to `backend/api/ir.py` — uses Bedrock API key auth via `boto3`
- [x] `_invoke_claude(prompt)` helper added — returns `None` on failure (triggers mock fallback)
- [x] `/api/v1/llm/triage` — now calls Claude with finding context, returns real triage summary
- [x] `/api/v1/llm/root-cause` — now calls Claude for root cause narrative
- [x] `/api/v1/llm/runbook` — now calls Claude for markdown IR runbook with IDENTIFY/CONTAIN/ERADICATE/RECOVER phases
- [x] Live/mock toggle — `model: "anthropic.claude-3-haiku-20240307-v1:0"` in response = live, `model: "mock"` = fallback
- [x] `VITE_IR_API_BASE=http://localhost:3001/api/v1` added to `.env`
- [x] `VITE_FLASK_PROXY_TARGET=http://app:5000` added to `.env` — fixes Vite proxy forwarding to Flask in Docker
- [x] `VITE_LLM_MAX_CONCURRENT=2` added to `.env` — prevents Bedrock flooding across concurrent finding rows
- [x] Verified Flask health at `localhost:5001/api/v1/health` ✅
- [x] Verified `/api/v1/llm/triage` returns mock data when no Bedrock key present ✅

**Status:** All 3 LLM endpoints wired to Claude, live/mock fallback working

---

### Phase 4 — Upgrade Argus Voice to AWS APIs (In progress)

*Environment: **Development** (local / Docker) for implementation; promote the same artifacts to **Staging** for integration testing. Not production until released as such.*

- [x] **Amazon Polly Neural TTS** — `VoiceIRAgent` calls `pollySpeak()` first (`src/services/ttsService.ts` → `POST /api/v1/tts/synthesize`, `engine: neural`); falls back to `SpeechSynthesisUtterance` if Polly fails or `VITE_DATA_MODE=mock`
- [x] **Triage API from voice** — Intents `briefing`, `critical`, and `threat` trigger `fetchLLMBriefing()` → `/api/v1/llm/triage`; Claude result shown as `LLMTriageCard` in the live panel (`VoiceIRAgent.tsx`)
- [ ] **Extend triage hook** — Wire `high` and `latest` to the same triage enrichment (or document as out of scope if only SITREP-style intents need LLM)
- [ ] **Speak Claude’s triage text** — Today the user hears `buildResponse().spokenText` immediately; the LLM summary is **display-only** until `speak()` is invoked with a trimmed `triage_summary` after the async triage response (optional short lead-in, pause-during-TTS if needed)
- [ ] **Optional:** Replace `webkitSpeechRecognition` with Amazon Transcribe via a backend audio endpoint (not required for Phase 4 closure)
- [ ] **Optional / team-scale — API Gateway:** Front LLM and/or TTS routes (e.g. `/llm/*`, `/tts/synthesize`, and any future voice-intent endpoint) with **Amazon API Gateway** (+ Lambda or HTTP integration to your app). Use **IAM execution roles** (and/or Cognito/API keys) so Bedrock/Polly credentials live in AWS instead of every developer’s `.env`. Create **per-environment stages** (e.g. dev / staging / prod) or separate accounts — Gateway itself is neither staging nor production until you map it to a stage and URL.
- [ ] **End-to-end QA** — Script and run: push-to-talk (or text / quick command) → `briefing` / `critical` / `threat` → triage card + Polly (and, once implemented, spoken Claude summary)

**Deliverable (target):** Argus voice path uses AWS Polly; intelligence intents surface Claude triage in-UI; **full** “voice reads Claude” needs the pending `speak(triage_summary)` step above. `buildResponse()` remains the source of the **first** spoken line and all non-triage intents until further product changes. **API Gateway** (if adopted) is tracked here as **AWS integration work**; proving it in **staging** is Phase 5.

---

### Phase 5 — Testing & Polish (Final)

*Environment: **Staging** for primary QA (realistic AWS, data, and auth); **Production** is the deployment target after this phase passes — run only controlled smoke checks in prod post-release.*

- [ ] Test "Generate AI overview" in `FindingDetailPanel` with real findings
- [ ] Test all regex-defined Argus intents (+ Bedrock `unknown` fallback) end-to-end
- [ ] Test edge cases — no findings, bad audio, Bedrock timeout
- [ ] Verify AI-3 guardrails fire on Claude responses
- [ ] Swap `BEDROCK_MODEL_ID` to Claude 3.5 Sonnet for production quality comparison
- [ ] Cross-browser test (Chrome required for Web Speech API)
- [ ] Rebuild frontend with `docker-compose build --no-cache frontend` after all env changes
- [ ] If **API Gateway** was added in Phase 4: run full Argus + `FindingDetailPanel` LLM E2E against the **staging** stage (auth, throttling, and Bedrock/Polly via Lambda IAM); only then promote the same pattern to the **production** stage as part of release.

**Deliverable:** Argus production-ready

---

### Summary Timeline

| Phase | Status | Typical env | Focus | Owner |
|---|---|---|---|---|
| Phase 1 — UI/UX | ✅ Complete | Dev | VoiceIRAgent.tsx, Web Speech API, TTS path | Frontend |
| Phase 2 — AWS Setup | ✅ Complete | Dev | Bedrock API key, IAM permissions, env vars | DevOps/Security |
| Phase 3 — Backend | ✅ Complete | Dev | Claude wired to /llm/triage, /llm/root-cause, /llm/runbook | Backend |
| Phase 4 — AWS Voice Upgrade | 🟡 In progress | Dev → Staging | Polly + triage cards; optional API Gateway; voice+LLM polish | Frontend + Backend |
| Phase 5 — Testing | 🔲 Next | Staging → Prod sign-off | E2E, guardrails, edge cases, production model comparison | AI team + QA |

---

## Team Ownership

| Area | Owner |
|---|---|
| Voice backend endpoints | Backend team |
| Claude (Bedrock) integration + guardrails | AI team |
| Frontend voice UI (`VoiceIRAgent.tsx`) | Frontend team |
| AWS Transcribe/Polly/Bedrock IAM permissions | DevOps/Security team |
