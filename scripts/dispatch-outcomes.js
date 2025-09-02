// scripts/dispatch-outcomes.js
/**
 * Finds consultations that have finished (based on startAtMs + duration),
 * and sends the student a notification to fill the "Outcome" section.
 * Then it marks the consultation as { outcomeDispatched: true }.
 *
 * Runs under GitHub Actions using FIREBASE_SERVICE_ACCOUNT + FIREBASE_PROJECT_ID.
 */

const admin = require("firebase-admin");

function loadServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("Missing FIREBASE_SERVICE_ACCOUNT env!");
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is not valid JSON.");
  }
}

function minutesFromDurationText(txt) {
  // "30 minutes", "45", "60 mins" → 30/45/60
  const n = parseInt(String(txt || "30").replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

function deriveStartMs(d) {
  if (typeof d.startAtMs === "number" && d.startAtMs > 0) return d.startAtMs;
  // Fallback: dateISO + time like "9:00-9:30" (assume Asia/Manila +08:00)
  const dateISO = d.dateISO || d.form?.dateISO;
  const time = d.time || d.form?.time;
  if (!dateISO || !time) return 0;

  const m = /^(\d{1,2}):(\d{2})/.exec(String(time)); // start HH:MM of the slot
  if (!m) return 0;
  const hh = m[1].padStart(2, "0");
  const mm = m[2];

  const iso = `${dateISO}T${hh}:${mm}:00+08:00`;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

async function main() {
  const sa = loadServiceAccount();
  admin.initializeApp({
    credential: admin.credential.cert(sa),
    projectId: process.env.FIREBASE_PROJECT_ID || sa.project_id,
  });
  const db = admin.firestore();

  const now = Date.now();
  const due = [];

  // Keep the query simple to avoid composite-index issues.
  const snap = await db.collection("consultations")
    .where("status", "==", "signed_by_teacher")
    .get();

  snap.forEach(doc => {
    const c = doc.data();
    if (c.outcomeDispatched === true) return;

    const startMs = deriveStartMs(c);
    if (!startMs) return;

    const mins = minutesFromDurationText(c.form?.duration);
    const endMs = startMs + mins * 60 * 1000;

    if (now >= endMs) {
      due.push({ id: doc.id, c, startMs, endMs });
    }
  });

  if (!due.length) {
    console.log("No consultations to dispatch.");
    return;
  }

  console.log(`Dispatching outcome requests for ${due.length} consultation(s)…`);

  const batch = db.bulkWriter();

  for (const item of due) {
    const { id, c, endMs } = item;
    const studentId = c.studentId || c.form?.studentId;
    if (!studentId) continue;

    // 1) notify the student
    const notifRef = db.collection("notifications").doc();
    batch.set(notifRef, {
      userId: studentId,
      type: "outcome_request",
      title: "Outcome needed",
      message: `Your consultation for ${c.form?.date || c.day} at ${c.form?.time || c.time} has ended. Please fill in the outcome notes and upload the final PDF.`,
      consultationId: id,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAtMs: Date.now(),
      read: false,
    });

    // 2) mark consultation as dispatched
    const consultRef = db.collection("consultations").doc(id);
    batch.update(consultRef, {
      outcomeDispatched: true,
      endAtMs: endMs,
    });
  }

  await batch.close();
  console.log("Done.");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
