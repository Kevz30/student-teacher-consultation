// components/ScheduleGrid.js
import {
    addDoc,
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    serverTimestamp,
    setDoc,
    where
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import {
    Alert,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import db from "../constants/firestore";
import { TIMESLOTS, WEEKDAYS } from "../utils/scheduleTemplate";

/* ---------- small utils ---------- */
const normalize = (str = "") =>
  String(str).replace(/–/g, "-").replace(/\s+/g, "").toLowerCase();

const CELL_H = 30;
const MIN_COL_W = 44;
const TIME_W = 72;
const SEP = "#d1d5db";

/* ---------- time helpers (same logic as TeacherConsultModal) ---------- */
const DAY_INDEX = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
  Thursday: 4, Friday: 5, Saturday: 6,
};

function parseRange(range = "") {
  const [s, e] = String(range).split("-").map((t) => t.trim());
  const [shRaw, smRaw] = (s || "").split(":");
  const [ehRaw, emRaw] = (e || "").split(":");
  const sh = Number(shRaw), sm = Number(smRaw ?? 0);
  const eh = Number(ehRaw), em = Number(emRaw ?? 0);
  return {
    sh: Number.isFinite(sh) ? sh : 0,
    sm: Number.isFinite(sm) ? sm : 0,
    eh: Number.isFinite(eh) ? eh : 0,
    em: Number.isFinite(em) ? em : 0,
  };
}

function computeSlotMs(dayLabel, timeRange) {
  const { sh, sm, eh, em } = parseRange(timeRange);
  const now = new Date();
  const target = new Date(now);
  const want = DAY_INDEX[dayLabel] ?? now.getDay();
  const diffDays = (want - now.getDay() + 7) % 7;
  target.setHours(0, 0, 0, 0);
  target.setDate(target.getDate() + diffDays);

  const start = new Date(target);
  start.setHours(sh, sm, 0, 0);

  const end = new Date(target);
  end.setHours(eh, em, 0, 0);

  if (diffDays === 0 && end.getTime() <= now.getTime()) {
    start.setDate(start.getDate() + 7);
    end.setDate(end.getDate() + 7);
  }

  const yyyy = start.getFullYear();
  const mm = String(start.getMonth() + 1).padStart(2, "0");
  const dd = String(start.getDate()).padStart(2, "0");
  return { startAtMs: start.getTime(), endAtMs: end.getTime(), dateISO: `${yyyy}-${mm}-${dd}` };
}

/** Resolve actual keys in the schedule grid even if labels differ by spaces/dashes/case */
function resolveGridKeys(gridObj, dayLabel, timeLabel) {
  const grid = gridObj || {};
  const dayKeys = Object.keys(grid);
  const dayKey = dayKeys.find((k) => normalize(k) === normalize(dayLabel)) || dayLabel;
  const slots = grid[dayKey] || {};
  const slotKeys = Object.keys(slots);
  const slotKey = slotKeys.find((k) => normalize(k) === normalize(timeLabel)) || timeLabel;
  return { dayKey, slotKey };
}

/* ---------- format helpers ---------- */
const formatMethods = (m = {}) => {
  const items = [];
  if (m.video) items.push("Video Conferencing");
  if (m.email) items.push("Email");
  if (m.social) items.push("Social Media Platform");
  if (m.text) items.push("Text Messages");
  if (m.others) items.push(m.othersText ? `Others (${m.othersText})` : "Others");
  return items.join(", ");
};

export default function ScheduleGrid({
  grid,
  onSelectBlock,
  readonly = false,
  onRequestBlock,
  consultationMap,
  onOpenTeacherConsultModal,
  onCancelSchedule, // (day, slot, reason)
  /* NEW: we need the teacher id to write grid + consultation */
  teacherId,
}) {
  const [selected, setSelected] = useState(null);
  const [wrapWidth, setWrapWidth] = useState(0);

  // cancel modal
  const [cancelData, setCancelData] = useState({
    visible: false,
    day: null,
    slot: null,
    reason: "",
    loading: false,
    // details (if we found consultation)
    consult: null,
  });

  // NEW: schedule-by-teacher modal (green)
  const [schedModal, setSchedModal] = useState({
    visible: false,
    day: null,
    slot: null,
  });

  const isEditable = !readonly && typeof onSelectBlock === "function";

  /* ---------- teacher actions on a cell ---------- */
  const handlePressTeacher = (day, slot, color) => {
    if (readonly) return;

    // yellow OR green → open consult details modal
    if (color === "yellow" || color === "green") {
      const dayKey = normalize(day);
      const timeKey = normalize(slot);
      const cid =
        consultationMap?.[dayKey]?.[timeKey] ??
        consultationMap?.[day]?.[slot] ??
        null;
      if (typeof onOpenTeacherConsultModal === "function") {
        onOpenTeacherConsultModal({ day, slot, consultationId: cid });
      }
      return;
    }

    // blue → cancel schedule
    if (color === "blue") {
      // try to load the existing consultation details if available
      const dayKey = normalize(day);
      const timeKey = normalize(slot);
      const cid =
        consultationMap?.[dayKey]?.[timeKey] ??
        consultationMap?.[day]?.[slot] ??
        null;

      setCancelData({ visible: true, day, slot, reason: "", loading: false, consult: null });

      if (cid) {
        // grab details so we can show Student/Method/Nature in the cancel sheet
        getDoc(doc(db, "consultations", cid))
          .then((snap) => {
            if (snap.exists()) {
              setCancelData((s) => ({ ...s, consult: { id: snap.id, ...snap.data() } }));
            }
          })
          .catch(() => {});
      }
      return;
    }

    // others (white/red) → manual status menu
    if (isEditable) setSelected({ day, slot });
  };

  const handleChange = (newColor) => {
    if (selected && isEditable) {
      onSelectBlock?.(selected.day, selected.slot, newColor);
      setSelected(null);
    }
  };

  const confirmCancel = async () => {
    if (!cancelData.reason.trim()) {
      Alert.alert("Reason required", "Please provide a reason for cancelling.");
      return;
    }
    if (typeof onCancelSchedule !== "function") {
      Alert.alert("Not configured", "Cancel handler not provided.");
      return;
    }
    try {
      setCancelData((s) => ({ ...s, loading: true }));
      await onCancelSchedule(cancelData.day, cancelData.slot, cancelData.reason.trim());
      setCancelData({ visible: false, day: null, slot: null, reason: "", loading: false, consult: null });
    } catch (e) {
      Alert.alert("Cancel failed", String(e?.message || e));
      setCancelData((s) => ({ ...s, loading: false }));
    }
  };

  const OptionButton = ({ bg, label, onPress, disabled = false, textColor }) => (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={{
        backgroundColor: bg,
        paddingVertical: 12,
        paddingHorizontal: 14,
        marginVertical: 6,
        borderRadius: 10,
        alignItems: "center",
        opacity: disabled ? 0.6 : 1,
        borderWidth: bg === "white" ? 1 : 0,
        borderColor: "#e5e7eb",
        shadowColor: "#000",
        shadowOpacity: 0.15,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 6,
        elevation: 2,
      }}
    >
      <Text style={{ fontWeight: "700", color: textColor ?? (bg === "white" ? "#111" : "#fff") }}>
        {label}
      </Text>
    </Pressable>
  );

  const available = Math.max(0, wrapWidth - TIME_W);
  const colW = Math.max(MIN_COL_W, Math.floor(available / WEEKDAYS.length || MIN_COL_W));

  /* ===========================================================
     NEW: Schedule-a-student (green) implementation
  ============================================================*/
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState([]); // [{id, displayName, studentNumber, yearSection, program}]
  const [chosen, setChosen] = useState(null);
  const [methods, setMethods] = useState({ video: false, email: false, social: false, text: false, others: false, othersText: "" });
  const [saving, setSaving] = useState(false);

  // NEW: cache all students when the modal opens (so we can do local, live search by name)
  const [studentsCache, setStudentsCache] = useState([]);
  useEffect(() => {
    const loadStudents = async () => {
      if (!schedModal.visible) return;
      try {
        setSearching(true);
        const snap = await getDocs(collection(db, "students"));
        const arr = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
        setStudentsCache(arr);
      } catch (e) {
        Alert.alert("Load students failed", String(e?.message || e));
      } finally {
        setSearching(false);
      }
    };
    loadStudents();
  }, [schedModal.visible]);

  // NEW: live filter by name (displayName/fullName/name) as the teacher types
  useEffect(() => {
    const term = search.trim().toLowerCase();
    if (!schedModal.visible || !term || chosen) {
      setResults([]);
      return;
    }
    const filtered = studentsCache.filter((s) => {
      const nm = String(s.displayName || s.fullName || s.name || "").toLowerCase();
      return nm.includes(term);
    });
    setResults(filtered.slice(0, 30));
  }, [search, studentsCache, schedModal.visible, chosen]);

  const methodText = useMemo(() => formatMethods(methods), [methods]);
  const anyMethod = methods.video || methods.email || methods.social || methods.text || methods.others;

  // keep your original function (not used now) per “don’t remove anything”
  const runSearch = async () => {
    const term = search.trim();
    if (!term) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const out = [];
      const q2 = query(collection(db, "students"), where("displayName", "==", term));
      const s2 = await getDocs(q2);
      s2.forEach((d) => out.push({ id: d.id, ...(d.data() || {}) }));
      const q3 = query(collection(db, "students"), where("fullName", "==", term));
      const s3 = await getDocs(q3);
      s3.forEach((d) => {
        if (!out.find((x) => x.id === d.id)) out.push({ id: d.id, ...(d.data() || {}) });
      });
      setResults(out);
    } catch (e) {
      Alert.alert("Search error", String(e?.message || e));
    } finally {
      setSearching(false);
    }
  };

  const toggle = (key) => setMethods((m) => ({ ...m, [key]: !m[key] }));

  const handleSchedulePress = () => {
    // quick validations
    if (!teacherId) {
      Alert.alert("Missing teacherId", "Please pass teacherId to ScheduleGrid.");
      return;
    }
    if (!chosen?.id) {
      Alert.alert("Student required", "Please choose a student.");
      return;
    }
    if (!anyMethod) {
      Alert.alert("Method required", "Please choose at least one method.");
      return;
    }

    Alert.alert(
      "Confirm schedule",
      "Are these details final? The student will be notified.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Yes, Schedule", style: "default", onPress: confirmSchedule },
      ]
    );
  };

  const confirmSchedule = async () => {
    if (!teacherId) { Alert.alert("Missing teacherId", "Please pass teacherId to ScheduleGrid."); return; }
    if (!chosen?.id) { Alert.alert("Student required", "Please choose a student."); return; }
    if (!anyMethod) { Alert.alert("Method required", "Please choose at least one method."); return; }

    // ⭐ optimistic: turn the cell green right away
    const prevColor = (grid?.[schedModal.day]?.[schedModal.slot]) || "white";
    onSelectBlock?.(schedModal.day, schedModal.slot, "green");

    try {
      setSaving(true);

      // teacher display name (for form/notifications)
      let teacherName = "Instructor";
      try {
        const tSnap = await getDoc(doc(db, "instructors", teacherId));
        if (tSnap.exists()) {
          const t = tSnap.data() || {};
          teacherName = t.displayName || t.fullName || teacherName;
        }
      } catch {}

      const { startAtMs, endAtMs, dateISO } = computeSlotMs(schedModal.day, schedModal.slot);

      // create consultation
      const docRef = await addDoc(collection(db, "consultations"), {
        status: "scheduled_by_teacher",
        createdAt: serverTimestamp(),
        teacherId,
        teacherName,
        studentId: chosen.id,
        studentName: chosen.displayName || chosen.fullName || chosen.name || null,
        form: {
          consultantName: teacherName,
          nameClient: chosen.displayName || chosen.fullName || chosen.name || "",
          studentNumber: chosen.studentNumber || "",
          program: chosen.program || "",
          yearSection: chosen.yearSection || "",
          date: schedModal.day,
          time: schedModal.slot,
          methods: methods,
          inquiry: {},
        },
        startAtMs,
        endAtMs,
        dateISO,
        outcomeDispatched: false,
      });

      // keep Firestore grid in sync (server-side)
      try {
        const schedRef = doc(db, "schedules", teacherId);
        const schedSnap = await getDoc(schedRef);
        const existing = schedSnap.exists() ? (schedSnap.data()?.grid || {}) : {};
        const gridCopy = { ...existing };
        const { dayKey, slotKey } = resolveGridKeys(gridCopy, schedModal.day, schedModal.slot);
        const d = gridCopy[dayKey] || {};
        gridCopy[dayKey] = { ...d, [slotKey]: "green" };
        await setDoc(schedRef, { grid: gridCopy }, { merge: true });
      } catch (_) {
        // non-fatal: UI is already green
      }

      // notify student
      try {
        await addDoc(collection(db, "notifications"), {
          userId: chosen.id,
          type: "teacher_scheduled_consultation",
          title: "You’ve been scheduled",
          message: `You’re scheduled on ${schedModal.day} at ${schedModal.slot}. Preferred method: ${methodText || "-"}.`,
          consultationId: docRef.id,
          teacherId,
          createdAt: serverTimestamp(),
          createdAtMs: Date.now(),
          read: false,
        });
      } catch {}

      Alert.alert("Scheduled", "Student has been scheduled and notified.");

      // reset modal
      setSchedModal({ visible: false, day: null, slot: null });
      setSearch(""); setResults([]); setChosen(null);
      setMethods({ video: false, email: false, social: false, text: false, others: false, othersText: "" });

    } catch (e) {
      // ⭐ revert the optimistic color if anything failed
      onSelectBlock?.(schedModal.day, schedModal.slot, prevColor);
      Alert.alert("Error", String(e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  /* ===========================================================
     UI
  ============================================================*/
  return (
    <>
      <View onLayout={(e) => setWrapWidth(e.nativeEvent.layout.width)} style={{ width: "100%" }}>
        <View style={{ borderWidth: 1, borderColor: SEP, width: "100%" }}>
          <View style={{ flexDirection: "row" }}>
            {/* Time column */}
            <View style={{ width: TIME_W }}>
              <View style={{ height: CELL_H, borderBottomWidth: 1, borderRightWidth: 1, borderColor: SEP }} />
              <ScrollView showsVerticalScrollIndicator={false}>
                {TIMESLOTS.map((slot) => (
                  <View
                    key={slot}
                    style={{
                      height: CELL_H, width: TIME_W, justifyContent: "center", alignItems: "center",
                      borderBottomWidth: 1, borderRightWidth: 1, borderColor: SEP,
                    }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: "bold" }}>{slot}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>

            {/* Day columns */}
            <View style={{ width: Math.max(0, wrapWidth - TIME_W) }}>
              <View style={{ flexDirection: "row" }}>
                {WEEKDAYS.map((day) => {
                  const colW = Math.max(MIN_COL_W, Math.floor((Math.max(0, wrapWidth - TIME_W)) / WEEKDAYS.length || MIN_COL_W));
                  return (
                    <View key={day} style={{ width: colW }}>
                      <View
                        style={{
                          height: CELL_H, width: colW, justifyContent: "center", alignItems: "center",
                          borderBottomWidth: 1, borderRightWidth: 1, borderColor: SEP, paddingHorizontal: 2, overflow: "hidden",
                        }}
                      >
                        <Text
                          style={{ fontWeight: "bold", fontSize: 12 }}
                          numberOfLines={1}
                          ellipsizeMode="clip"
                          adjustsFontSizeToFit
                          minimumFontScale={0.7}
                        >
                          {day}
                        </Text>
                      </View>

                      <ScrollView showsVerticalScrollIndicator={false}>
                        {TIMESLOTS.map((slot) => {
                          const color = grid?.[day]?.[slot] || "white";
                          const disableStudent = readonly && color !== "white";
                          return (
                            <TouchableOpacity
                              key={`${day}-${slot}`}
                              disabled={disableStudent}
                              onPress={() => {
                                if (readonly) {
                                  if (color === "white" && typeof onRequestBlock === "function") {
                                    onRequestBlock(day, slot);
                                  }
                                  return;
                                }
                                handlePressTeacher(day, slot, color);
                              }}
                              style={{
                                height: CELL_H, width: colW, backgroundColor: color, justifyContent: "center", alignItems: "center",
                                opacity: readonly ? 0.9 : 1, borderBottomWidth: 1, borderRightWidth: 1, borderColor: SEP,
                              }}
                            >
                              <Text style={{ fontSize: 8 }}>{""}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </View>
                  );
                })}
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* Existing teacher color modal (white/red/blue/etc) */}
      {isEditable && selected && (
        <Modal transparent animationType="fade" visible onRequestClose={() => setSelected(null)}>
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" }}>
            <View
              style={{
                backgroundColor: "white", padding: 20, borderRadius: 16, width: "86%",
                shadowColor: "#000", shadowOpacity: 0.2, shadowOffset: { width: 0, height: 4 }, shadowRadius: 12, elevation: 4,
              }}
            >
              <Text style={{ fontWeight: "800", marginBottom: 10, fontSize: 16 }}>
                Change block status
              </Text>

              <OptionButton bg="white" textColor="#111827" label="Open Schedule" onPress={() => handleChange("white")} />
              <OptionButton bg="red" label="Close Schedule" onPress={() => handleChange("red")} />
              <OptionButton bg="blue" label="Scheduled" onPress={() => handleChange("blue")} />

              {/* NEW: Green schedule-by-teacher */}
              <OptionButton
                bg="green"
                label="Schedule a Student"
                onPress={() => {
                  setSelected(null);
                  setSchedModal({ visible: true, day: selected.day, slot: selected.slot });
                }}
              />

              <Pressable
                onPress={() => setSelected(null)}
                style={{ paddingVertical: 12, marginTop: 12, alignItems: "center", backgroundColor: "#e5e7eb", borderRadius: 10 }}
              >
                <Text style={{ fontWeight: "700", color: "#111827" }}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      )}

      {/* Blue cell: Cancel schedule modal (shows details if available) */}
      <Modal
        transparent
        animationType="fade"
        visible={cancelData.visible}
        onRequestClose={() => setCancelData({ visible: false, day: null, slot: null, reason: "", loading: false, consult: null })}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" }}>
          <View style={{ backgroundColor: "white", padding: 20, borderRadius: 16, width: "86%" }}>
            <Text style={{ fontWeight: "800", marginBottom: 10, fontSize: 16 }}>Cancel schedule</Text>
            <Text style={{ marginBottom: 8, color: "#374151" }}>
              {cancelData.day} — {cancelData.slot}
            </Text>

            {/* details panel (if known) */}
            <View style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, padding: 12, marginBottom: 12 }}>
              <Text style={{ fontWeight: "700", color: "#6b7280", marginBottom: 6 }}>Consultation Details</Text>
              <Text style={{ color: "#374151" }}>Student{"\n"}
                <Text style={{ fontWeight: "700" }}>
                  {cancelData.consult?.form?.nameClient || cancelData.consult?.studentName || "-"}
                </Text>
              </Text>
              <View style={{ height: 8 }} />
              <Text style={{ color: "#374151" }}>Year & Section{"\n"}
                <Text style={{ fontWeight: "700" }}>
                  {cancelData.consult?.form?.yearSection || "-"}
                </Text>
              </Text>
              <View style={{ height: 8 }} />
              <Text style={{ color: "#374151" }}>Method{"\n"}
                <Text style={{ fontWeight: "700" }}>
                  {formatMethods(cancelData.consult?.form?.methods || {}) || "-"}
                </Text>
              </Text>
              <View style={{ height: 8 }} />
              <Text style={{ color: "#374151" }}>Nature{"\n"}
                <Text style={{ fontWeight: "700" }}>
                  {(() => {
                    const q = cancelData.consult?.form?.inquiry || {};
                    const items = [];
                    if (q.classAdvising) items.push("Class Advising");
                    if (q.studentOrg) items.push("Student Organization Advising");
                    if (q.courseConcerns) items.push("Course/Subject Concerns");
                    if (q.thesis) items.push("Thesis");
                    if (q.dissertation) items.push("Dissertation");
                    if (q.others) items.push(q.othersText ? `Others (${q.othersText})` : "Others");
                    return items.join(", ") || "-";
                  })()}
                </Text>
              </Text>
            </View>

            <TextInput
              placeholder="Reason for cancelling (required)"
              value={cancelData.reason}
              onChangeText={(t) => setCancelData((s) => ({ ...s, reason: t }))}
              multiline
              style={{
                minHeight: 80, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10, padding: 10,
                textAlignVertical: "top", marginBottom: 12,
              }}
            />

            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10 }}>
              <Pressable
                onPress={() => setCancelData({ visible: false, day: null, slot: null, reason: "", loading: false, consult: null })}
                style={{ paddingVertical: 10, paddingHorizontal: 14, backgroundColor: "#e5e7eb", borderRadius: 10 }}
                disabled={cancelData.loading}
              >
                <Text style={{ fontWeight: "700", color: "#111827" }}>Close</Text>
              </Pressable>

              <Pressable
                onPress={confirmCancel}
                style={{
                  paddingVertical: 10, paddingHorizontal: 14, backgroundColor: "#ef4444",
                  borderRadius: 10, opacity: cancelData.loading ? 0.6 : 1,
                }}
                disabled={cancelData.loading}
              >
                <Text style={{ fontWeight: "700", color: "#fff" }}>
                  {cancelData.loading ? "Cancelling..." : "Cancel schedule"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* NEW: Schedule-a-student modal (GREEN) — scrollable + keyboard-safe + live search + header X */}
      <Modal
        transparent
        animationType="fade"
        visible={schedModal.visible}
        onRequestClose={() => setSchedModal({ visible: false, day: null, slot: null })}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <View style={{ flex: 1, justifyContent: "center", padding: 16 }}>
            <View style={{ backgroundColor: "white", borderRadius: 16, maxHeight: "92%", overflow: "hidden" }}>
              {/* Header with title and X close */}
              <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ fontWeight: "800", fontSize: 16 }}>Schedule a Student</Text>
                <TouchableOpacity onPress={() => setSchedModal({ visible: false, day: null, slot: null })} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Text style={{ fontSize: 18, color: "#6b7280" }}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView
                style={{ padding: 16, paddingTop: 8 }}
                contentContainerStyle={{ paddingBottom: 24 }}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={{ color: "#374151", marginBottom: 10 }}>
                  {schedModal.day} — {schedModal.slot}
                </Text>

                {/* student live search (name only) */}
                {!chosen && (
                  <>
                    <TextInput
                      placeholder={searching ? "Loading students…" : "Search student name…"}
                      value={search}
                      onChangeText={setSearch}
                      editable={!searching}
                      style={{
                        borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10,
                        paddingHorizontal: 10, paddingVertical: 10, marginBottom: 8,
                      }}
                    />
                    {/* keep your old button but don't render it (per “don’t remove anything”) */}
                    {false && (
                      <Pressable onPress={runSearch} style={{ display: "none" }}>
                        <Text>Search</Text>
                      </Pressable>
                    )}

                    <View style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10, maxHeight: 180, overflow: "hidden" }}>
                      <ScrollView keyboardShouldPersistTaps="handled">
                        {search.length > 0 && results.length === 0 ? (
                          <Text style={{ padding: 10, color: "#6b7280" }}>
                            {searching ? "Searching…" : "No matching students."}
                          </Text>
                        ) : (
                          results.map((s) => {
                            const label = s.displayName || s.fullName || s.name || s.studentNumber || s.id;
                            const meta = [s.yearSection, s.program].filter(Boolean).join(" • ");
                            return (
                              <TouchableOpacity
                                key={s.id}
                                onPress={() => setChosen({ id: s.id, ...s })}
                                style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" }}
                              >
                                <Text style={{ fontWeight: "700" }}>{label}</Text>
                                {!!meta && <Text style={{ color: "#6b7280" }}>{meta}</Text>}
                              </TouchableOpacity>
                            );
                          })
                        )}
                      </ScrollView>
                    </View>
                  </>
                )}

                {/* chosen student summary */}
                {chosen && (
                  <View style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10, padding: 12, marginBottom: 12, backgroundColor: "#f8fafc" }}>
                    <Text style={{ fontSize: 12, color: "#6b7280" }}>Selected student</Text>
                    <Text style={{ fontWeight: "800", marginBottom: 4 }}>
                      {chosen.displayName || chosen.fullName || chosen.name}
                    </Text>
                    <TouchableOpacity onPress={() => setChosen(null)}>
                      <Text style={{ color: "#2563eb", fontWeight: "700" }}>Change</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* method pickers */}
                <Text style={{ fontWeight: "700", marginBottom: 6 }}>Preferred method(s)</Text>
                {[
                  ["video", "Video Conferencing"],
                  ["email", "Email"],
                  ["social", "Social Media Platform"],
                  ["text", "Text Messages"],
                  ["others", "Others"],
                ].map(([key, label]) => (
                  <TouchableOpacity key={key} onPress={() => toggle(key)} style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                    <View
                      style={{
                        width: 18, height: 18, marginRight: 8, borderRadius: 4,
                        borderWidth: 2, borderColor: "#2563eb",
                        backgroundColor: methods[key] ? "#2563eb" : "transparent",
                      }}
                    />
                    <Text>{label}</Text>
                  </TouchableOpacity>
                ))}
                {methods.others && (
                  <TextInput
                    placeholder="Please specify…"
                    value={methods.othersText || ""}
                    onChangeText={(t) => setMethods((m) => ({ ...m, othersText: t }))}
                    style={{
                      borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10,
                      paddingHorizontal: 10, paddingVertical: 8, marginBottom: 8,
                    }}
                  />
                )}

                {/* Schedule button */}
                <View style={{ marginTop: 12 }}>
                  <TouchableOpacity
                    onPress={handleSchedulePress}
                    disabled={saving}
                    style={{ paddingVertical: 10, borderRadius: 8, backgroundColor: "#16a34a", alignItems: "center" }}
                  >
                    <Text style={{ fontWeight: "800", color: "white" }}>
                      {saving ? "Scheduling…" : "Schedule"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}
