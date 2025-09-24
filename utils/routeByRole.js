// app/utils/routeByRole.js
import { router } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import db from "../constants/firestore";

export default async function routeByRole(uid) {
  // 1) Student?
  const studentSnap = await getDoc(doc(db, "students", uid));
  if (studentSnap.exists()) {
    router.replace("/student-dashboard");
    return "student";
  }

  // 2) Teacher? (status: pending/approved)
  const instrSnap = await getDoc(doc(db, "instructors", uid));
  if (instrSnap.exists()) {
    const status = (instrSnap.data()?.status || "").toLowerCase();
    if (status === "approved") {
      router.replace("/teacher-dashboard");
      return "teacher";
    } else {
      router.replace("/screens/PendingApprovalScreen");
      return "pending";
    }
  }

  // 3) Admin / Unit Head
  const userSnap = await getDoc(doc(db, "users", uid));
  if (userSnap.exists()) {
    const u = userSnap.data() || {};
    const roleStr = (u.role || "").toString().toLowerCase();
    const mapRole =
      u.roles?.admin ? "admin" :
      (u.roles?.unitHead || u.roles?.unit_head) ? "unit_head" : null;

    const role =
      roleStr === "admin" ? "admin" :
      (roleStr === "unit_head" || roleStr === "unithead") ? "unit_head" :
      mapRole;

    if (role === "admin") { router.replace("/admin/index"); return "admin"; }
    if (role === "unit_head") { router.replace("/unit-head/index"); return "unit_head"; }
  }

  router.replace("/screens/LoginScreen");
  return "login";
}
