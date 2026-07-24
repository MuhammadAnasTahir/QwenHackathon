# صحت ساتھی — Sehat Saathi
### An Urdu-first medical assistant for Pakistanis who can't read

> **Working name.** Alternatives: *Dawai Dost* (دوائی دوست, "medicine friend"), *Dawa Sathi*. Pick on day 1 — the name goes on the demo slide.

**Qwen AI Buildathon 2026 — Project Plan**
Last updated: 24 July 2026

---

## 1. One-liner

> A web app that lets a person who cannot read **photograph their prescription**, hear it explained **in spoken Urdu**, and get **medicine alarms that show a picture of the actual box** — powered end-to-end by Qwen 3.7.

---

## 2. The problem we're solving

Pakistan's adult literacy rate is roughly 60%. That means **tens of millions of adults are handed a handwritten prescription they physically cannot read**, and are expected to take the right pill, at the right time, for the right number of days.

What actually happens:
- Patients rely on memory of what the doctor said, and forget.
- They stop antibiotics early because nobody told them to finish the course.
- They take Panadol *and* a combination drug that also contains paracetamol → accidental overdose.
- The pharmacy hands them a different box than prescribed and they have no way to check.

Every existing medicine-reminder app assumes you can **read**, **type**, and **understand English medical terms**. All three assumptions fail for our user.

**Our user:** a 45-year-old woman in Faisalabad with hypertension and diabetes. She owns an Android phone. She uses WhatsApp voice notes because she cannot type. She cannot read her prescription. Her son sets things up for her when he visits.

**Design consequence:** if any part of our product requires reading or typing, we have failed. Everything must work through **camera, microphone, pictures, and voice.**

---

## 3. What we're building

A **responsive web application** (works on desktop and mobile, installable as a PWA — not an app-store app).

On open, the home screen has exactly **two big buttons**:

| ⏰ **الارم** — Set Alarms | 💬 **بات کریں** — Chat |
|---|---|
| Medicine reminders that ring with a **photo of the medicine** and an **Urdu voice announcement** | Upload a prescription photo / medicine box / speak a question → get an answer in simple spoken Urdu |

The two connect through the killer flow:

**📸 Photograph prescription → Qwen extracts every medicine + schedule → all alarms auto-created → user confirms by voice.**

That single flow is the product, the demo, and the pitch.

---

## 4. Judging criteria — and how we hit each one

From the official brief (100 pts total):

| Criterion | Pts | Our play |
|---|---|---|
| **Effective Use of Qwen** | **25** | Both models, each doing what it's best at. Plus = vision/extraction. Max = medical safety reasoning. Structured JSON extraction, cross-field grounding, literacy adaptation, refusal under uncertainty. **We show the JSON and the model handoff live on screen.** |
| **Innovation & Creativity** | 20 | Prescription → auto-populated alarms. Medicine identified by **photo, not name**. Voice-confirmation loop as an OCR safety net. |
| **Technical Implementation** | 20 | Measured accuracy on a 20-image real-prescription eval set. Self-consistency voting. Two-pass crop-and-zoom OCR. Clean PWA + service worker. |
| **Real-world Impact** | 15 | 40% of adult Pakistanis. Concrete, documented, locally-grounded problem. |
| **UX & Product Quality** | 10 | Zero-reading, zero-typing interface. Urdu-first with RTL. |
| **Demo & Presentation** | 10 | Rehearsed twice on the real phone. Live extraction on a real prescription. |

**Official idea themes include "Voice AI" and "Web Apps" — we are squarely on-theme.**

**Submission checklist:** GitHub repo · project description · team members · demo/deployment link.

**Schedule on the day:** Building Session 1 `10:00–12:30` · Lunch `12:30–1:15` · Building Session 2 `1:15–4:00` · **Submission & demos `4:00`** · Awards `5:00`.

> ⚠️ Organisers confirmed we may build from home beforehand. **The night before is where the real work happens.** Day-of is integration, polish, and demo prep.

---

## 5. Model capabilities — READ THIS BEFORE YOU BUILD

We are restricted to **two models**. Here is exactly what they can and cannot do:

