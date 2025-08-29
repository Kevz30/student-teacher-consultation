// app/teacher-schedule/[id].js
console.log("MOUNT → teacher-schedule");

import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import ScheduleGrid from "../../components/ScheduleGrid";
import TeacherConsultModal from "../../components/TeacherConsultModal";
import db from "../../constants/firestore";

const clean = (s = "") => String(s).trim();
const norm = (s = "") => clean(s).replace(/–/g, "-").replace(/\s+/g, "").toLowerCase();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default function TeacherScheduleScreen() {
  // [id] is THIS teacher's uid
  const { id } = useLocalSearchParams();
  const teacherId = useMemo(() => clean(Array.isArray(id) ? id[0] : id), [id]);

  const navigation = useNavigation();
  const router = useRouter();

  const [grid, setGrid] = useState(null);
  const [loading, setLoading] = useState(true);

  // modal state
  const [teacherModalOpen, setTeacherModalOpen] = useState(false);
  const [consultationId, setConsultationId] = useState(null);
  const [lastTap, setLastTap] = useState(null); // { day, slot }

  // notifications state
  const [notifs, setNotifs] = useState([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const unreadCount = useMemo(() => notifs.filter((n) => !n.read).length, [notifs]);

  // header (My Classes, bell, settings)
  useEffect(() => {
    navigation.setOptions({
      title: "Teacher Dashboard",
      headerRight: () => (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 16, marginRight: 8 }}>
          <TouchableOpacity onPress={() => router.push("/my-classes")}>
            <Text style={{ color: "#2563eb", fontWeight: "600" }}>My Classes</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => openNotifs()} style={{ position: "relative" }}>
            <Ionicons name="notifications-outline" size={24} />
            {!!unreadCount && (
              <View
                style={{
                  position: "absolute",
                  right: -2,
                  top: -2,
                  width: 10,
                  height: 10,
                  backgroundColor: "#ef4444",
                  borderRadius: 5,
                }}
              />
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => Alert.alert("Settings", "Settings coming soon.")}>
            <Ionicons name="settings-outline" size={24} />
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, unreadCount, router]);

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

  // 🔔 live notifications for the teacher
  useEffect(() => {
    if (!teacherId) return;
    const q = query(
      collection(db, "notifications"),
      where("userId", "==", teacherId),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setNotifs(arr);
    });
    return unsub;
  }, [teacherId]);

  // open notifications list and mark unread as read (optimistic)
  const openNotifs = async () => {
    setShowNotifs(true);
    const unread = notifs.filter((n) => !n.read);
    if (!unread.length) return;

    setNotifs((prev) => prev.map((n) => (n.read ? n : { ...n, read: true })));
    try {
      await Promise.all(
        unread.map((n) =>
          updateDoc(doc(db, "notifications", n.id), { read: true, readAt: serverTimestamp() })
        )
      );
    } catch {}
  };

  // TEACHER: tap yellow -> open consult modal
  const onOpenTeacherConsultModal = async ({ day, slot, consultationId: cidFromGrid }) => {
    try {
      setLastTap({ day, slot });

      if (cidFromGrid) {
        setConsultationId(cidFromGrid);
        setTeacherModalOpen(true);
        return;
      }

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
        const candidate = qs2.docs.find((d) => norm(d.data().time) === norm(slot));
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

  // after modal closes: just reload; (grid->blue happens in the modal now)
  const handleClose = async (opts = {}) => {
    const { shouldReload = true } = opts;
    setTeacherModalOpen(false);
    try {
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
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Text style={{ fontSize: 20, fontWeight: "bold", marginBottom: 8 }}>
          {grid ? "View Schedule" : "No Schedule Found"}
        </Text>

        {grid && (
          <ScheduleGrid
            grid={grid}
            readonly={false}
            onRequestBlock={undefined}
            onOpenTeacherConsultModal={onOpenTeacherConsultModal}
          />
        )}

        {teacherModalOpen && (
          <TeacherConsultModal
            visible={teacherModalOpen}
            onClose={handleClose}
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

      {/* Notifications modal */}
      <Modal visible={showNotifs} transparent animationType="fade" onRequestClose={() => setShowNotifs(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 16 }}>
          <View style={{ backgroundColor: "white", borderRadius: 12, maxHeight: "80%", padding: 14 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <Text style={{ fontSize: 16, fontWeight: "700" }}>Notifications</Text>
              <TouchableOpacity onPress={() => setShowNotifs(false)}>
                <Text style={{ color: "#2563eb", fontWeight: "600" }}>Close</Text>
              </TouchableOpacity>
            </View>

            <ScrollView>
              {notifs.length === 0 ? (
                <Text style={{ color: "#6b7280" }}>No notifications yet.</Text>
              ) : (
                notifs.map((n) => (
                  <TouchableOpacity
                    key={n.id}
                    onPress={() => {
                      setShowNotifs(false);
                      if (n.consultationId) {
                        setConsultationId(n.consultationId);
                        setTeacherModalOpen(true);
                      }
                    }}
                    style={{
                      paddingVertical: 10,
                      borderBottomWidth: 1,
                      borderBottomColor: "#f3f4f6",
                      opacity: n.read ? 0.6 : 1,
                    }}
                  >
                    <Text style={{ fontWeight: "600" }}>{n.title || "Notification"}</Text>
                    <Text style={{ color: "#374151" }}>{n.message}</Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
