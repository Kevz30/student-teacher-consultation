// app/unit-head/metrics/index.js
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { LineChart, PieChart } from "react-native-chart-kit";
import auth from "../../../constants/auth";
import db from "../../../constants/firestore";

const screenWidth = Dimensions.get("window").width;
const chartWidth = Math.max(230, Math.floor(screenWidth - 120));
const chartWidthSmall = Math.max(210, Math.floor(screenWidth - 140));

const norm = (s = "") => String(s).trim().toLowerCase();
const toDate = (v) => {
  try {
    if (!v) return null;
    if (typeof v?.toDate === "function") return v.toDate();
    if (v?.seconds) return new Date(v.seconds * 1000);
    if (typeof v === "number") return new Date(v);
    if (typeof v === "string" && !Number.isNaN(Date.parse(v))) return new Date(v);
    return null;
  } catch { return null; }
};
const monthNow = () =>
  new Date().toLocaleString("en-US", { month: "short", year: "numeric" });
const dayOnly = (iso) => (iso && iso.length >= 10 ? iso.slice(8, 10) : iso || "");
const toISODate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

export default function UnitHeadMetrics() {
  // Scope
  const [scopeCourse, setScopeCourse] = useState(null);   // e.g. "BSIT"
  const [scopeCollege, setScopeCollege] = useState(null); // e.g. "DCS"

  // Course dropdown (only for college scope)
  const [courseOptions, setCourseOptions] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState("All Courses");
  const [openCourseDrop, setOpenCourseDrop] = useState(false);

  // Data
  const [consultations, setConsultations] = useState([]);
  const [instructors, setInstructors] = useState([]);
  const [registeredStudentNos, setRegisteredStudentNos] = useState(new Set());

  // Maps
  const instructorCourseMapRef = useRef(new Map());  // teacherId -> course
  const instructorCollegeMapRef = useRef(new Map()); // teacherId -> college
  const [coursesByCollege, setCoursesByCollege] = useState(new Map()); // collegeLower -> Set(programLower)

  // ===== Load UH scope =====
  useEffect(() => {
    (async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const snap = await getDoc(doc(db, "users", uid));
      const u = snap.exists() ? snap.data() : {};

      const course =
        u.targetCourse || u.targetCourese || u.course || u.unitScope?.course || null;
      const college = course ? null : (u.college || u.unitScope?.college || null);

      if (course) { setScopeCourse(course); setScopeCollege(null); }
      else if (college) { setScopeCourse(null); setScopeCollege(college); }
    })();
  }, []);

  // ===== Load full courses mapping (for membership checks) =====
  useEffect(() => {
    (async () => {
      try {
        const cs = await getDocs(collection(db, "courses"));
        const map = new Map();
        cs.forEach((d) => {
          const col = norm(d.id);
          const list = Array.isArray(d.data()?.list) ? d.data().list : [];
          const set = new Set(list.map(norm));
          map.set(col, set);
        });
        setCoursesByCollege(map);
      } catch {}
    })();
  }, []);

  const belongsToOffice = (program, office) => {
    const set = coursesByCollege.get(norm(office));
    if (!set) return false;
    return set.has(norm(program));
  };

  // ===== Build course options for college scope =====
  useEffect(() => {
    (async () => {
      if (!scopeCollege || scopeCourse) return;

      const baseSet = new Set();
      // official list from /courses/{college}
      const official = coursesByCollege.get(norm(scopeCollege));
      if (official) official.forEach((p) => baseSet.add(p));

      // also include teachers' courses in that college
      try {
        const instSnap = await getDocs(query(collection(db, "instructors"), orderBy("displayName", "asc")));
        instSnap.forEach((d) => {
          const t = d.data();
          if (norm(t.college || t.department || "") === norm(scopeCollege) && t.course) {
            baseSet.add(norm(t.course));
          }
        });
      } catch {}

      const options = ["All Courses", ...[...baseSet]
        .map((p) => p.toUpperCase())
        .sort((a, b) => a.localeCompare(b))];
      setCourseOptions(options);
      setSelectedCourse("All Courses");
    })();
  }, [scopeCollege, scopeCourse, coursesByCollege]);

  // ===== Fetch instructors → maps, then scoped consultations & students =====
  useEffect(() => {
    if (!scopeCourse && !scopeCollege) return;

    (async () => {
      // 1) Instructors
      const instSnap = await getDocs(query(collection(db, "instructors"), orderBy("displayName", "asc")));
      const allTeachers = instSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const cMap = new Map();
      const colMap = new Map();
      allTeachers.forEach((t) => {
        cMap.set(t.id, String(t.course || ""));
        colMap.set(t.id, String(t.college || t.department || ""));
      });
      instructorCourseMapRef.current = cMap;
      instructorCollegeMapRef.current = colMap;

      const scopedTeachers = allTeachers.filter((t) => {
        if (scopeCourse) return norm(t.course || "") === norm(scopeCourse);
        const inCollege = norm(t.college || "") === norm(scopeCollege);
        if (!inCollege) return false;
        if (selectedCourse !== "All Courses")
          return norm(t.course || "") === norm(selectedCourse);
        return true;
      });
      setInstructors(scopedTeachers);

      // 2) Consultations (apply office↔program rule)
      const cs = await getDocs(collection(db, "consultations"));
      const filtered = cs.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((c) => {
          const office = c?.form?.office || c?.office || c?.department || "";
          const program = c?.form?.program || c?.program || c?.form?.course || c?.course || "";
          const tId = c?.teacherId;
          const tCourse = instructorCourseMapRef.current.get(tId) || "";
          const tCollege = instructorCollegeMapRef.current.get(tId) || "";

          // decide effective course for college views
          const programBelongs = office ? belongsToOffice(program, office) : false;
          const effectiveCourse = programBelongs ? program : (tCourse || program);

          if (scopeCourse) {
            // COURSE scope:
            // keep only rows whose program matches UH course AND
            // (no office OR program indeed belongs to that office)
            if (norm(program) !== norm(scopeCourse)) return false;
            if (office && !belongsToOffice(program, office)) return false;
            return true;
          }

          // COLLEGE scope:
          if (norm(office) !== norm(scopeCollege)) return false;
          if (selectedCourse !== "All Courses")
            return norm(effectiveCourse) === norm(selectedCourse);
          return true;
        });

      setConsultations(filtered);

      // 3) Students — scoped
      const studentsSnap = await getDocs(collection(db, "students"));
      const reg = new Set();
      studentsSnap.forEach((s) => {
        const st = s.data();
        const dept = st?.department || st?.office || "";
        const prog = st?.course || st?.program || "";
        const sn = st?.studentNumber && String(st.studentNumber);

        const keep = scopeCourse
          ? norm(prog) === norm(scopeCourse)
          : norm(dept) === norm(scopeCollege) &&
            (selectedCourse === "All Courses" || norm(prog) === norm(selectedCourse));

        if (keep && sn) reg.add(sn);
      });
      setRegisteredStudentNos(reg);
    })();
  }, [scopeCourse, scopeCollege, selectedCourse, coursesByCollege]);

  // ---------- Metrics ----------
  const requestRate = useMemo(() => {
    const counts = { requested: 0, accepted: 0, declined: 0 };
    consultations.forEach((c) => {
      const st = c?.status || "";
      if (st === "signed_by_teacher") counts.accepted++;
      else if (st === "declined_by_teacher") counts.declined++;
      else counts.requested++;
    });
    return counts;
  }, [consultations]);

  const completionRate = useMemo(() => {
    const now = Date.now();
    let withOutcome = 0, withoutOutcome = 0;
    consultations.forEach((c) => {
      if (c?.status === "declined_by_teacher") return;
      const start = toDate(c?.startAtMs) || toDate(c?.createdAt);
      const requested = !!(c?.outcomeDispatched || c?.outcomeRequestedAt);
      if (!requested || !start || start.getTime() > now) return;
      const submitted = !!c?.studentOutcome?.submittedAt;
      if (submitted) withOutcome++; else withoutOutcome++;
    });
    return { withOutcome, withoutOutcome };
  }, [consultations]);

  const approvalTime = useMemo(() => {
    const perDay = {};
    consultations.forEach((c) => {
      if (c?.status !== "signed_by_teacher") return;
      const created = toDate(c?.createdAt);
      const signed = toDate(c?.signedAt) || toDate(c?.teacherSignature?.ts);
      if (!created || !signed) return;
      const diff = signed.getTime() - created.getTime();
      if (!Number.isFinite(diff) || diff < 0) return;
      const key = c?.dateISO || created.toISOString().slice(0, 10);
      perDay[key] = perDay[key] || { total: 0, n: 0 };
      perDay[key].total += diff;
      perDay[key].n += 1;
    });
    const labels = Object.keys(perDay).sort();
    const minutes = labels.map((d) => Math.round(perDay[d].total / perDay[d].n / 60000));
    const overallAvg =
      minutes.length > 0 ? Math.round(minutes.reduce((a, b) => a + b, 0) / minutes.length) : 0;
    return { labels, minutes, overallAvg };
  }, [consultations]);

  // Teacher Analytics from filtered consultations
  const teacherRows = useMemo(() => {
    const map = {};
    consultations.forEach((c) => {
      const id = c?.teacherId;
      if (!id) return;
      const name = c?.form?.nameClient?.trim() // (typo safeguard)
        ? c?.form?.consultantName?.trim() || c?.teacherName?.trim() || id
        : c?.form?.consultantName?.trim() || c?.teacherName?.trim() || id;
      map[id] = map[id] || { name, total: 0, acc: 0, dec: 0, pend: 0 };
      map[id].total += 1;
      if (c?.status === "signed_by_teacher") map[id].acc += 1;
      else if (c?.status === "declined_by_teacher") map[id].dec += 1;
      else map[id].pend += 1;
    });
    const rows = Object.values(map);
    rows.forEach((r) => (r.approvalPct = r.total ? Math.round((r.acc / r.total) * 100) : 0));
    rows.sort((a, b) => b.total - a.total || b.approvalPct - a.approvalPct);
    return rows;
  }, [consultations]);

  const perDay = useMemo(() => {
    const dayMap = {};
    consultations.forEach((c) => {
      const d = toDate(c?.createdAt);
      if (!d) return;
      const key = c?.dateISO || d.toISOString().slice(0, 10);
      dayMap[key] = dayMap[key] || { total: 0, acc: 0, dec: 0, pend: 0 };
      dayMap[key].total++;
      if (c?.status === "signed_by_teacher") dayMap[key].acc++;
      else if (c?.status === "declined_by_teacher") dayMap[key].dec++;
      else dayMap[key].pend++;
    });
    const labels = Object.keys(dayMap).sort();
    const totals = labels.map((k) => dayMap[k].total);
    const acc = labels.map((k) => dayMap[k].acc);
    const dec = labels.map((k) => dayMap[k].dec);
    const pend = labels.map((k) => dayMap[k].pend);
    const avg =
      totals.length > 0
        ? (totals.reduce((a, b) => a + b, 0) / totals.length).toFixed(1)
        : "0.0";
    return { labels, totals, acc, dec, pend, avg };
  }, [consultations]);

  const todayCounts = useMemo(() => {
    const todayISO = new Date().toISOString().slice(0, 10);
    let acc = 0, dec = 0, pen = 0;
    consultations.forEach((c) => {
      const created = toISODate(toDate(c?.createdAt));
      if (created !== todayISO) return;
      if (c?.status === "signed_by_teacher") acc++;
      else if (c?.status === "declined_by_teacher") dec++;
      else pen++;
    });
    return { acc, dec, pen };
  }, [consultations]);

  const usersCounts = useMemo(() => ({
    studentCount: registeredStudentNos.size,
    teacherCount: instructors.length,
  }), [registeredStudentNos, instructors]);

  const chartConfig = {
    backgroundGradientFrom: "#fff",
    backgroundGradientTo: "#fff",
    decimalPlaces: 0,
    color: (o = 1) => `rgba(37,99,235,${o})`,
    labelColor: (o = 1) => `rgba(55,65,81,${o})`,
    propsForLabels: { fontSize: 9 },
  };
  const hasData = (arrOrObj) =>
    Array.isArray(arrOrObj)
      ? arrOrObj.some((v) => Number(v) > 0)
      : Object.values(arrOrObj || {}).some((v) => Number(v) > 0);

  const scopeLabel = scopeCourse
    ? `${scopeCourse} (course scope)`
    : scopeCollege
    ? `${scopeCollege} (college scope)`
    : "(no scope)";

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Header + count + course dropdown (college scope only) */}
      <View style={styles.filterRow}>
        <Text style={styles.header}>Metrics — {scopeLabel}</Text>
        <View style={{ flex: 1 }} />
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{consultations.length}</Text>
        </View>

        {!scopeCourse && scopeCollege && courseOptions.length > 0 && (
          <View style={styles.dropdown}>
            <TouchableOpacity
              onPress={() => setOpenCourseDrop((s) => !s)}
              style={styles.dropBtn}
              activeOpacity={0.8}
            >
              <Text style={styles.dropText}>{selectedCourse}</Text>
              <Text style={{ color: "#475569", fontSize: 11 }}>▾</Text>
            </TouchableOpacity>
            {openCourseDrop && (
              <View style={styles.dropMenu}>
                {courseOptions.map((o) => (
                  <TouchableOpacity
                    key={o}
                    onPress={() => { setSelectedCourse(o); setOpenCourseDrop(false); }}
                    style={[
                      styles.dropItem,
                      selectedCourse === o && { backgroundColor: "#eef2ff" },
                    ]}
                  >
                    <Text
                      style={[
                        styles.dropItemText,
                        selectedCourse === o && { color: "#1d4ed8", fontWeight: "700" },
                      ]}
                    >
                      {o}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}
      </View>

      {/* 1. Consultation Request Rate */}
      <View style={styles.card}>
        <Text style={styles.title}>1. Consultation Request Rate</Text>
        <View style={styles.chartWrap}>
          <PieChart
            data={[
              { name: "Requested", population: requestRate.requested, color: "#60a5fa", legendFontColor: "#374151", legendFontSize: 10 },
              { name: "Accepted",  population: requestRate.accepted,  color: "#22c55e", legendFontColor: "#374151", legendFontSize: 10 },
              { name: "Declined",  population: requestRate.declined,  color: "#ef4444", legendFontColor: "#374151", legendFontSize: 10 },
            ]}
            width={chartWidth}
            height={145}
            chartConfig={chartConfig}
            accessor="population"
            backgroundColor="transparent"
            paddingLeft="6"
          />
        </View>
      </View>

      {/* 2. Completion Rate */}
      <View style={styles.card}>
        <Text style={styles.title}>2. Completion Rate</Text>
        <View style={styles.chartWrap}>
          <PieChart
            data={[
              { name: "With Outcome", population: completionRate.withOutcome,  color: "#34d399", legendFontColor: "#374151", legendFontSize: 10 },
              { name: "No Outcome",  population: completionRate.withoutOutcome, color: "#9ca3af", legendFontColor: "#374151", legendFontSize: 10 },
            ]}
            width={chartWidth}
            height={145}
            chartConfig={chartConfig}
            accessor="population"
            backgroundColor="transparent"
            paddingLeft="6"
          />
        </View>
      </View>

      {/* 3. Avg Approval Time */}
      <View style={styles.card}>
        <Text style={styles.titleSmall}>3. Avg Approval Time — {approvalTime.overallAvg} min</Text>
        {hasData(approvalTime.minutes) ? (
          <View style={styles.chartWrap}>
            <LineChart
              data={{ labels: approvalTime.labels.map(dayOnly), datasets: [{ data: approvalTime.minutes }] }}
              width={chartWidth}
              height={160}
              yLabelsOffset={6}
              chartConfig={chartConfig}
            />
          </View>
        ) : (
          <Text style={styles.empty}>No approvals yet.</Text>
        )}
      </View>

      {/* 4. Teacher Analytics */}
      <View style={styles.card}>
        <Text style={styles.title}>4. Teacher Analytics</Text>
        <Text style={styles.subtitle}>
          Consultations, approvals, declines, pending, approval %
        </Text>

        <View style={styles.tableHeader}>
          <Text style={[styles.th, { flex: 2 }]}>Teacher</Text>
          <Text style={styles.th}>Total</Text>
          <Text style={[styles.th, { color: "#16a34a" }]}>Approved</Text>
          <Text style={[styles.th, { color: "#dc2626" }]}>Declined</Text>
          <Text style={[styles.th, { color: "#3b82f6" }]}>Pending</Text>
          <Text style={styles.th}>%</Text>
        </View>

        {teacherRows.length === 0 ? (
          <Text style={styles.empty}>No teacher activity yet.</Text>
        ) : (
          teacherRows.map((r, i) => (
            <View key={i} style={styles.tr}>
              <Text style={[styles.td, { flex: 2 }]} numberOfLines={1}>{r.name}</Text>
              <Text style={styles.td}>{r.total}</Text>
              <Text style={[styles.td, { color: "#16a34a" }]}>{r.acc}</Text>
              <Text style={[styles.td, { color: "#dc2626" }]}>{r.dec}</Text>
              <Text style={[styles.td, { color: "#3b82f6" }]}>{r.pend}</Text>
              <Text style={styles.td}>{r.approvalPct}%</Text>
            </View>
          ))
        )}
      </View>

      {/* 5. Avg Consultations/Day */}
      <View style={styles.card}>
        <Text style={styles.titleSmall}>
          5. Avg Consultations/Day — {perDay.avg} <Text style={styles.monthTag}>({monthNow()})</Text>
        </Text>
        <Text style={styles.subtitle}>
          Today — Accepted: {todayCounts.acc} | Declined: {todayCounts.dec} | Pending: {todayCounts.pen}
        </Text>
        {hasData(perDay.totals) ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ paddingRight: 8 }}>
              <LineChart
                data={{
                  labels: perDay.labels.map(dayOnly),
                  datasets: [
                    { data: perDay.acc,  color: () => "#22c55e" },
                    { data: perDay.dec,  color: () => "#ef4444" },
                    { data: perDay.pend, color: () => "#3b82f6" },
                  ],
                  legend: ["Accepted", "Declined", "Pending"],
                }}
                width={Math.max(chartWidthSmall, perDay.labels.length * 46)}
                height={180}
                chartConfig={chartConfig}
                bezier
              />
            </View>
          </ScrollView>
        ) : (
          <Text style={styles.empty}>No consultations yet.</Text>
        )}
      </View>

      {/* 6. Registered Users — COUNTS ONLY */}
      <View style={styles.card}>
        <Text style={styles.title}>6. Registered Users</Text>
        <Text style={styles.subtitle}>
          Students by <Text style={{ fontWeight: "700" }}>Department</Text>, Teachers by{" "}
          <Text style={{ fontWeight: "700" }}>College</Text>
        </Text>

        <View style={styles.tableHeader}>
          <Text style={[styles.th, { flex: 2 }]}>Type</Text>
          <Text style={styles.th}>Count</Text>
        </View>
        <View style={styles.tr}>
          <Text style={[styles.td, { flex: 2 }]}>Students (registered)</Text>
          <Text style={styles.td}>{usersCounts.studentCount}</Text>
        </View>
        <View style={styles.tr}>
          <Text style={[styles.td, { flex: 2 }]}>Teachers</Text>
          <Text style={styles.td}>{usersCounts.teacherCount}</Text>
        </View>

        <Text style={[styles.subtitle, { marginTop: 6 }]}>
          Total registered users: {usersCounts.studentCount + usersCounts.teacherCount}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  header: { fontSize: 18, fontWeight: "800", color: "#111827" },
  filterRow: { flexDirection: "row", alignItems: "center", marginBottom: 10, zIndex: 50 },
  badge: { backgroundColor: "#e2e8f0", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, marginRight: 8 },
  badgeText: { fontSize: 11, color: "#0f172a", fontWeight: "700" },

  dropdown: { position: "relative", zIndex: 100 },
  dropBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "#eef2ff",
    elevation: 3,
  },
  dropText: { color: "#1d4ed8", fontWeight: "700", fontSize: 12 },
  dropMenu: {
    position: "absolute",
    right: 0,
    top: 40,
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingVertical: 4,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 12,
    minWidth: 160,
    zIndex: 1000,
  },
  dropItem: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 },
  dropItemText: { color: "#111827", fontSize: 12 },

  card: { backgroundColor: "#fff", padding: 12, borderRadius: 12, marginBottom: 12, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  title: { fontSize: 14, fontWeight: "700", marginBottom: 6, color: "#2563eb" },
  titleSmall: { fontSize: 13, fontWeight: "700", marginBottom: 6, color: "#2563eb" },
  subtitle: { fontSize: 11, color: "#6b7280", marginBottom: 6 },
  monthTag: { fontSize: 12, color: "#64748b" },
  chartWrap: { alignItems: "center" },
  empty: { color: "#9ca3af", fontSize: 12 },

  tableHeader: { flexDirection: "row", paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "#e5e7eb", marginBottom: 4 },
  th: { flex: 1, fontSize: 11, fontWeight: "700", color: "#0f172a" },
  tr: { flexDirection: "row", paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "#f1f5f9" },
  td: { flex: 1, fontSize: 11, color: "#111827" },
});
