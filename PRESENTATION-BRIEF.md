# Sehat Saathi — Presentation Brief
### Everything you need to build the pitch deck

**For:** the teammate building the slides
**Project:** صحت ساتھی — Sehat Saathi (an Urdu-first medical assistant)
**Event:** Qwen AI Buildathon 2026 (Qwen Pakistan)
**Repo:** https://github.com/MuhammadAnasTahir/QwenHackathon

> This document is self-contained. You do not need to read the code to build the deck — everything here is accurate to what we actually built and running. Read it top to bottom once, then use §13 (slide-by-slide) as your build checklist and §14 (soundbites) for the words to put on screen.

---

## 1. The one-liner (put this on slide 1)

> **Sehat Saathi lets a person who cannot read photograph their prescription, hear it explained in spoken Urdu, and get medicine alarms that show a picture of the actual medicine box — powered end-to-end by Qwen 3.7.**

Alternate shorter hook: **"A medicine assistant for the 40% of Pakistani adults who cannot read their own prescription."**

---

## 2. The problem (1–2 slides — this is the emotional core)

Pakistan's adult literacy rate is roughly **60%**. That means **tens of millions of adults** are handed a **handwritten prescription they physically cannot read** and are expected to take the right medicine, at the right time, for the right number of days.

What actually goes wrong today:
- Patients rely on memory of what the doctor said — and forget.
- They stop antibiotics early because nobody explained the course.
- They take Panadol **and** a combination cold/flu tablet that **also contains paracetamol** → accidental overdose.
- The pharmacy hands them a **different box** than prescribed and they can't tell.

**Every existing medicine-reminder app assumes you can read, type, and understand English medical terms.** All three assumptions fail for our user.

> Visual idea: a photo of a real handwritten Pakistani prescription (messy English drug names + Urdu directions). Caption: *"Could you take the right dose from this?"*

---

## 3. Who we built it for (1 slide — make it a person, not a statistic)

**Meet Fatima.** She is 45, lives in Faisalabad, and has high blood pressure and diabetes. She owns an Android phone. She sends WhatsApp **voice notes** because she cannot type. She **cannot read** her prescription. Her son sets things up for her when he visits.

**Design consequence (say this out loud):** *if any part of our product requires reading or typing, we have failed.* Everything works through **camera, microphone, pictures, and voice.**

---

## 4. The solution in one screen (1 slide)

When you open the app, there are exactly **two big buttons**:

| ⏰ **الارم — Set Alarms** | 💬 **بات کریں — Chat** |
|---|---|
| Medicine reminders that ring with a **photo of the medicine** and an **Urdu voice announcement** | Ask questions by **voice or text**, or photograph a prescription / medicine box and get it explained in simple spoken Urdu |

The two connect through the **killer flow**:

> **📸 Photograph prescription → Qwen reads every medicine + schedule → all alarms auto-created → user confirms by voice.**

That single flow is the product, the demo, and the pitch.

---

## 5. Feature walkthrough (2–3 slides — pick the 4–5 strongest for the deck)

Group these visually. Each has a **what** and a **why it matters** — use the "why" as the caption.

### 🎙️ Voice-message chat (voice in → voice out)
**What:** Tap the mic, speak your question, get a **spoken Urdu answer** back — like a WhatsApp voice note. No typing, no reading.
**Why:** This IS the interface for someone who can't read. You speak, it speaks back.

### 📋 Prescription → automatic alarms
**What:** Photograph the prescription (or upload a PDF). The app extracts every medicine — name, dose, timing, food instructions, duration — into a structured list, reads it back in Urdu for confirmation, then **creates all the alarms automatically**.
**Why:** Turns an unreadable piece of paper into a working reminder system in 30 seconds.

### 💊 Alarms that show the medicine, not its name
**What:** Each alarm rings full-screen with a **photo of the actual box**, a loud tone, and a spoken Urdu announcement ("It's time for your Panadol, one tablet, after food").
**Why:** Our user recognises the **box**, not the written name. The photo *is* the interface.

### 📦 "Is this the right medicine?" box check
**What:** Point the camera at the box the pharmacy gave you. The app compares it against your prescription and says ✅ or ❌ in Urdu, and reads the **expiry date**.
**Why:** Pharmacy substitution and expired stock are real, everyday problems. A 20-second safety check.

### 🛡️ Duplicate-ingredient & safety check
**What:** After reading a prescription, a second AI pass flags dangerous overlaps — e.g. "You already take Panadol; this new tablet also contains paracetamol."
**Why:** Patients see multiple doctors and accidentally double-dose. This catches it.

### 🌐 Urdu-first, fully bilingual
**What:** Entire app in natural Urdu (right-to-left, proper Nastaliq script) or English, toggle any time.
**Why:** The majority of our users don't speak English. Urdu isn't a translation layer — it's the default.

### 🚨 Emergency red-flag detection
**What:** If a user describes chest pain, difficulty breathing, heavy bleeding, etc., the assistant stops interpreting and tells them to go to hospital / call **Rescue 1122**.
**Why:** A medical assistant that misses an emergency is dangerous. This is a guardrail.

