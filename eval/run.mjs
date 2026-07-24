#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Sehat Saathi — prescription-extraction eval harness.
//
// Reads eval/images/*.{jpg,jpeg,png} + eval/labels.json, POSTs each image to
// the /api/extract endpoint of a running dev server, and scores the voted
// extraction per field against the hand-made labels.
//
// Usage:
//   npm run dev            (in one terminal)
//   npm run eval           (in another)   or:  node eval/run.mjs
//
// Env:
//   EVAL_URL   override the endpoint      (default http://localhost:3000/api/extract)
//   EVAL_RUNS  self-consistency votes per image (default: server default, 3)
//
// No dependencies. Requires Node 18+ (global fetch).
// ─────────────────────────────────────────────────────────────────────────────

import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EVAL_DIR = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = path.join(EVAL_DIR, "images");
const LABELS_PATH = path.join(EVAL_DIR, "labels.json");
const EVAL_URL = process.env.EVAL_URL ?? "http://localhost:3000/api/extract";
const EVAL_RUNS = process.env.EVAL_RUNS ? Number(process.env.EVAL_RUNS) : undefined;
const REQUEST_TIMEOUT_MS = 300_000;

const MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png" };

// Fields scored per medicine, in display order.
const FIELDS = ["brand_name", "quantity", "frequency", "food", "duration_days", "times"];

// ── field comparators ────────────────────────────────────────────────────────

function normBrand(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Case-insensitive substring match, either direction. */
function brandMatches(a, b) {
  const x = normBrand(a);
  const y = normBrand(b);
  if (!x || !y) return false;
  return x.includes(y) || y.includes(x);
}

/** Set equality on "HH:MM" arrays (order/duplicates ignored). */
function timesEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  const sa = [...new Set(a)].sort();
  const sb = [...new Set(b)].sort();
  return sa.length === sb.length && sa.every((v, i) => v === sb[i]);
}

/**
 * Score one labeled medicine against its matched extraction (or null if the
 * brand was not found at all). Returns { field: true|false } for every field
 * present in the label. When the medicine was not found, every labeled field
 * counts as wrong — a missed medicine is a full miss, not a skip.
 */
function scoreMedicine(label, extracted) {
  const out = {};
  for (const field of FIELDS) {
    if (!(field in label)) continue; // tolerate partial labels
    if (extracted == null) {
      out[field] = false;
    } else if (field === "brand_name") {
      out[field] = true; // matched by definition
    } else if (field === "times") {
      out[field] = timesEqual(extracted.times, label.times);
    } else if (field === "duration_days") {
      out[field] = (extracted.duration_days ?? null) === (label.duration_days ?? null);
    } else {
      out[field] = extracted[field] === label[field]; // exact enum match
    }
  }
  return out;
}

// ── output helpers ───────────────────────────────────────────────────────────

const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);
const pct = (c, t) => (t === 0 ? "  n/a" : ((100 * c) / t).toFixed(1) + "%");
const mark = (ok) => (ok ? "ok" : "X ");