| | **Qwen 3.7 Plus** | **Qwen 3.7 Max** |
|---|---|---|
| Text in / out | ✅ | ✅ |
| **Image** in | ✅ JPG/PNG/GIF/WEBP | ❌ |
| **Video** in | ✅ | ❌ |
| **Audio** in | ❌ | ❌ |
| **Audio** out | ❌ | ❌ |
| **PDF** in | ⚠️ Not reliable — treat as **no** | ❌ |
| Context | 1M tokens | 1M tokens |
| Price / 1M tokens | ~$0.40 in / $1.60 out | ~$2.50 in / $7.50 out |
| Role in our app | **Everything visual + all chat** | **Text-only safety reasoning pass** |

APIs are **OpenAI-compatible** — use the OpenAI SDK pointed at the Model Studio base URL.

### The two gaps and how we close them

**🎤 Neither model hears or speaks.** Voice is handled in the browser:

```
mic → Web Speech API (ur-PK) → Urdu text → QWEN → Urdu text → speechSynthesis (ur-PK) → speaker
```

The models only ever see **text**. This is fully compliant with the two-model rule.

**📄 Neither model reliably reads PDFs.** We use **pdf.js** to render PDF pages to PNG in the browser, then send the images to Plus. This is better anyway — Pakistani prescription PDFs are almost always scans, so text extraction would return nothing.

### ❗ "Does using Web Speech API / pdf.js hurt our Qwen score?"

**No.** These are **I/O adapters with zero intelligence** — the same category as a camera driver or a file picker. Web Speech turns air pressure into a string; **Qwen understands the string.** pdf.js turns a PDF into pixels; **Qwen reads the pixels.** No one says a native app "doesn't use AI" because it used the OS camera API.

The real risk to our 25 points is being a thin *photo-in → text-out* wrapper. We avoid that by making Qwen do things **only an LLM can do** — see §7.

---

## 6. Feature list

### 🔴 P0 — Must ship. Without these there is no product.

| # | Feature | Notes |
|---|---|---|
| 1 | **Two-button home screen** | Alarms · Chat. Urdu labels + icons. |
| 2 | **Chat: photo input** | Camera or gallery. Prescription, medicine box, bottle. |
| 3 | **Chat: voice input** | Web Speech `ur-PK` / `en-PK`. Big mic button. |
| 4 | **Chat: voice output** | Every reply is spoken aloud in Urdu, not just written. |
| 5 | **Prescription → structured JSON** | Qwen Plus + strict schema. **The core of the product.** |
| 6 | **JSON → auto-created alarms** | User confirms by voice. **The killer demo.** |
| 7 | **Alarm ring screen** | Full-screen. **Photo of the medicine** + Urdu voice + loud sound. |
| 8 | **"Test alarm in 10 seconds" button** | You cannot demo a reminder by waiting until 8 PM. Build this **first**. |
| 9 | **Urdu / English toggle** | RTL layout, Noto Nastaliq font. |
| 10 | **Safety layer** | Disclaimer, red-flag escalation, Rescue 1122, never guess a dose. |

### 🟡 P1 — Build tonight if the night goes well. Big scoring value.

| # | Feature | Why it matters |
|---|---|---|
| 11 | **Duplicate-ingredient / interaction check (Qwen Max)** | Patients see 3 doctors and double-dose paracetamol. This is the **Max showcase** — real medical reasoning over the full medicine list. |
| 12 | **"Is this the right medicine?" camera check** | Point at the box you got from the pharmacy → ✅/❌ against your prescription. Guards against substitution errors. 20-second demo that lands instantly. |
| 13 | **Expiry-date reading** | OCR the expiry off the box, warn if expired. Cheap, honest, locally relevant. |
| 14 | **Medicine photo capture at setup** | User snaps the box once. That photo becomes the alarm's face. **Highest-value 5 minutes of design work in the project.** |

### 🟢 P2 — Only if there's time left. Stop when the night runs out.

| # | Feature | Notes |
|---|---|---|
| 15 | **Caregiver / family profiles** | One literate son sets up alarms for his mother. Matches how Pakistani households actually work. Mostly UI, no AI. |
| 16 | **Adherence log** | Tap taken/missed → one-page "show this to your doctor" summary. |
| 17 | **Generic name + salt awareness** | "Panadol = paracetamol." Helps people buy cheaper equivalents. ⚠️ Information only — never advise switching. |
| 18 | **PDF upload** | pdf.js, **page 1 only**. Low real-world usage — most people photograph. Cheap version = 15 min. |
| 19 | **Offline mode** | Alarms + saved medicine cards work with no internet. Mobile data is a real cost for our users. |