---

## 6. How it works — the AI pipeline (1–2 slides; THIS wins the "Effective Use of Qwen" points)

We use **both** provided Qwen models, each for what it's genuinely best at. **Emphasise this — most teams use one model for everything.**

```
   📸 Prescription photo / PDF
              │
              ▼
   ┌─────────────────────────┐
   │   QWEN 3.7 PLUS         │   ← Vision + understanding
   │   (reads the image,     │      Reads messy handwriting, maps Urdu
   │    extracts medicines)  │      dosing phrases to structured data
   └───────────┬─────────────┘
               │  structured JSON (medicine, dose, timing, duration)
               ▼
   ┌─────────────────────────┐
   │   QWEN 3.7 MAX          │   ← Medical safety reasoning
   │   (checks the medicines │      Duplicate ingredients, dangerous
   │    for safety issues)   │      interactions, implausible doses
   └───────────┬─────────────┘
               ▼
     ✅ Alarms created + safety warnings shown
```

**The two-model story in one sentence (memorise this for the demo):**
> *"Qwen 3.7 Plus does the vision — it reads the handwritten prescription and turns it into structured data. Qwen 3.7 Max does the safety reasoning — it checks that the medicines are safe together. Two models, each doing what it's best at."*

**Why an LLM and not just OCR** (a strong talking point): a normal text scanner can only copy letters. Our pipeline **understands** — it maps "1 BD" or "دن میں دو بار" to a real schedule, it knows Augmentin is dosed twice daily so it can flag a misread, and it explains everything at a 5th-grade Urdu reading level. **Only a language model can do that.**

**Robustness features worth a bullet:** the app **never guesses a dose** — if the handwriting is unclear it says so and asks the patient (who usually remembers what the doctor said aloud). Refusing to hallucinate a dose is a safety feature, not a limitation.

---

## 7. Judging criteria — how we score (1 slide; keep it internal-facing but it shapes the whole deck)

The official rubric is **100 points**. Build the deck to hit each one:

| Criterion | Points | Our angle — make sure a slide covers this |
|---|---|---|
| **Effective Use of Qwen** | **25** | Both models, each specialised. Vision extraction + safety reasoning. Structured output, medical grounding, literacy adaptation. **Highest weight — give it the most airtime.** |
| **Innovation & Creativity** | 20 | Prescription → auto-alarms. Medicine identified by **photo, not name**. Voice-message loop for non-readers. |
| **Technical Implementation** | 20 | Real-time streaming pipeline, self-consistency voting, robust fallbacks, PWA, clean architecture. |
| **Real-world Impact** | 15 | 40% of Pakistani adults. A concrete, documented, local problem with real harm today. |
| **UX & Product Quality** | 10 | Zero-reading, zero-typing interface. Voice + camera + big buttons. Urdu-first RTL. |
| **Demo & Presentation** | 10 | Rehearsed, live, on a phone/laptop that works. Clear story. |

---

## 8. The live demo script (1 slide as a storyboard; rehearse separately)

Keep it under 4 minutes. Order matters — lead with the emotional hook, end with the "wow".

1. **The problem (30s).** "40% of Pakistani adults can't read the prescription they're handed."
2. **Open the app.** Two big buttons, no text to read. Toggle to Urdu — whole app flips to Nastaliq, right-to-left.
3. **Photograph a real prescription.** Show the live progress steps (Parsing → Reading → Extracting → Finalising).
4. **The extracted medicines appear** — name, dose, timing, all structured. Say the two-model line from §6.
5. **A safety warning pops up** — "this contains the same ingredient as another medicine." (If you have a demo prescription that triggers it.)
6. **Confirm → all alarms created automatically.**
7. **Voice message:** speak a question in Urdu, get a spoken Urdu answer back. (Do this on a device with a working voice — see the demo-day note below.)
8. **Fire a test alarm** — phone rings full-screen with the medicine photo and Urdu voice.
9. **Close (20s).** Real-world impact + "this is not a replacement for a doctor, it's a bridge for people who can't read one's handwriting."

> **Demo-day note for whoever presents:** the voice feature sounds best on a **phone** (native Urdu voice). On a laptop it still works via a fallback. Rehearse the exact voice line on the actual demo device beforehand.

---

## 9. Tech stack (1 slide — keep it visual, logos not paragraphs)

| Layer | Choice |
|---|---|
| **Framework** | Next.js 16 (App Router), React 19 — responsive PWA, installable |
| **Styling** | Tailwind CSS v4, Noto Nastaliq Urdu font for Urdu |
| **AI models** | **Qwen 3.7 Plus** (vision + chat), **Qwen 3.7 Max** (safety reasoning) |
| **Document OCR** | Reducto (pre-processes PDFs/images before Qwen — see positioning note §11) |
| **Voice** | Browser Web Speech API — speech-to-text + text-to-speech, Urdu |
| **Storage** | On-device only (localStorage + IndexedDB). **No database, no accounts** |
| **Streaming** | Server-Sent Events — live token streaming + staged progress |
| **Deploy** | Vercel |

