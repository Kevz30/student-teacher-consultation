// scripts/reset-weekly.js
const admin = require("firebase-admin");

if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error("Missing FIREBASE_SERVICE_ACCOUNT secret");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
});
const db = admin.firestore();

async function resetOneSchedule(docSnap) {
  const data = docSnap.data() || {};
  const { defaultGrid, grid } = data;

  if (!defaultGrid) {
    console.log(`SKIP ${docSnap.id}: no defaultGrid saved yet`);
    return;
  }

  await docSnap.ref.update({
    grid: defaultGrid,
    resetAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log(`OK   ${docSnap.id}: grid reset to default`);
}

async function main() {
  const project = process.env.FIREBASE_PROJECT_ID || "(unknown)";
  const onlyTeacher = process.env.TEACHER_ID || "";

  console.log(`Project: ${project}`);
  console.log(onlyTeacher ? `Targeting teacherId: ${onlyTeacher}` : "Targeting: ALL teachers");

  if (onlyTeacher) {
    const ref = db.collection("schedules").doc(onlyTeacher);
    const snap = await ref.get();
    if (!snap.exists) {
      console.log(`No schedules/${onlyTeacher} document found`);
      return;
    }
    await resetOneSchedule(snap);
    return;
  }

  const snap = await db.collection("schedules").get();
  if (snap.empty) {
    console.log("No schedules found.");
    return;
  }

  const batchSize = 400; // safety: update in chunks
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += batchSize) {
    const slice = docs.slice(i, i + batchSize);
    await Promise.all(slice.map(resetOneSchedule));
  }

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