### ❌ Explicitly out of scope

Accounts/auth · backend database · video input · counterfeit-medicine detection (**we cannot verify this from a photo — do not claim it**) · anything requiring an app store.

---

## 7. The Urdu OCR strategy ⭐ *the hardest and most important part*

### The problem

Doctors write **drug names in English** (Latin script) but **directions in Urdu** — `کھانے کے بعد`, `دن میں تین بار`, `صبح شام` — precisely because the patient can't read English. And **handwritten Nastaliq is the worst case in all of OCR.** Published benchmarks show every frontier model degrades sharply on Nastaliq vs Naskh (93% → 88% on *printed* text; far worse handwritten).

We **cannot fine-tune** — Plus and Max are closed models. **Prompt engineering is our entire lever.** Fortunately there's a lot of headroom in it.

### 💡 The key insight: directions are a CLOSED VOCABULARY

A doctor writing directions is not writing free prose. They draw from ~30 stock phrases. So this is **not open-ended handwriting recognition — it's classification against a known set.** Massively easier.

Put the enum **in the prompt** and have Qwen map what it sees to the nearest member:

```
Timing:     صبح · دوپہر · شام · رات · صبح شام
Food:       کھانے سے پہلے · کھانے کے بعد · خالی پیٹ · دودھ کے ساتھ
Quantity:   ایک گولی · آدھی گولی · دو گولیاں · ایک چمچ · قطرے · ٹیکہ
Frequency:  دن میں ایک/دو/تین بار · ہر آٹھ گھنٹے بعد · ضرورت کے وقت
Duration:   ۵ دن · ایک ہفتہ · مسلسل
```

**Also handle the Latin notation** doctors constantly mix in — and which is *far* easier to read:
`OD` `BD` `TDS` `QID` `HS` `SOS` `PRN` `1x3` `1-0-1` `0-0-1` `½`

**And expect Eastern Arabic numerals** (`۱ ۲ ۳ ۴ ۵`) alongside Western (`1 2 3 4 5`).

> Roughly half of real prescriptions give dosing in Latin notation and skip Urdu entirely. **That's free accuracy — make sure the prompt catches it.**

### The six techniques we stack

**① Dual output — raw + normalised.** Return both the literal Urdu seen *and* the mapped enum. The raw string is what we display and speak back for confirmation; the enum is what drives the alarms.

**② Self-consistency voting.** Plus costs ~$0.40/M input. Run the **same image 3×** at `temperature: 0.3`, majority-vote each field. **Where the three runs disagree, that field is low-confidence by definition** — the disagreement *is* the signal, no confidence score needed. Cheapest accuracy win available.

**③ Two-pass crop-and-zoom.** Pass 1 locates the directions region. Pass 2 sends **only that crop** at full resolution. Documented at 5–10% gain on hard documents.

**④ Client-side preprocessing.** Greyscale → 2× upscale → contrast stretch → deskew. ~20 lines on a `<canvas>`. Handwriting OCR is disproportionately sensitive to this.

**⑤ Cross-field grounding with Qwen Max** ⭐ **our single best "Effective Use of Qwen" talking point.**
If Plus reads the drug as *Augmentin 625mg* but the Urdu direction is smudged, **Max knows Augmentin 625 is dosed BD or TDS and essentially never once-at-night.** The drug identity constrains the plausible direction space.
**A dedicated OCR engine physically cannot do this — it has no medical knowledge. An LLM pipeline can.** Say this sentence out loud in the demo.

**⑥ Never guess — ask the patient.** On low confidence, do **not** fabricate a dose. Ask in Urdu: *"ڈاکٹر نے کیا کہا تھا — کھانے سے پہلے یا بعد؟"* Patients almost always remember the verbal instruction even when they can't read the paper. **The human is our fallback OCR** — for an illiterate-user product that isn't a workaround, it's the correct design.

### 📊 Build a 20-image eval set — do this tonight

**This is the highest-value use of our extra time.**

1. Collect ~20 real prescription photos (family, friends, local clinic).
2. Hand-label the correct answer for every field.
3. Write a script that scores **per-field accuracy**.
4. Iterate the prompt against it.

