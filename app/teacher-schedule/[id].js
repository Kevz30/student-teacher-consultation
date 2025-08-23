// app/teacher-schedule/[id].js
console.log("MOUNT → teacher-schedule");

import { useLocalSearchParams } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import ScheduleGrid from "../../components/ScheduleGrid";
import TeacherConsultModal from "../../components/TeacherConsultModal";
import db from "../../constants/firestore";

const clean = (s = "") => String(s).trim();
const norm = (s = "") =>
  clean(s).replace(/–/g, "-").replace(/\s+/g, "").toLowerCase();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default function TeacherScheduleScreen() {
  // [id] is THIS teacher's uid
  const { id } = useLocalSearchParams();
  const teacherId = useMemo(
    () => clean(Array.isArray(id) ? id[0] : id),
    [id]
  );

  const [grid, setGrid] = useState(null);
  const [loading, setLoading] = useState(true);

  // modal state
  const [teacherModalOpen, setTeacherModalOpen] = useState(false);
  const [consultationId, setConsultationId] = useState(null);
  const [lastTap, setLastTap] = useState(null); // { day, slot }

  // load schedule
  const loadSchedule = useCallback(async () => {
    if (!teacherId) return;
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, "schedules", teacherId));
      setGrid(snap.exists() ? snap.data().grid : null);
    } finally {
      setLoading(false);
    }
  }, [teacherId]);

  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  // TEACHER: tap yellow -> open consult modal
  const onOpenTeacherConsultModal = async ({ day, slot, consultationId: cidFromGrid }) => {
    try {
      setLastTap({ day, slot });

      // Prefer id from grid if present (skips extra queries)
      if (cidFromGrid) {
        setConsultationId(cidFromGrid);
        setTeacherModalOpen(true);
        return;
      }

      // Fallback: query consultations
      let qs = await getDocs(
        query(
          collection(db, "consultations"),
          where("teacherId", "==", teacherId),
          where("day", "==", day),
          where("time", "==", slot),
          limit(1)
        )
      );

      if (qs.empty) {
        const qs2 = await getDocs(
          query(
            collection(db, "consultations"),
            where("teacherId", "==", teacherId),
            where("day", "==", day),
            limit(20)
          )
        );
        const candidate = qs2.docs.find(
          (d) => norm(d.data().time) === norm(slot)
        );
        if (candidate) qs = { empty: false, docs: [candidate] };
      }

      if (qs.empty) {
        Alert.alert("No request", "No consultation found for this block.");
        setLastTap(null);
        return;
      }

      setConsultationId(qs.docs[0].id);
      setTeacherModalOpen(true);
    } catch (e) {
      Alert.alert("Error", String(e?.message || e));
      setLastTap(null);
    }
  };

  // after modal closes → poll until status is "signed_by_teacher", then paint BLUE
  const handleClose = async (opts = {}) => {
    const { shouldReload = true } = opts;
    setTeacherModalOpen(false);

    try {
      if (!consultationId || !lastTap) {
        if (shouldReload) await loadSchedule();
        return;
      }

      // Poll Firestore briefly for eventual consistency
      let isSigned = false;
      for (let i = 0; i < 6; i++) {
        const snap = await getDoc(doc(db, "consultations", consultationId));
        const c = snap.exists() ? snap.data() : null;
        isSigned = String(c?.status || "").toLowerCase() === "signed_by_teacher";
        if (isSigned) break;
        await sleep(500);
      }

      // Mark BLUE if signed
      if (isSigned && lastTap.day && lastTap.slot) {
        const d = lastTap.day;
        const t = lastTap.slot;

        const newGrid = { ...(grid || {}) };
        newGrid[d] = { ...(newGrid[d] || {}) };
        newGrid[d][t] = "blue";

        await setDoc(doc(db, "schedules", teacherId), { grid: newGrid }, { merge: true });
        setGrid(newGrid);
      } else if (shouldReload) {
        await loadSchedule();
      }
    } catch (e) {
      console.warn("[CLOSE] error:", e);
      if (shouldReload) await loadSchedule();
    } finally {
      setConsultationId(null);
      setLastTap(null);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 20 }}>
      <Text style={{ fontSize: 20, fontWeight: "bold", marginBottom: 8 }}>
        {grid ? "View Schedule" : "No Schedule Found"}
      </Text>

      {grid && (
        <ScheduleGrid
          grid={grid}
          readonly={false} // teacher screen
          onRequestBlock={undefined} // student-only
          onOpenTeacherConsultModal={onOpenTeacherConsultModal}
        />
      )}

      {teacherModalOpen && (
        <TeacherConsultModal
          visible={teacherModalOpen}
          onClose={handleClose}            // onClose({shouldReload?:boolean})
          consultationId={consultationId}
          teacherId={teacherId}
        />
      )}

      <TouchableOpacity
        onPress={loadSchedule}
        style={{
          marginTop: 16,
          alignSelf: "flex-start",
          backgroundColor: "#e5e7eb",
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 8,
        }}
      >
        <Text>Reload</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
