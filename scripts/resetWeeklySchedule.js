/**
 * Weekly reset:
 * - For each doc in `schedules/{teacherId}`:
 *   - If `defaultGrid` exists -> copy it into `grid`
 *   - Else fallback: keep "red" as-is, turn "yellow"/"blue" to "white"
 */
const admin = require("firebase-admin");

if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error("Missing FIREBASE_SERVICE_ACCOUNT secret");
  process.exit(1);
}

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(sa) });

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

function fallbackReset(grid = {}) {
  const out = {};
  for (const day of Object.keys(grid)) {
    out[day] = {};
    for (const time of Object.keys(grid[day] || {})) {
      const v = grid[day][time];
      // Keep RED (hard block), reset everything else to WHITE
      out[day][time] = String(v).toLowerCase() === "red" ? "red" : "white";
    }
  }
  return out;
}

(async () => {
  console.log("Starting weekly schedule reset…");

  const snap = await db.collection("schedules").get();
  console.log(`Found ${snap.size} schedule docs`);

  let changed = 0;
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const ref = doc.ref;

    const nextGrid = data.defaultGrid
      ? data.defaultGrid
      : fallbackReset(data.grid || {});

    // Skip if identical
    const same = JSON.stringify(nextGrid) === JSON.stringify(data.grid || {});
    if (same) continue;

    await ref.update({
      grid: nextGrid,
      clearedAt: FieldValue.serverTimestamp(),
    });
    changed++;
    console.log(`Reset: ${doc.id}`);
  }

  console.log(`Done. Updated ${changed} schedule(s).`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