Without this we're tuning blind and we find out on stage. With it, we stand up and say:

> *"We measured 87% field-level accuracy on 20 real Pakistani prescriptions."*

That sentence scores across **Technical Implementation (20)** *and* **Real-world Impact (15)**.

---

## 8. Data schema

### Extraction output (Qwen Plus → strict JSON)

```json
{
  "medicines": [
    {
      "brand_name": "Augmentin 625mg",
      "salt": "amoxicillin + clavulanic acid",
      "form": "tablet",
      "directions_raw_urdu": "ایک گولی دن میں دو بار کھانے کے بعد",
      "directions_raw_latin": "1 BD",
      "quantity": "one_tablet",
      "frequency": "twice_daily",
      "times": ["08:00", "20:00"],
      "food": "after_food",
      "duration_days": 5,
      "confidence": { "brand_name": 0.95, "directions": 0.60 },
      "needs_user_confirmation": true
    }
  ],
  "unreadable_regions": ["bottom-left line 3"],
  "overall_confidence": 0.72
}
```

### Alarm record (localStorage)

```json
{
  "id": "uuid",
  "medicine_name": "Augmentin 625mg",
  "photo": "data:image/jpeg;base64,...",
  "urdu_announcement": "آگمنٹن کی ایک گولی، کھانے کے بعد",
  "times": ["08:00", "20:00"],
  "start_date": "2026-07-25",
  "duration_days": 5,
  "taken_log": []
}
```

**`photo` is the most important field in this object.** For our user, the picture *is* the identifier.

---

## 9. Tech stack

| Layer | Choice | Why |
|---|---|---|
| **Framework** | **Next.js 15 (App Router)** | Responsive by default, API routes give us a server-side proxy for free, one-command Vercel deploy |
| **Styling** | **Tailwind CSS** | Fast, and `dir="rtl"` support is trivial |
| **Fonts** | **Noto Nastaliq Urdu** + Inter | Nastaliq is non-negotiable for readable Urdu |
| **i18n** | Simple JSON dictionary (`ur.json` / `en.json`) | No library needed for 2 languages. Don't over-engineer |
| **LLM SDK** | **OpenAI SDK** → Model Studio base URL | Both Qwen models are OpenAI-compatible |
| **Storage** | **localStorage** (alarms) + IndexedDB (photos) | **No database, no auth.** Photos are too big for localStorage |
| **Voice in** | **Web Speech API** `SpeechRecognition` (`ur-PK`) | Free, built into Chrome, works on Android |
| **Voice out** | **Web Speech API** `speechSynthesis` (`ur-PK`) | Free, built in |
| **PDF** | **pdf.js** → canvas → PNG | Only if we get to P2 #18 |
| **Image prep** | Plain `<canvas>` | Greyscale, upscale, contrast, deskew |
| **Notifications** | Service Worker + Notification API | See §10 |
| **Deploy** | **Vercel** | Free, instant, HTTPS (**required** for mic + service worker) |

### 🔐 Security rule — non-negotiable

**The Model Studio API key NEVER touches the client.** Every model call goes through a Next.js API route:

```
Browser → /api/chat  (Next.js server) → Model Studio
Browser → /api/extract (Next.js server) → Model Studio
```

Key lives in `.env.local` and Vercel env vars. **Never `NEXT_PUBLIC_`.**

### Architecture

```
┌──────────────────────────────────────────────────┐
│  BROWSER (PWA)                                   │
│                                                  │
│  Home ──┬── Alarms  → localStorage + IndexedDB   │
│         └── Chat                                 │
│                                                  │
│  Web Speech (STT ur-PK) ──┐                      │
│  Camera / Gallery ────────┤                      │
│  pdf.js → canvas ─────────┤                      │
│  Canvas preprocessing ────┤                      │
│                           ▼                      │
│                    /api/* (server)               │
│  Web Speech (TTS ur-PK) ◄─┘                      │
│  Service Worker → notifications                  │
└──────────────────┬───────────────────────────────┘
                   │  API key server-side only
                   ▼
┌──────────────────────────────────────────────────┐
│  QWEN 3.7 PLUS   → vision, extraction, chat      │
│         │                                        │
│         ▼  (structured JSON)                     │
│  QWEN 3.7 MAX    → safety + interaction pass     │
└──────────────────────────────────────────────────┘
```

---

