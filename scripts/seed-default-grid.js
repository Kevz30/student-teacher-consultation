// scripts/seed-default-grid.js
const admin = require("firebase-admin");

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

(async () => {
  const snap = await db.collection("schedules").get();
  if (snap.empty) {
    console.log("No schedules found.");
    process.exit(0);
  }
  for (const d of snap.docs) {
    const data = d.data() || {};
    if (!data.defaultGrid && data.grid) {
      await d.ref.set(
        { defaultGrid: data.grid, defaultSeededAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
      console.log("SEEDED", d.id);
    } else {
      console.log("SKIP", d.id, "already has defaultGrid or no grid");
    }
  }
  console.log("Done.");
  process.exit(0);
})();
