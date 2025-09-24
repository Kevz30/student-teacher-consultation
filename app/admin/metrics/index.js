// app/admin/metrics/index.js
import { collection, getDocs } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { LineChart, PieChart } from "react-native-chart-kit";
import db from "../../../constants/firestore";

const screenWidth = Dimensions.get("window").width;
const chartWidth = Math.max(230, Math.floor(screenWidth - 120));       // pie/line
const chartWidthSmall = Math.max(210, Math.floor(screenWidth - 140));  // stacked/scroll

const getOffice = (c) =>
  String(c?.form?.office ?? c?.office ?? c?.department ?? "").trim();

const toDate = (v) => {
  try {
    if (!v) return null;
    if (typeof v?.toDate === "function") return v.toDate();
    if (v?.seconds) return new Date(v.seconds * 1000);
    if (typeof v === "number") return new Date(v);
    if (typeof v === "string" && !Number.isNaN(Date.parse(v))) return new Date(v);
    return null;
  } catch {
    return null;
  }
};
const monthNow = () =>
  new Date().toLocaleString("en-US", { month: "short", year: "numeric" });
const dayOnly = (iso) => (iso && iso.length >= 10 ? iso.slice(8, 10) : iso || "");
const toISODate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

export default function MetricsScreen() {
  const [openDrop, setOpenDrop] = useState(false);
  const [selectedOffice, setSelectedOffice] = useState("All");

  const [consultations, setConsultations] = useState([]);
  const [classListStudentNos, setClassListStudentNos] = useState(new Set());
  const [registeredStudentNos, setRegisteredStudentNos] = useState(new Set());
  const [studentDeptMap, setStudentDeptMap] = useState(new Map()); // studentNumber -> dept
  const [instructors, setInstructors] = useState([]); // teachers
  const [offices, setOffices] = useState(["All"]);

  useEffect(() => {
    (async () => {
      // Consultations
      const cs = await getDocs(collection(db, "consultations"));
      const all = cs.docs.map((d) => ({ id: d.id, ...d.data() }));
      setConsultations(all);

      // Students (registered + dept mapping + offices)
      const studentsSnap = await getDocs(collection(db, "students"));
      const regNos = new Set();
      const deptMap = new Map();
      const officeSet = new Set(["All"]);

      studentsSnap.forEach((s) => {
        const data = s.data();
        const sn = data?.studentNumber && String(data.studentNumber);
        const dept = String(data?.department || data?.office || "").trim();
        if (sn) {
          regNos.add(sn);
          deptMap.set(sn, dept);
        }
        if (dept) officeSet.add(dept);
      });
      setRegisteredStudentNos(regNos);
      setStudentDeptMap(deptMap);

      // Instructors (to count teachers per *college*)
      try {
        const instSnap = await getDocs(collection(db, "instructors"));
        const inst = instSnap.docs.map((d) => d.data());
        setInstructors(inst);
        inst.forEach((t) => {
          const dept =
            String(t?.college || t?.department || t?.office || "").trim();
          if (dept) officeSet.add(dept);
        });
      } catch {
        setInstructors([]);
      }

      // Offices also from consultations
      all.forEach((c) => {
        const o = getOffice(c);
        if (o) officeSet.add(o);
      });
      setOffices([...officeSet].sort());

      // TeachersClasses → class-list studentNumbers
      const teachersSnap = await getDocs(collection(db, "TeachersClasses"));
      const allNos = new Set();
      for (const tDoc of teachersSnap.docs) {
        const classesSnap = await getDocs(
          collection(db, `TeachersClasses/${tDoc.id}/classes`)
        );
        classesSnap.forEach((cl) => {
          const arr = cl.data()?.students || [];
          arr.forEach((s) => s?.studentNumber && allNos.add(String(s.studentNumber)));
        });
      }
      setClassListStudentNos(allNos);
    })();
  }, []);

  // Filter by dropdown office/department
  const filtered = useMemo(() => {
    if (selectedOffice === "All") return consultations;
    return consultations.filter((c) => getOffice(c) === selectedOffice);
  }, [consultations, selectedOffice]);

  // 1) Consultation Request Rate
  const requestRate = useMemo(() => {
    const counts = { requested: 0, accepted: 0, declined: 0 };
    filtered.forEach((c) => {
      const st = c?.status || "";
      if (st === "signed_by_teacher") counts.accepted++;
      else if (st === "declined_by_teacher") counts.declined++;
      else counts.requested++;
    });
    return counts;
  }, [filtered]);

  // 2) Completion Rate
  const completionRate = useMemo(() => {
    const now = Date.now();
    let withOutcome = 0;
    let withoutOutcome = 0;
    filtered.forEach((c) => {
      if (c?.status === "declined_by_teacher") return;
      const start = toDate(c?.startAtMs) || toDate(c?.createdAt);
      const outcomeRequested = !!(c?.outcomeDispatched || c?.outcomeRequestedAt);
      if (!outcomeRequested) return;
      if (!start || start.getTime() > now) return;
      const submitted = !!c?.studentOutcome?.submittedAt;
      if (submitted) withOutcome++;
      else withoutOutcome++;
    });
    return { withOutcome, withoutOutcome };
  }, [filtered]);

  // 3) Avg Approval Time
  const approvalTime = useMemo(() => {
    const perDay = {};
    filtered.forEach((c) => {
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
    const minutes = labels.map((d) =>
      Math.round(perDay[d].total / perDay[d].n / 60000)
    );
    const overallAvg =
      minutes.length > 0
        ? Math.round(minutes.reduce((a, b) => a + b, 0) / minutes.length)
        : 0;
    return { labels, minutes, overallAvg };
  }, [filtered]);

  // 4) Teacher Analytics TABLE (adds Pending + consultantName fallback)
  const teacherRows = useMemo(() => {
    const map = {};
    filtered.forEach((c) => {
      const id = c?.teacherId;
      if (!id) return;
      const name = c?.form?.consultantName?.trim() || c?.teacherName?.trim() || id;

      map[id] = map[id] || { name, total: 0, acc: 0, dec: 0, pend: 0 };
      map[id].total += 1;
      if (c?.status === "signed_by_teacher") map[id].acc += 1;
      else if (c?.status === "declined_by_teacher") map[id].dec += 1;
      else map[id].pend += 1; // not signed yet = pending
    });

    const rows = Object.values(map);
    rows.forEach(
      (r) => (r.approvalPct = r.total ? Math.round((r.acc / r.total) * 100) : 0)
    );
    rows.sort((a, b) => b.total - a.total || b.approvalPct - a.approvalPct);
    return rows;
  }, [filtered]);

  // 5) Avg Consultations per Day (scrollable) + Pending
  const perDay = useMemo(() => {
    const dayMap = {};
    filtered.forEach((c) => {
      const d = toDate(c?.createdAt);
      if (!d) return;
      const key = c?.dateISO || d.toISOString().slice(0, 10);
      dayMap[key] = dayMap[key] || { total: 0, acc: 0, dec: 0, pend: 0 };
      dayMap[key].total++;
      if (c?.status === "signed_by_teacher") dayMap[key].acc++;
      else if (c?.status === "declined_by_teacher") dayMap[key].dec++;
      else dayMap[key].pend++; // not signed yet
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
  }, [filtered]);

  // 5) Today-only text (Accepted / Declined / Pending)
  const todayCounts = useMemo(() => {
    const todayISO = new Date().toISOString().slice(0, 10);
    let acc = 0,
      dec = 0,
      pen = 0;
    filtered.forEach((c) => {
      const created = toISODate(toDate(c?.createdAt));
      if (created !== todayISO) return;
      if (c?.status === "signed_by_teacher") acc++;
      else if (c?.status === "declined_by_teacher") dec++;
      else pen++;
    });
    return { acc, dec, pen };
  }, [filtered]);

  // 6) Registered Users (Students vs Teachers) — counts only, filtered
  const usersCounts = useMemo(() => {
    // Students by department
    let studentCount = 0;
    if (selectedOffice === "All") {
      studentCount = registeredStudentNos.size;
    } else {
      studentDeptMap.forEach((dept) => {
        if (dept === selectedOffice) studentCount++;
      });
    }
    // Teachers by college (fallback to department/office)
    let teacherCount = 0;
    instructors.forEach((t) => {
      const dept =
        String(t?.college || t?.department || t?.office || "").trim();
      if (selectedOffice === "All" || dept === selectedOffice) teacherCount++;
    });
    return { studentCount, teacherCount };
  }, [registeredStudentNos, studentDeptMap, instructors, selectedOffice]);

  // chart config
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

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Header + dropdown + count */}
      <View style={styles.filterRow}>
        <Text style={styles.header}>System Analytics</Text>
        <View style={{ flex: 1 }} />
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{filtered.length}</Text>
        </View>
        <View style={styles.dropdown}>
          <TouchableOpacity
            onPress={() => setOpenDrop((s) => !s)}
            style={styles.dropBtn}
            activeOpacity={0.8}
          >
            <Text style={styles.dropText}>{selectedOffice}</Text>
            <Text style={{ color: "#475569", fontSize: 11 }}>▾</Text>
          </TouchableOpacity>
          {openDrop && (
            <View style={styles.dropMenu}>
              {offices.map((o) => (
                <TouchableOpacity
                  key={o}
                  onPress={() => {
                    setSelectedOffice(o);
                    setOpenDrop(false);
                  }}
                  style={[
                    styles.dropItem,
                    selectedOffice === o && { backgroundColor: "#eef2ff" },
                  ]}
                >
                  <Text
                    style={[
                      styles.dropItemText,
                      selectedOffice === o && {
                        color: "#1d4ed8",
                        fontWeight: "700",
                      },
                    ]}
                  >
                    {o}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </View>

      {/* 1. Consultation Request Rate */}
      <View style={styles.card}>
        <Text style={styles.title}>1. Consultation Request Rate</Text>
        <View style={styles.chartWrap}>
          <PieChart
            data={[
              {
                name: "Requested",
                population: requestRate.requested,
                color: "#60a5fa",
                legendFontColor: "#374151",
                legendFontSize: 10,
              },
              {
                name: "Accepted",
                population: requestRate.accepted,
                color: "#22c55e",
                legendFontColor: "#374151",
                legendFontSize: 10,
              },
              {
                name: "Declined",
                population: requestRate.declined,
                color: "#ef4444",
                legendFontColor: "#374151",
                legendFontSize: 10,
              },
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
              {
                name: "With Outcome",
                population: completionRate.withOutcome,
                color: "#34d399",
                legendFontColor: "#374151",
                legendFontSize: 10,
              },
              {
                name: "No Outcome",
                population: completionRate.withoutOutcome,
                color: "#9ca3af",
                legendFontColor: "#374151",
                legendFontSize: 10,
              },
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
        <Text style={styles.titleSmall}>
          3. Avg Approval Time — {approvalTime.overallAvg} min
        </Text>
        {hasData(approvalTime.minutes) ? (
          <View style={styles.chartWrap}>
            <LineChart
              data={{
                labels: approvalTime.labels.map(dayOnly),
                datasets: [{ data: approvalTime.minutes }],
              }}
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

      {/* 4. Teacher Analytics — TABLE */}
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
              <Text style={[styles.td, { flex: 2 }]} numberOfLines={1}>
                {r.name}
              </Text>
              <Text style={styles.td}>{r.total}</Text>
              <Text style={[styles.td, { color: "#16a34a" }]}>{r.acc}</Text>
              <Text style={[styles.td, { color: "#dc2626" }]}>{r.dec}</Text>
              <Text style={[styles.td, { color: "#3b82f6" }]}>{r.pend}</Text>
              <Text style={styles.td}>{r.approvalPct}%</Text>
            </View>
          ))
        )}
      </View>

      {/* 5. Avg Consultations/Day — scrollable with Pending */}
      <View style={styles.card}>
        <Text style={styles.titleSmall}>
          5. Avg Consultations/Day — {perDay.avg}{" "}
          <Text style={styles.monthTag}>({monthNow()})</Text>
        </Text>

        <Text style={styles.subtitle}>
          Today — Accepted: {todayCounts.acc} | Declined: {todayCounts.dec} |
          Pending: {todayCounts.pen}
        </Text>

        {hasData(perDay.totals) ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ paddingRight: 8 }}>
              <LineChart
                data={{
                  labels: perDay.labels.map(dayOnly),
                  datasets: [
                    { data: perDay.acc, color: () => "#22c55e" }, // Accepted
                    { data: perDay.dec, color: () => "#ef4444" }, // Declined
                    { data: perDay.pend, color: () => "#3b82f6" }, // Pending
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
          Filtered by{" "}
          {selectedOffice === "All"
            ? "all departments/colleges"
            : selectedOffice}{" "}
          (Students by <Text style={{ fontWeight: "700" }}>Department</Text>,
          Teachers by <Text style={{ fontWeight: "700" }}>College</Text>)
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
          Total registered users:{" "}
          {usersCounts.studentCount + usersCounts.teacherCount}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  header: { fontSize: 18, fontWeight: "800", color: "#111827" },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    zIndex: 50,
  },
  badge: {
    backgroundColor: "#e2e8f0",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    marginRight: 8,
  },
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
    minWidth: 140,
    zIndex: 1000,
  },
  dropItem: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 },
  dropItemText: { color: "#111827", fontSize: 12 },

  card: {
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  title: { fontSize: 14, fontWeight: "700", marginBottom: 6, color: "#2563eb" },
  titleSmall: { fontSize: 13, fontWeight: "700", marginBottom: 6, color: "#2563eb" },
  subtitle: { fontSize: 11, color: "#6b7280", marginBottom: 6 },
  monthTag: { fontSize: 12, color: "#64748b" },
  chartWrap: { alignItems: "center" },
  empty: { color: "#9ca3af", fontSize: 12 },

  // table
  tableHeader: {
    flexDirection: "row",
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
    marginBottom: 4,
  },
  th: { flex: 1, fontSize: 11, fontWeight: "700", color: "#0f172a" },
  tr: {
    flexDirection: "row",
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#f1f5f9",
  },
  td: { flex: 1, fontSize: 11, color: "#111827" },
});