## 10. Alarms in a web app — the honest answer

We are building a **web app**, not a native app. That has real consequences for alarms. Three tiers:

| Tier | What it is | Reliability | Effort |
|---|---|---|---|
| **1. Foreground** | Tab open → `setTimeout` → audio + full-screen takeover | **100%** if tab is open & phone awake | ~30 min |
| **2. Service Worker notification** | System notification with sound while backgrounded | Android Chrome ✅ · iOS needs home-screen install | ~45 min |
| **3. Web Push from server** | Server cron → VAPID push | The real production answer | Needs a backend |

> ⚠️ **There is no reliable scheduled-notification API on the web.** `showTrigger` (Notification Triggers) never shipped broadly. You **cannot** schedule "8 PM tomorrow" purely client-side and expect it to fire with the browser closed.

**Our decision: ship Tier 1 as the guaranteed demo path, add Tier 2, and name Tier 3 in the pitch as the production roadmap.** Judges respect a team that knows exactly where its prototype ends.

**Two build details that are not optional:**
- **Unlock the audio context on the first user tap** of the session — browsers block autoplay until a gesture.
- **The "test alarm in 10 seconds" button.** It's how we demo *and* how we test all day. Build it first.

---

## 11. Low-literacy UX rules — these are requirements, not polish

- 🖼️ **Every alarm shows the photo of the actual medicine box.** Our user recognises the *box*, not the name. They snap it once at setup.
- 🔊 **A speaker button on every screen** that reads that screen aloud in Urdu. Nothing may require reading.
- ☀️🌤️🌙 **Time-of-day icons**, not digital clock times.
- ⌨️ **Nobody should ever have to type.** Mic + camera + big tappable cards. The keyboard is optional, never primary.
- 🔤 **Support Roman Urdu** — "sar dard hai". A huge share of Pakistanis type Urdu in Latin script. **Test this explicitly, don't assume.**
- ↔️ `dir="rtl"` + Noto Nastaliq Urdu whenever the language is Urdu.
- 👆 Touch targets ≥ 64px. Assume an older user with imperfect eyesight and a cracked screen.

---

## 12. Safety rules — judges will probe this

A medical product without these is disqualified on sight. All cheap to implement.

1. **Persistent "یہ ڈاکٹر نہیں ہے / This is not a doctor"** — spoken, not just written.
2. **Red-flag escalation.** Chest pain, breathing difficulty, bleeding, unconsciousness → stop interpreting, tell them to go to hospital, show **Rescue 1122**.
3. **Never guess a dosage from a blurry image.** Low confidence → *"تصویر صاف نہیں ہے"* and ask for a retake. **Refusing to hallucinate a dose is a feature — say so in the pitch.**
4. **Read the extracted schedule back aloud and get confirmation before creating any alarm.** This is our guard against a hallucinated dose becoming a real-world dose.
5. **Never recommend starting, stopping, or switching a medicine.** We interpret what the doctor wrote. We do not prescribe.

---

## 13. Build plan & work split

### 🌙 Tonight / before the day — *this is where the real work happens*

| Track | Owner | Work |
|---|---|---|
| **A — Core AI** | | Extraction prompt + schema. **20-image eval set + scoring script.** Self-consistency voting. This is the most important track. |
| **B — App shell** | | Next.js scaffold, API proxy, i18n + RTL + Nastaliq, routing, home screen |
| **C — Alarms** | | localStorage store, CRUD UI, ring screen, `test-in-10s`, service worker |
| **D — Voice** | | Web Speech STT/TTS spike **on the actual demo phone**, audio-context unlock |

### ☀️ Hackathon day

