# صحت ساتھی — Sehat Saathi

**An Urdu-first medical assistant for the 40% of Pakistani adults who cannot read the prescription they are handed.**

Photograph a handwritten prescription → hear it explained in spoken Urdu → get medicine alarms that ring with a **photo of the actual box** and an **Urdu voice announcement**. Powered end-to-end by **Qwen 3.7 Plus + Qwen 3.7 Max**.

> Built for the **Qwen AI Buildathon 2026**.

- **Live demo:** _link goes here after Vercel deploy_
- **Demo video:** _link goes here_

---

## The problem

Pakistan's adult literacy rate is roughly 60%. Tens of millions of adults are handed a handwritten prescription they physically cannot read, and are expected to take the right pill, at the right time, for the right number of days. They rely on memory of what the doctor said. They stop antibiotics early. They take Panadol *and* a combination drug that also contains paracetamol. The pharmacy hands them a different box and they have no way to check.

Every existing medicine-reminder app assumes you can **read**, **type**, and **understand English**. All three assumptions fail for our user: a 45-year-old woman in Faisalabad with hypertension and diabetes, who owns an Android phone and uses WhatsApp voice notes because she cannot type.

**Design rule: if any part of the product requires reading or typing, we have failed.** Everything works through camera, microphone, pictures, and voice.

## What it does

A responsive web app (installable PWA — no app store). The home screen has exactly two big buttons:

| ⏰ الارم — Alarms | 💬 بات کریں — Chat |
|---|---|
| Medicine reminders that ring full-screen with a **photo of the medicine box** and an **Urdu voice announcement** | Photograph a prescription / medicine box, or speak a question in Urdu → answer in simple **spoken** Urdu |

The killer flow that connects them:

**📸 Photograph prescription → Qwen extracts every medicine + schedule as strict JSON → safety check → all alarms auto-created → user confirms by voice.**

### Feature list

- **Prescription → structured JSON** — Qwen 3.7 Plus reads handwritten Urdu (Nastaliq) directions and mixed Latin notation (`1 BD`, `TDS`, `HS`, `1-0-1`, Eastern Arabic numerals ۱۲۳) against a closed vocabulary, returning strict JSON.
- **Self-consistency voting** — the same image is extracted 3× at low temperature and majority-voted per field; disagreement automatically marks a field low-confidence.
- **Medical grounding & safety pass** — Qwen 3.7 Max checks the extracted schedule against typical dosing for each drug, and scans the full medicine list for **duplicate active ingredients** (Panadol + a paracetamol combination) and dangerous interactions.
- **Auto-created alarms** — extracted schedules become alarms after a spoken read-back and confirmation. Every alarm shows the photo of the actual box; the ring screen speaks the dose in Urdu.
- **"Is this the right medicine?"** — point the camera at the box from the pharmacy; Plus compares it to the prescription list and reads the expiry date, warning if expired.
- **Voice in / voice out** — Web Speech API (`ur-PK`) speech-to-text and text-to-speech; every screen has a speaker button. Nobody has to type.
- **Urdu-first UI** — RTL layout, Noto Nastaliq Urdu, time-of-day icons instead of clock text, ≥64px touch targets, English toggle.
- **Safety layer** — persistent "this is not a doctor" disclaimer, red-flag escalation to hospital / **Rescue 1122**, and a hard rule to never guess an unreadable dose — the app asks the patient instead.
- **Judge Mode panel** — a drawer showing the live pipeline trace (which model ran, what it did, how long it took) and the raw extraction JSON.

## Architecture — how both Qwen models are used

Each model does only what it is best at. **Plus is the eyes; Max is the pharmacist.**

```
┌──────────────────────────────────────────────────────┐
│  BROWSER (Next.js PWA)                               │
│                                                      │
│  Home ──┬── Alarms → localStorage + IndexedDB photos │
│         └── Chat                                     │
│                                                      │
│  Web Speech STT (ur-PK) ──┐                          │
│  Camera / gallery ────────┤                          │
│  pdf.js → canvas → PNG ───┤  (I/O adapters only —    │
│  canvas preprocessing ────┤   zero intelligence)     │
│                           ▼                          │
│                 /api/chat /api/extract               │
│                 /api/safety /api/verify              │
│  Web Speech TTS (ur-PK) ◄─┘                          │
│  Service worker → alarm notifications                │
└──────────────────┬───────────────────────────────────┘
                   │  API key server-side only
                   ▼
┌──────────────────────────────────────────────────────┐
│  QWEN 3.7 PLUS  (vision + chat)                      │
│   · prescription OCR → strict JSON, 3× voted         │
│   · medicine-box verify + expiry reading             │
│   · all conversational answers in simple Urdu        │
│         │                                            │
│         ▼  structured JSON handoff                   │
│  QWEN 3.7 MAX  (text-only medical reasoning)         │
│   · cross-field grounding: does this drug ever get   │
│     dosed like this? (constrains smudged OCR)        │
│   · duplicate-ingredient & interaction warnings      │
└──────────────────────────────────────────────────────┘
```

