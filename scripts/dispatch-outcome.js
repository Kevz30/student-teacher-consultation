// scripts/dispatch-outcome.js
/**
 * Scans recent consultations that were accepted/signed and, once their time slot
 * has ended (PH time), creates an "outcome_request" notification for the student
 * and marks the consultation so we don't notify twice.
 *
 * Env:
 *   FIREBASE_SERVICE_ACCOUNT  -> JSON string of service account (GitHub Secret)
 *   FIREBASE_PROJECT_ID       -> your Firebase project id
 */

const admin = require("firebase-admin");

// ---- Init Admin SDK from env secret ----
const svc = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!svc) {
  console.error("FIREBASE_SERVICE_ACCOUNT missing");
  process.exit(1);
}
const creds = JSON.parse(svc);
admin.initializeApp({
  credential: admin.credential.cert(creds),
  projectId: process.env.FIREBASE_PROJECT_ID || creds.project_id,
});
const db = admin.firestore();

/* ---------- helpers ---------- */

const DAY = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const dayIndex = (name = "") => {
  const i = DAY.findIndex(d => d.toLowerCase() === String(name).trim().toLowerCase());
  return i; // -1 if unknown
};

// PH time now (UTC+8, no DST)
const nowPH = () => {
  const now = new Date();
  return new Date(now.getTime() + 8 * 60 * 60 * 1000);
};
const phDayIdx = () => nowPH().getUTCDay();
const phMinutes = () => {
  const t = nowPH();
  return t.getUTCHours() * 60 + t.getUTCMinutes();
};

// parse "9:00 - 9:30", "9:00 AM - 9:30 AM", "09:00"
function parseTimeslotMinutes(s = "", fallbackDurMin = 30) {
  // find up to two times
  const rx = /(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?/g;
  const matches = [];
  let m;
  while ((m = rx.exec(s)) && matches.length < 2) matches.push(m);

  const toMinutes = (hhStr, mmStr, mer) => {
    let hh = parseInt(hhStr, 10);
    const mm = parseInt(mmStr, 10);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
    if (mer) {
      const p = mer.toLowerCase();
      if (p === "am") {
        if (hh === 12) hh = 0;
      } else if (p === "pm") {
        if (hh < 12) hh += 12;
      }
    }
    return hh * 60 + mm;
  };

  if (matches.length === 0) return { start: null, end: null };

  const start = toMinutes(matches[0][1], matches[0][2], matches[0][3]);
  let end = null;
  if (matches.length >= 2) {
    end = toMinutes(matches[1][1], matches[1][2], matches[1][3]);
  }
  if (start != null && end == null) end = start + fallbackDurMin;
  if (end != null && end > 24 * 60) end = 24 * 60;
  return { start, end };
}

function slotHasEndedPH(consult) {
  const dName = consult?.day || consult?.form?.date || "";
  const tStr  = consult?.time || consult?.form?.time || "";
  const idx = dayIndex(dName);
  if (idx < 0) return false; // unknown day -> skip

  const { start, end } = parseTimeslotMinutes(tStr, 30);
  const endMin = end ?? (start != null ? start + 30 : null);
  if (endMin == null) return false;

  const todayIdx = phDayIdx();
  const nowMin = phMinutes();

  if (todayIdx > idx) return true;
  if (todayIdx < idx) return false;
  // same day
  return nowMin >= endMin;
}

/* ---------- main ---------- */

(async () => {
  console.log(`[dispatch-outcome] start @ PH ${nowPH().toISOString()}`);

  // Pull a reasonable batch of recent signed consultations.
  // (Simple equality query avoids composite-index headaches.)
  const snap = await db
    .collection("consultations")
    .where("status", "==", "signed_by_teacher")
    .limit(300)
    .get();

  if (snap.empty) {
    console.log("No signed consultations found.");
    process.exit(0);
  }

  let processed = 0, notified = 0, skipped = 0;

  for (const docSnap of snap.docs) {
    const c = docSnap.data();

    // already requested? skip
    if (c.outcomeRequestedAt || c.outcomeStatus === "requested") {
      skipped++;
      continue;
    }

    // safety: must have a studentId to notify
    const studentId = c.studentId || c.form?.studentId;
    if (!studentId) { skipped++; continue; }

    // only when slot is over (PH time)
    if (!slotHasEndedPH(c)) { skipped++; continue; }

    // Write notification then mark consultation
    const batch = db.batch();

    const notifRef = db.collection("notifications").doc();
    batch.set(notifRef, {
      userId: studentId,
      title: "Please complete consultation outcome",
      message: `Your consultation on ${c.form?.date || c.day} at ${c.form?.time || c.time} has ended. Please fill out "Other Notes / Proceedings / Outcome" to finalize the record.`,
      type: "outcome_request",
      consultationId: docSnap.id,
      teacherId: c.teacherId || c.form?.teacherId || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAtMs: Date.now(),
      read: false,
    });

    batch.update(docSnap.ref, {
      outcomeStatus: "requested",
      outcomeRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await batch.commit();
    notified++;
    processed++;
    console.log(` - notified student ${studentId} for consult ${docSnap.id}`);
  }

  console.log(`[dispatch-outcome] done. processed=${processed} notified=${notified} skipped=${skipped}`);
  process.exit(0);
})().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