**Architecture one-liner:** *a mobile-first PWA where every AI call is proxied server-side (the API key never touches the browser), and all patient data stays on the device.*

---

## 10. Why we win — differentiation (1 slide)

- **Built for people who can't read.** Not an English app with an Urdu toggle — the *entire* interaction model (voice, photos, big buttons) assumes non-literacy. Nobody else builds for this user.
- **Uses both Qwen models meaningfully**, each for a distinct, defensible job.
- **Understands, doesn't just scan.** Structured medical extraction + safety reasoning, not OCR.
- **Solves a real Pakistani problem** with real harm today — not a generic demo.
- **Safe by design.** Never guesses doses, escalates emergencies, always defers to a doctor.

---

## 11. Positioning notes — read before you write the words

- **On Reducto:** it's a supporting OCR tool that cleans up the document before Qwen reads it. The **intelligence** — understanding the prescription, the safety reasoning, the Urdu explanation — is **all Qwen**. In the pitch, keep the spotlight on the Qwen models. Don't lead with Reducto; if asked, describe it as "an OCR pre-processing step; the medical understanding is done by Qwen."
- **On "is it a doctor?":** Never claim it diagnoses or replaces a doctor. It **interprets what the doctor wrote** and **reminds**. Frame it as a bridge, not a replacement. This is both honest and scores well on responsible-AI.
- **On accuracy:** don't over-claim OCR perfection. Our honest strength is that the app **knows when it's unsure and asks**, rather than guessing. That's a feature.

---

## 12. Roadmap / "what's next" (1 optional slide — shows ambition)

- Caregiver profiles (one literate family member manages an elderly parent's alarms)
- Adherence log → a one-page "show this to your doctor" summary
- Generic-name / cheaper-equivalent suggestions
- Server-side push so alarms fire even when the app is closed
- Wider medicine-image database for box verification

---

## 13. Suggested slide-by-slide structure (your build checklist)

Target **10–12 slides**. Don't exceed.

1. **Title** — app name (اردو + English), the one-liner, team names.
2. **The problem** — the literacy stat + the harm (forgotten doses, overdoses, wrong boxes).
3. **The user** — Fatima. Make it human.
4. **The solution** — two-button home screen, one screenshot.
5. **Feature highlight 1** — Prescription → auto-alarms (the killer flow). Screenshots.
6. **Feature highlight 2** — Voice-message chat + Urdu-first UI.
7. **Feature highlight 3** — Alarm with medicine photo + box verification.
8. **How it works** — the Qwen Plus → Qwen Max pipeline diagram (§6). **This is the money slide.**
9. **Tech stack** — logos.
10. **Impact + responsible AI** — who it helps, and the safety guardrails.
11. **Live demo** — (or do the demo live between slides 7 and 8; then this slide is a backup screenshot walkthrough).
12. **Closing** — one-line vision + thank you + repo link.

---

## 14. Soundbites — copy-paste lines for slides & narration

- "A medicine assistant for the 40% of Pakistani adults who cannot read their prescription."
- "If it needs reading or typing, we've failed. So it doesn't."
- "You photograph the prescription. It reads it, explains it in Urdu, and sets your alarms."
- "The alarm shows the **box**, not the name — because that's what our user recognises."
- "Qwen Plus does the vision. Qwen Max does the safety check. Two models, each doing what it's best at."
- "It doesn't just scan the letters — it **understands** the medicine."
- "It never guesses a dose. If it can't read clearly, it asks — because a guessed dose can kill."
- "Not a replacement for a doctor. A bridge for people who can't read one's handwriting."

---

## 15. Assets, facts & links (for accuracy — don't misquote these)

- **Product name:** Sehat Saathi (صحت ساتھی) — "health companion"
- **Repo:** https://github.com/MuhammadAnasTahir/QwenHackathon
- **Models used:** Qwen 3.7 Plus, Qwen 3.7 Max (the two provided by the hackathon)
- **Languages:** Urdu (default, RTL, Nastaliq) + English
- **Platform:** Responsive web app / installable PWA — works on phone and laptop
- **Data:** stored entirely on the user's device; no server database, no login
- **Emergency line referenced in-app:** Rescue 1122
- **Literacy figure:** Pakistan adult literacy ≈ 60% (so ≈ 40% cannot read fluently) — phrase as "roughly" / "around", don't cite a false precision.

**Screenshots to capture for the deck (do this from the running app):**
1. Home screen (two big buttons) — in Urdu, showing RTL.
2. Prescription upload → the live progress steps.
3. The extracted-medicines review screen.
4. A safety warning card.
5. An alarm card with a medicine photo.
6. The full-screen alarm ring.
7. A voice-message exchange in the chat.
8. (Optional) the "Judge Mode" pipeline trace showing Plus → Max — good proof for the technical slide.

---

## 16. Team to fill in

- [ ] Team name
- [ ] Team member names + roles
- [ ] Who presents which section
- [ ] Deployed demo link (Vercel URL), if live
- [ ] Final product name confirmed (Sehat Saathi vs alternatives)

---

*Everything in this brief reflects the app as actually built and running. If a slide claim isn't in this document, check with the build team before putting it on screen.*