The Plus → Max **cross-field grounding** step is the part a dedicated OCR engine physically cannot do: if Plus reads *Augmentin 625* but the Urdu direction is smudged, Max knows Augmentin 625 is dosed twice or thrice daily and essentially never once-at-night — the drug's identity constrains the plausible direction space. Voice and PDF handling stay in the browser (Web Speech API, pdf.js) because neither model takes audio; the models only ever see text and pixels.

## Judging criteria mapping

| Criterion | Pts | How we hit it |
|---|---|---|
| **Effective use of Qwen** | 25 | Both models, each at what it's best at: Plus = vision/extraction/chat, Max = medical safety reasoning. Structured JSON, self-consistency voting, cross-field grounding, refusal under uncertainty. The model handoff and raw JSON are shown live in **Judge Mode**. |
| **Innovation & creativity** | 20 | Prescription → auto-populated alarms. Medicine identified by **photo, not name**. Voice-confirmation loop as an OCR safety net. |
| **Technical implementation** | 20 | Measured per-field accuracy on a real-prescription eval set (`eval/`). Self-consistency voting. Client-side image preprocessing. Clean PWA + service worker. |
| **Real-world impact** | 15 | ~40% of Pakistani adults; a concrete, documented, locally grounded problem (Rescue 1122, Urdu enums, local brand names). |
| **UX & product quality** | 10 | Zero-reading, zero-typing interface. Urdu-first, RTL, Nastaliq, giant touch targets. |
| **Demo & presentation** | 10 | Live extraction of a real prescription, live Plus→Max handoff, "test alarm in 10 seconds" button. |

## Setup

Requires Node 18+.

```bash
npm install
cp .env.example .env.local     # then paste your real key
npm run dev                    # http://localhost:3000
npm run build                  # production build
```

### Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DASHSCOPE_API_KEY` | **yes** | — | Alibaba Cloud Model Studio key. Server-side only — never `NEXT_PUBLIC_`. |
| `DASHSCOPE_BASE_URL` | no | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` | OpenAI-compatible endpoint |
| `QWEN_VISION_MODEL` | no | `qwen3.7-plus` | Vision + chat model |
| `QWEN_REASONING_MODEL` | no | `qwen3.7-max` | Text-only safety/grounding model |
| `EVAL_URL` | no | `http://localhost:3000/api/extract` | Target for the eval harness |

The API key never touches the client — every model call goes through a Next.js API route.

## Eval harness

We measure extraction accuracy on real hand-labeled Pakistani prescriptions instead of guessing:

```bash
# put photos in eval/images/, labels in eval/labels.json (see eval/labels.example.json)
npm run dev        # terminal 1
npm run eval       # terminal 2 — per-image + aggregate per-field accuracy table
```

Full instructions: [`eval/README.md`](eval/README.md).

## Deploy

One-command deploy to **Vercel** (HTTPS is required for the microphone and service worker):

```bash
npx vercel
```

Set `DASHSCOPE_API_KEY` (and any overrides) in the Vercel project's environment variables. Alarms are client-side (Tier 1: foreground timer + full-screen ring; Tier 2: service-worker notification). Server-side Web Push is the named production roadmap — there is no reliable purely-client scheduled-notification API on the web, and we say so honestly.

## Team

| Name | Role |
|---|---|
| _add name_ | _add role_ |
| _add name_ | _add role_ |
| _add name_ | _add role_ |

## Safety disclaimer

**Sehat Saathi is not a doctor and does not provide medical advice.** یہ ایپ ڈاکٹر نہیں ہے۔ It only reads back what a doctor wrote, never diagnoses, never prescribes, and never guesses an unreadable dose — it asks the patient instead. On red-flag symptoms (chest pain, difficulty breathing, heavy bleeding, unconsciousness) it stops interpreting and tells the user to go to a hospital or call **Rescue 1122**. Always consult a qualified medical professional.