function fieldLine(scores, label, extracted) {
  const parts = [];
  for (const field of FIELDS) {
    if (!(field in scores)) continue;
    if (scores[field]) {
      parts.push(`${field}=ok`);
    } else if (extracted == null) {
      parts.push(`${field}=X`);
    } else {
      const got = field === "times" ? JSON.stringify(extracted.times) : String(extracted[field]);
      const want = field === "times" ? JSON.stringify(label.times) : String(label[field]);
      parts.push(`${field}=X(got ${got}, want ${want})`);
    }
  }
  return parts.join("  ");
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Sehat Saathi eval harness");
  console.log(`endpoint: ${EVAL_URL}${EVAL_RUNS ? `  (runs=${EVAL_RUNS})` : ""}`);
  console.log("");

  if (!existsSync(LABELS_PATH)) {
    console.error(`ERROR: ${LABELS_PATH} not found.`);
    console.error("Copy eval/labels.example.json to eval/labels.json and fill in your labels.");
    process.exit(1);
  }
  if (!existsSync(IMAGES_DIR)) {
    console.error(`ERROR: ${IMAGES_DIR} not found.`);
    console.error("Create eval/images/ and put your prescription photos (.jpg/.jpeg/.png) in it.");
    process.exit(1);
  }

  let labels;
  try {
    labels = JSON.parse(await readFile(LABELS_PATH, "utf8"));
  } catch (e) {
    console.error(`ERROR: could not parse ${LABELS_PATH}: ${e.message}`);
    process.exit(1);
  }
  if (!Array.isArray(labels) || labels.length === 0) {
    console.error("ERROR: labels.json must be a non-empty array of { image, medicines } entries.");
    process.exit(1);
  }

  const diskImages = (await readdir(IMAGES_DIR)).filter((f) => MIME[path.extname(f).toLowerCase()]);
  const labeledNames = new Set(labels.map((l) => l.image));
  for (const f of diskImages) {
    if (!labeledNames.has(f)) console.warn(`WARN: ${f} is in eval/images/ but has no label — skipped.`);
  }
  console.log("");

  // aggregate[field] = { correct, total }
  const aggregate = Object.fromEntries(FIELDS.map((f) => [f, { correct: 0, total: 0 }]));
  const failures = [];
  const latencies = [];
  let extraExtractedTotal = 0;

  for (const entry of labels) {
    const imgPath = path.join(IMAGES_DIR, entry.image);
    const ext = path.extname(entry.image).toLowerCase();

    if (!MIME[ext] || !existsSync(imgPath)) {
      console.error(`-- ${entry.image}  MISSING (labeled but not found in eval/images/, or unsupported type)`);
      failures.push(`${entry.image}: file missing or unsupported type`);
      continue;
    }
    if (!Array.isArray(entry.medicines) || entry.medicines.length === 0) {
      console.error(`-- ${entry.image}  BAD LABEL (no medicines array)`);
      failures.push(`${entry.image}: label has no medicines array`);
      continue;
    }

    const b64 = (await readFile(imgPath)).toString("base64");
    const dataUrl = `data:${MIME[ext]};base64,${b64}`;

    const t0 = Date.now();
    let data;
    try {
      const res = await fetch(EVAL_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl, ...(EVAL_RUNS ? { runs: EVAL_RUNS } : {}) }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${body.slice(0, 200)}`);
      }
      data = await res.json();
    } catch (e) {
      console.error(`-- ${entry.image}  REQUEST FAILED: ${e.message}`);
      failures.push(`${entry.image}: ${e.message}`);
      continue;
    }
    const seconds = ((Date.now() - t0) / 1000).toFixed(1);
    latencies.push(Date.now() - t0);

    const extractedMeds = data?.result?.medicines;
    if (!Array.isArray(extractedMeds)) {
      console.error(`-- ${entry.image}  BAD RESPONSE (no result.medicines array)`);
      failures.push(`${entry.image}: response missing result.medicines`);
      continue;
    }

    console.log(
      `-- ${entry.image}  (${seconds}s, ${entry.medicines.length} labeled, ${extractedMeds.length} extracted)`
    );

    // Greedy match: each extracted medicine may satisfy at most one label.
    const used = new Set();
    let imgCorrect = 0;
    let imgTotal = 0;

    for (const label of entry.medicines) {
      let matched = null;
      for (let i = 0; i < extractedMeds.length; i++) {
        if (used.has(i)) continue;
        if (brandMatches(extractedMeds[i].brand_name, label.brand_name)) {
          matched = extractedMeds[i];
          used.add(i);
          break;
        }
      }

      const scores = scoreMedicine(label, matched);
      for (const [field, ok] of Object.entries(scores)) {
        aggregate[field].total += 1;
        aggregate[field].correct += ok ? 1 : 0;
        imgTotal += 1;
        imgCorrect += ok ? 1 : 0;
      }

      if (matched == null) {
        console.log(`   ${mark(false)} ${pad(label.brand_name, 24)} NOT FOUND in extraction`);
      } else {
        const allOk = Object.values(scores).every(Boolean);
        console.log(`   ${mark(allOk)} ${pad(label.brand_name, 24)} ${fieldLine(scores, label, matched)}`);
      }
    }

    const extras = extractedMeds
      .map((m, i) => (used.has(i) ? null : m.brand_name))
      .filter((x) => x != null);
    if (extras.length > 0) {
      extraExtractedTotal += extras.length;
      console.log(`   note: extra extracted (not in label): ${extras.join(", ")}`);
    }
    console.log(`   image score: ${imgCorrect}/${imgTotal} fields (${pct(imgCorrect, imgTotal)})`);
    console.log("");
  }

  // ── aggregate table ────────────────────────────────────────────────────────
  console.log("=".repeat(52));
  console.log("AGGREGATE PER-FIELD ACCURACY");
  console.log("-".repeat(52));
  console.log(`${pad("Field", 16)}${padL("Correct", 9)}${padL("Total", 8)}${padL("Accuracy", 11)}`);
  let totalCorrect = 0;
  let totalFields = 0;
  for (const field of FIELDS) {
    const { correct, total } = aggregate[field];
    totalCorrect += correct;
    totalFields += total;
    console.log(`${pad(field, 16)}${padL(correct, 9)}${padL(total, 8)}${padL(pct(correct, total), 11)}`);
  }
  console.log("-".repeat(52));
  console.log(`${pad("OVERALL", 16)}${padL(totalCorrect, 9)}${padL(totalFields, 8)}${padL(pct(totalCorrect, totalFields), 11)}`);
  console.log("=".repeat(52));

  if (latencies.length > 0) {
    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length / 1000;
    console.log(`images scored: ${latencies.length}   avg latency: ${avg.toFixed(1)}s`);
  }
  if (extraExtractedTotal > 0) {
    console.log(`extra (unlabeled) medicines extracted across all images: ${extraExtractedTotal}`);
  }

  if (failures.length > 0) {
    console.error("");
    console.error(`FAILURES (${failures.length}):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(`FATAL: ${e?.stack ?? e}`);
  process.exit(1);
});
