import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
} from "firebase/firestore";
import db from "../constants/firestore";

export const matchStudentToClasses = async (studentUid) => {
  try {
    // 1️⃣ Read the student profile
    const studentRef = doc(db, "students", studentUid);
    const studentSnap = await getDoc(studentRef);
    if (!studentSnap.exists()) throw new Error("Student not found.");

    const { studentNumber, course: studentCourse } = studentSnap.data();
    if (!studentNumber) throw new Error("No studentNumber on student doc.");
    if (!studentCourse) throw new Error("No course on student doc.");

    console.log(
      "🔎 Matching:",
      studentNumber,
      "in course:",
      studentCourse
    );

    const matchedClasses = [];

    // 2️⃣ Loop over every instructor profile
    const instructorsSnap = await getDocs(collection(db, "instructors"));
    console.log("Found instructors:", instructorsSnap.docs.length);

    for (const instDoc of instructorsSnap.docs) {
      const instructorId = instDoc.id;

      // 3️⃣ Fetch that instructor’s classes from TeachersClasses
      const classesSnap = await getDocs(
        collection(db, "TeachersClasses", instructorId, "classes")
      );

      for (const classDoc of classesSnap.docs) {
        const classData = classDoc.data();

        // skip if not the student’s course
        if (classData.course !== studentCourse) continue;

        // if the studentNumber is in this class’s roster, record it
        if (
          (classData.students || []).some(
            (s) => s.studentNumber.trim() === studentNumber.trim()
          )
        ) {
          matchedClasses.push({
            teacherId: instructorId,
            classId: classDoc.id,
            subjectCode: classData.subjectCode || "",
            course: classData.course,
            section: classData.section,
          });
          console.log(
            `✔ Matched in ${instructorId}/${classDoc.id}`
          );
        }
      }
    }

    // 4️⃣ Write matches back into students/{uid}
    await setDoc(studentRef, { matchedClasses }, { merge: true });
    console.log("✅ Updated matchedClasses:", matchedClasses);
  } catch (err) {
    console.error("❌ Matching error:", err);
  }
};