| Time | Work |
|---|---|
| 10:00–12:30 | Integrate tracks. **Qwen Max safety pass** (P1 #11). "Right medicine?" check (P1 #12). |
| 12:30–1:15 | Lunch — write the pitch, choose demo photos |
| 1:15–2:30 | Expiry check (#13), P2 items as time allows, Urdu prompt polish |
| 2:30–3:15 | UX pass, disclaimers, Rescue 1122, README |
| 3:15–3:45 | Deploy to Vercel, push to GitHub, submit |
| **3:45** | 🛑 **HARD CODE FREEZE** |
| 3:45–4:00 | **Rehearse the demo twice — on the phone, on venue wifi** |

> Two things lose more hackathons than bad code: **submitting late**, and **demoing on wifi you never tested.** Freeze at 3:45 regardless of what's unfinished.

---

## 14. Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| **Urdu handwriting OCR is poor** | **High** | Closed-vocabulary prompting, self-consistency voting, Max cross-grounding, voice-confirm fallback. **Measure it tonight on the eval set — don't discover it on stage.** |
| `ur-PK` TTS missing on demo phone | Medium | Test **day 1**. Fallback: pre-record ~40 fixed Urdu clips for alarms + UI strings; lose voice only on free-form chat |
| Alarm doesn't fire when phone locked | **Certain** (web limitation) | Demo Tier 1 with tab open. Be upfront — describe Web Push as the production path |
| Venue wifi fails during demo | Medium | Phone hotspot as backup. Have one pre-tested prescription photo you *know* works |
| Scope creep | **High** | P0 → P1 → P2 strictly in order. Stop when time runs out |
| API key leaks to client | Low | Server-side proxy only. Never `NEXT_PUBLIC_` |
| Submitting late | Medium | **3:45 freeze.** Non-negotiable |

---

## 15. Demo script (5 minutes)

1. **The problem — 30s.** "40% of Pakistani adults cannot read the prescription they're handed."
2. **Open the app on a phone.** Two buttons. No text to read.
3. **Photograph a real prescription.** ← *use the pre-tested one*
4. **Show the extracted JSON on screen.** Say: *"Qwen 3.7 Plus is reading handwritten Urdu directions and returning structured medical data."*
5. **Show the Plus → Max handoff.** Say: **"Plus does the vision. Max does the safety reasoning. Both models, each doing what it's best at."**
6. **Max flags a duplicate ingredient.** "You already take Panadol — this also contains paracetamol."
7. **All alarms auto-created.** Confirm by voice, in Urdu.
8. **Hit "test alarm."** Phone rings, shows the **photo of the box**, speaks Urdu.
9. **Close — 20s.** Accuracy number from the eval set. Web Push as the production path. Thank you.

**Rehearse this twice. Out loud. On the phone.**

---

## 16. Open questions

- [ ] **Final product name** — decide day 1, it goes on the slide
- [ ] Confirm with organisers that Web Speech API is acceptable *(browser-native, not another AI vendor — should be fine under any reading of the two-model rule)*
- [ ] Does `ur-PK` TTS exist on our specific demo phone? **← test first**
- [ ] Team size and track assignments
- [ ] Who owns the GitHub repo / Vercel account

---

## Appendix A — Reference links

**Models**
- [Qwen3.7-Plus — Alibaba Cloud](https://www.alibabacloud.com/blog/qwen3-7-plus-multimodal-agent-intelligence_603206)
- [Qwen3.7-Max specifications](https://apxml.com/models/qwen37-max)
- [Model Studio supported models](https://www.alibabacloud.com/help/en/model-studio/models)

**Urdu OCR research**
- [ViLanOCR — bilingual Urdu/English prescription OCR](https://peerj.com/articles/cs-1964/)
- [Urdu Katib Handwritten Dataset (Nastaliq)](https://arxiv.org/pdf/2606.19139)
- [Doctor handwriting dataset — Nawabshah, Pakistan](https://www.kaggle.com/datasets/mrdude20/doctor-handwriting-recognition-dataset)
- [Handwriting → structured data benchmarking](https://arxiv.org/pdf/2604.16504)
- [OCR prompting strategy for VLMs](https://www.ubicloud.com/blog/end-to-end-ocr-with-vision-language-models)

---

## Appendix B — Environment setup

```bash
npx create-next-app@latest sehat-saathi --typescript --tailwind --app
cd sehat-saathi
npm install openai pdfjs-dist
```

`.env.local`:
```
DASHSCOPE_API_KEY=sk-xxxxx
DASHSCOPE_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
```

Client init (**server-side only**):
```ts
import OpenAI from "openai";

export const qwen = new OpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY,
  baseURL: process.env.DASHSCOPE_BASE_URL,
});

export const VISION_MODEL    = "qwen3.7-plus"; // images + chat
export const REASONING_MODEL = "qwen3.7-max";  // text-only safety pass
```

> ⚠️ Confirm the exact model ID strings and base URL against the credentials the organisers give you — **do this before the day**, not at 10:05 AM.
