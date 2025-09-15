// app/student-dashboard.js
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRouter } from "expo-router";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  FlatList,
  Image,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getAuth } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDoc as getDocOnce,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

import blankProfile from "../assets/images/blank-profile.png";
import db from "../constants/firestore";
import { matchStudentToClasses } from "./utils/matchingHelper";

/* ---------- Header (title + icons row) ---------- */
function StudentHeader({
  unreadCount,
  activeTab,
  onOpenTeachers,
  onOpenConsultations,
  onOpenNotifs,
  onOpenSettings,
  onSearch,
}) {
  const insets = useSafeAreaInsets();
  const iconColor = (tab) => (activeTab === tab ? "#2563eb" : "#111827");

  return (
    <View
      style={{
        backgroundColor: "#fff",
        borderBottomWidth: 1,
        borderBottomColor: "#eee",
        paddingHorizontal: 16,
        paddingTop: insets.top + (Platform.OS === "android" ? 6 : 10),
        paddingBottom: 10,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <Text style={{ fontSize: 24, fontWeight: "800", color: "#111827" }}>
          Student Dashboard
        </Text>
        <TouchableOpacity
          onPress={onSearch}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="search-outline" size={26} color="#111827" />
        </TouchableOpacity>
      </View>

      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-around",
          alignItems: "center",
        }}
      >
        <TouchableOpacity accessibilityLabel="Teachers" onPress={onOpenTeachers}>
          <Ionicons name="school-outline" size={28} color={iconColor("teachers")} />
        </TouchableOpacity>

        <TouchableOpacity accessibilityLabel="Schedule" onPress={onOpenConsultations}>
          <Ionicons name="calendar-outline" size={28} color={iconColor("consultations")} />
        </TouchableOpacity>

        <TouchableOpacity disabled accessibilityLabel="Videocall (coming soon)" style={{ opacity: 0.4 }}>
          <Ionicons name="videocam-outline" size={28} color="#111827" />
        </TouchableOpacity>

        <TouchableOpacity accessibilityLabel="Notifications" onPress={onOpenNotifs} style={{ position: "relative" }}>
          <Ionicons name="notifications-outline" size={28} color={iconColor("notifications")} />
          {!!unreadCount && (
            <View
              style={{
                position: "absolute",
                right: -4,
                top: -4,
                width: 12,
                height: 12,
                backgroundColor: "#ef4444",
                borderRadius: 6,
              }}
            />
          )}
        </TouchableOpacity>

        <TouchableOpacity accessibilityLabel="Settings" onPress={onOpenSettings}>
          <Ionicons name="settings-outline" size={28} color="#111827" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* ---------- Skeleton Card ---------- */
function SkeletonCard({ pulse }) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: "#e5e7eb",
        borderRadius: 12,
        padding: 14,
        marginBottom: 12,
        backgroundColor: "white",
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <Animated.View
        style={{
          width: 50,
          height: 50,
          borderRadius: 25,
          marginRight: 12,
          backgroundColor: "#e5e7eb",
          opacity: pulse,
        }}
      />
      <View style={{ flex: 1, gap: 8 }}>
        <Animated.View style={{ height: 14, borderRadius: 4, backgroundColor: "#e5e7eb", width: "60%", opacity: pulse }} />
        <Animated.View style={{ height: 12, borderRadius: 4, backgroundColor: "#e5e7eb", width: "40%", opacity: pulse }} />
      </View>
      <Animated.View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: "#e5e7eb", opacity: pulse }} />
    </View>
  );
}

/* ---------- Small checkbox row used in modals ---------- */
const Check = ({ label, value, onToggle }) => (
  <TouchableOpacity onPress={onToggle} style={{ flexDirection: "row", alignItems: "center", marginVertical: 6 }}>
    <View
      style={{
        width: 18,
        height: 18,
        borderWidth: 1,
        borderColor: "#374151",
        marginRight: 8,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: value ? "#2563eb" : "white",
      }}
    >
      {value ? <Text style={{ color: "white", fontSize: 12 }}>✓</Text> : null}
    </View>
    <Text>{label}</Text>
  </TouchableOpacity>
);

export default function StudentDashboard() {
  const [matchedTeachers, setMatchedTeachers] = useState([]);
  const [notifs, setNotifs] = useState([]);
  const [loading, setLoading] = useState(true);

  // consultations for watcher
  const [myConsultations, setMyConsultations] = useState([]);

  // outcome modal
  const [outcomeVisible, setOutcomeVisible] = useState(false);
  const [outcomeNotes, setOutcomeNotes] = useState("");
  const [outcomeTarget, setOutcomeTarget] = useState(null);
  const [submittingOutcome, setSubmittingOutcome] = useState(false);
  const [outcomeNotifId, setOutcomeNotifId] = useState(null);

  // name cache for notifications
  const [nameCache, setNameCache] = useState({});

  // prefill modal + form
  const [prefillVisible, setPrefillVisible] = useState(false);
  const [prefillLoading, setPrefillLoading] = useState(false);
  const [prefillConsultId, setPrefillConsultId] = useState(null);
  const [prefillTeacherId, setPrefillTeacherId] = useState(null);
  const [prefillDay, setPrefillDay] = useState("");
  const [prefillTime, setPrefillTime] = useState("");
  const [form, setForm] = useState({
    typeOfClient: "Student",
    studentNumber: "",
    program: "",
    office: "",
    yearSection: "",
    contactNumber: "",
    consultantName: "",
    nameClient: "",
    methods: { video: false, email: false, social: false, text: false, others: false, othersText: "" },
    inquiry: { classAdvising: false, studentOrg: false, courseConcerns: false, thesis: false, dissertation: false, others: false, othersText: "" },
  });

  const auth = getAuth();
  const uid = auth.currentUser?.uid;

  const router = useRouter();
  const navigation = useNavigation();

  // tabs + slide animation
  const [activeTab, setActiveTab] = useState("teachers"); // "teachers" | "consultations" | "notifications"
  const slideX = useRef(new Animated.Value(0)).current;
  const { width } = useWindowDimensions();
  const tabOrder = ["teachers", "consultations", "notifications"];
  const smoothEase = Easing.bezier(0.22, 1, 0.36, 1);

  const switchTo = (nextTab) => {
    if (activeTab === nextTab) return;
    const from = tabOrder.indexOf(activeTab);
    const to = tabOrder.indexOf(nextTab);
    const direction = to > from ? +1 : -1;
    setActiveTab(nextTab);
    slideX.setValue(direction * width);
    Animated.timing(slideX, { toValue: 0, duration: 320, easing: smoothEase, useNativeDriver: true }).start();
  };

  // list ref (for Teachers icon scroll, optional)
  const listRef = useRef(null);

  // skeleton pulse
  const pulse = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.35, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  /* ---------- Data: matches ---------- */
  useEffect(() => {
    if (!uid) return;
    (async () => {
      try {
        setLoading(true);

        await matchStudentToClasses(uid);

        const studentSnap = await getDoc(doc(db, "students", uid));
        const matches = studentSnap.data()?.matchedClasses || [];

        const teacherData = await Promise.all(
          matches.map(async (m) => {
            const instSnap = await getDoc(doc(db, "instructors", m.teacherId));
            const info = instSnap.data() || {};
            return {
              ...m,
              fullName: info.displayName || info.fullName || "Unnamed",
              photoURL: info.photoURL || null,
            };
          })
        );

        setMatchedTeachers(teacherData);
      } catch (e) {
        Alert.alert("Error loading teachers", String(e?.message || e));
      } finally {
        setLoading(false);
      }
    })();
  }, [uid]);

  /* ---------- Helper: resolve name ---------- */
  const fetchAndCacheName = async (personId) => {
    if (!personId || nameCache[personId]) return nameCache[personId];
    let display = null;
    try {
      const u = await getDoc(doc(db, "users", personId));
      if (u.exists()) display = u.data()?.displayName || u.data()?.fullName || null;
      if (!display) {
        const i = await getDoc(doc(db, "instructors", personId));
        if (i.exists()) display = i.data()?.displayName || i.data()?.fullName || null;
      }
    } catch {}
    if (display) setNameCache((prev) => ({ ...prev, [personId]: display }));
    return display;
  };

  const ensureActorNameForNotifs = async (list) => {
    const tasks = [];
    for (const n of list) {
      const id = n.actorId || n.teacherId;
      if (id && !nameCache[id]) tasks.push(fetchAndCacheName(id));
      else if (!id && n.consultationId) {
        tasks.push(
          (async () => {
            try {
              const snap = await getDoc(doc(db, "consultations", n.consultationId));
              const tId = snap.exists() ? snap.data()?.teacherId : null;
              if (tId) await fetchAndCacheName(tId);
            } catch {}
          })()
        );
      }
    }
    if (tasks.length) await Promise.allSettled(tasks);
  };

  /* ---------- Live notifications ---------- */
  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, "notifications"), where("userId", "==", uid), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, async (snap) => {
      const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setNotifs(arr);
      ensureActorNameForNotifs(arr);
    });
    return unsub;
  }, [uid]);

  const unreadCount = useMemo(() => notifs.filter((n) => !n.read).length, [notifs]);

  /* ---------- Header ---------- */
  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: "",
      headerShadowVisible: true,
      header: () => (
        <StudentHeader
          unreadCount={unreadCount}
          activeTab={activeTab}
          onOpenTeachers={() => {
            switchTo("teachers");
            try {
              listRef.current?.scrollToOffset({ offset: 0, animated: true });
            } catch {}
          }}
          onOpenConsultations={() => switchTo("consultations")}
          onOpenNotifs={() => switchTo("notifications")}
          onOpenSettings={() => Alert.alert("Settings", "Settings coming soon.")}
          onSearch={() => Alert.alert("Search", "Search coming soon.")}
        />
      ),
    });
  }, [navigation, unreadCount, activeTab]);

  /* ---------- Subscribe to student's consultations ---------- */
  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, "consultations"), where("studentId", "==", uid));
    const unsub = onSnapshot(q, (snap) => {
      setMyConsultations(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [uid]);

  /* ---------- Background checker: outcome request ---------- */
  useEffect(() => {
    if (!uid) return;
    const interval = setInterval(async () => {
      const now = Date.now();
      const due = myConsultations.filter((c) => {
        const status = String(c.status || "").toLowerCase();
        return status === "signed_by_teacher" && typeof c.endAtMs === "number" && c.endAtMs <= now && !c.outcomeDispatched;
      });

      for (const c of due) {
        try {
          const ref = doc(db, "consultations", c.id);
          const fresh = await getDocOnce(ref);
          const data = fresh.exists() ? fresh.data() : null;
          if (!data || data.outcomeDispatched) continue;

          await Promise.all([
            addDoc(collection(db, "notifications"), {
              userId: uid,
              title: "Add outcome notes",
              message: `Please add outcome notes for ${data?.form?.date || data?.day} at ${data?.form?.time || data?.time}.`,
              type: "consultation_outcome_request",
              consultationId: c.id,
              teacherId: data?.teacherId || null,
              createdAt: serverTimestamp(),
              createdAtMs: Date.now(),
              read: false,
            }),
            updateDoc(ref, { outcomeDispatched: true }),
          ]);
        } catch {}
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [uid, myConsultations]);

  /* ---------- Notification helpers ---------- */
  const markAllRead = async () => {
    const unread = notifs.filter((n) => !n.read);
    if (!unread.length) return;
    setNotifs((prev) => prev.map((n) => (n.read ? n : { ...n, read: true })));
    try {
      await Promise.all(
        unread.map((n) => updateDoc(doc(db, "notifications", n.id), { read: true, readAt: serverTimestamp() }))
      );
    } catch {}
  };

  const clearAll = async () => {
    if (!notifs.length) return;
    const ids = [...notifs];
    setNotifs([]); // optimistic
    try {
      await Promise.all(ids.map((n) => deleteDoc(doc(db, "notifications", n.id))));
    } catch {}
  };

  // open prefill modal from notification
  const openPrefillModal = async (consultationId) => {
    try {
      setPrefillLoading(true);
      const snap = await getDoc(doc(db, "consultations", consultationId));
      if (!snap.exists()) {
        Alert.alert("Not found", "Consultation no longer exists.");
        return;
      }
      const data = snap.data();
      const day = data?.form?.date || data?.day || "";
      const time = data?.form?.time || data?.time || "";
      const teacherId = data?.teacherId || null;

      const sSnap = await getDoc(doc(db, "students", uid));
      const s = sSnap.exists() ? sSnap.data() : {};

      let officeFromInstructor = "";
      if (teacherId) {
        const tSnap = await getDoc(doc(db, "instructors", teacherId));
        const t = tSnap.exists() ? tSnap.data() : {};
        officeFromInstructor = t?.college ?? t?.College ?? t?.office ?? t?.department ?? "";
      }

      setPrefillConsultId(consultationId);
      setPrefillTeacherId(teacherId);
      setPrefillDay(day);
      setPrefillTime(time);

      setForm({
        typeOfClient: "Student",
        studentNumber: s?.studentNumber || "",
        program: s?.program || s?.course || "",
        office: String(officeFromInstructor),
        yearSection: s?.yearSection || "",
        contactNumber: s?.contactNumber || "",
        consultantName: data?.form?.consultantName || "",
        nameClient: s?.displayName || s?.fullName || "",
        methods: {
          video: !!data?.form?.methods?.video,
          email: !!data?.form?.methods?.email,
          social: !!data?.form?.methods?.social,
          text: !!data?.form?.methods?.text,
          others: !!data?.form?.methods?.others,
          othersText: data?.form?.methods?.othersText || "",
        },
        inquiry: {
          classAdvising: false,
          studentOrg: false,
          courseConcerns: false,
          thesis: false,
          dissertation: false,
          others: false,
          othersText: "",
        },
      });

      setPrefillVisible(true);
    } catch (e) {
      Alert.alert("Error", String(e?.message || e));
    } finally {
      setPrefillLoading(false);
    }
  };

  // tap a notification
  const openNotif = async (n) => {
    try {
      if (!n.read) {
        await updateDoc(doc(db, "notifications", n.id), { read: true, readAt: serverTimestamp() });
        setNotifs((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      }

      if (n.type === "teacher_scheduled_consultation" && n.consultationId) {
        await openPrefillModal(n.consultationId);
        return;
      }

      if (n.type === "consultation_outcome_request" && n.consultationId) {
        setOutcomeTarget({ id: n.consultationId, teacherId: n.teacherId || null });
        setOutcomeNotes("");
        setOutcomeNotifId(n.id);
        setOutcomeVisible(true);
        return;
      }

      Alert.alert(n.title || "Notification", n.message || "");
    } catch {}
  };

  const submitPrefill = async () => {
    if (!prefillConsultId || !prefillTeacherId) return Alert.alert("Missing data", "This consultation is incomplete.");
    try {
      await updateDoc(doc(db, "consultations", prefillConsultId), {
        status: "submitted_by_student",
        updatedAt: serverTimestamp(),
        form: { ...form, date: prefillDay, time: prefillTime },
      });

      // paint the slot BLUE on teacher schedule
      try {
        const schedRef = doc(db, "schedules", prefillTeacherId);
        const schedSnap = await getDoc(schedRef);
        const existing = schedSnap.exists() ? schedSnap.data()?.grid || {} : {};
        const grid = { ...existing };
        if (!grid[prefillDay]) grid[prefillDay] = {};
        grid[prefillDay][prefillTime] = "blue";
        await setDoc(schedRef, { grid }, { merge: true });
      } catch {}

      // notify the teacher
      try {
        await addDoc(collection(db, "notifications"), {
          userId: prefillTeacherId,
          type: "consultation_filled_by_student",
          title: "Consultation form submitted",
          message: `Student submitted the details for ${prefillDay} at ${prefillTime}.`,
          consultationId: prefillConsultId,
          createdAt: serverTimestamp(),
          createdAtMs: Date.now(),
          read: false,
        });
      } catch {}

      Alert.alert("Submitted", "Your consultation form has been sent.");
      setPrefillVisible(false);
    } catch (e) {
      Alert.alert("Error", String(e?.message || e));
    }
  };

  const submitOutcome = async () => {
    if (!outcomeTarget?.id) return Alert.alert("Missing data", "No consultation selected.");
    if (!outcomeNotes.trim()) return Alert.alert("Required", "Please enter your notes/outcome first.");
    setSubmittingOutcome(true);
    try {
      await updateDoc(doc(db, "consultations", outcomeTarget.id), {
        studentOutcome: { notes: outcomeNotes.trim(), submittedAt: serverTimestamp() },
      });

      // notify teacher that outcome was submitted
      try {
        let teacherId = outcomeTarget.teacherId;
        if (!teacherId) {
          const snap = await getDoc(doc(db, "consultations", outcomeTarget.id));
          teacherId = snap.exists() ? snap.data()?.teacherId : null;
        }
        if (teacherId) {
          await addDoc(collection(db, "notifications"), {
            userId: teacherId,
            type: "consultation_outcome_submitted",
            title: "Outcome submitted",
            message: "Student submitted outcome notes.",
            consultationId: outcomeTarget.id,
            createdAt: serverTimestamp(),
            createdAtMs: Date.now(),
            read: false,
          });
        }
      } catch {}

      // remove outcome-request notifications for this consultation
      try {
        if (outcomeNotifId) {
          await deleteDoc(doc(db, "notifications", outcomeNotifId));
          setNotifs((prev) => prev.filter((n) => n.id !== outcomeNotifId));
        } else {
          const qDel = query(
            collection(db, "notifications"),
            where("userId", "==", uid),
            where("type", "==", "consultation_outcome_request"),
            where("consultationId", "==", outcomeTarget.id)
          );
          const snapDel = await getDocs(qDel);
          await Promise.all(snapDel.docs.map((d) => deleteDoc(d.ref)));
          setNotifs((prev) =>
            prev.filter(
              (n) => !(n.type === "consultation_outcome_request" && n.consultationId === outcomeTarget.id)
            )
          );
        }
      } catch {}

      Alert.alert("Submitted", "Your outcome notes were saved and your teacher was notified.");
      setOutcomeVisible(false);
      setOutcomeNotes("");
      setOutcomeTarget(null);
      setOutcomeNotifId(null);
    } catch (e) {
      Alert.alert("Error", String(e?.message || e));
    } finally {
      setSubmittingOutcome(false);
    }
  };

  const formatWhen = (ts) => {
    try {
      const d = ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null;
      if (!d) return "";
      return d.toLocaleString();
    } catch {
      return "";
    }
  };

  const renderNotifText = (n) => {
    const actorId = n.actorId || n.teacherId;
    const actorName = n.actorName || (actorId ? nameCache[actorId] : null);
    const title = actorName && typeof n.title === "string" ? n.title.replace(/your teacher/gi, actorName) : n.title || "Notification";
    const message = actorName && typeof n.message === "string" ? n.message.replace(/your teacher/gi, actorName) : n.message || "";
    return { title, message, when: formatWhen(n.createdAt) };
  };

  /* ---------- Consultations segmented filter ---------- */
  const [consultFilter, setConsultFilter] = useState("pending"); // 'pending' | 'done' | 'cancelled'
  const Seg = ({ value, label }) => {
    const active = consultFilter === value;
    return (
      <TouchableOpacity onPress={() => setConsultFilter(value)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: active ? "#eef2ff" : "transparent" }}>
        <Text style={{ fontWeight: active ? "800" : "700", color: active ? "#2563eb" : "#111827" }}>{label}</Text>
      </TouchableOpacity>
    );
  };

  const statusChip = (status) => {
    const s = String(status || "").toLowerCase();
    const map = {
      submitted_by_student: { label: "Pending", bg: "#fff7ed", fg: "#c2410c" },
      signed_by_teacher: { label: "Scheduled", bg: "#ecfeff", fg: "#0e7490" },
      declined_by_teacher: { label: "Declined", bg: "#fef2f2", fg: "#b91c1c" },
      cancelled_by_teacher: { label: "Cancelled", bg: "#fef2f2", fg: "#b91c1c" },
    };
    const m = map[s] || { label: s || "Unknown", bg: "#f3f4f6", fg: "#374151" };
    return (
      <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: m.bg }}>
        <Text style={{ fontSize: 12, color: m.fg, fontWeight: "700" }}>{m.label}</Text>
      </View>
    );
  };

  const prettyDT = (c) => {
  const hasStart = typeof c?.startAtMs === "number";
  const hasEnd = typeof c?.endAtMs === "number";

  if (hasStart) {
    const start = new Date(c.startAtMs);
    const end = hasEnd ? new Date(c.endAtMs) : start;

    const dateStr = start.toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    const startStr = start.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
    const endStr = end.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });

    return `${dateStr} • ${startStr}–${endStr}`;
  }

  const day = c?.form?.date || c?.day || "-";
  const time = c?.form?.time || c?.time || "-";
  return `${day} • ${time}`;
};


  /* ---------- Render ---------- */
  return (
    <View style={{ flex: 1, backgroundColor: "#fff", padding: 16 }}>
      <Animated.View style={{ flex: 1, transform: [{ translateX: slideX }] }}>
        {activeTab === "notifications" ? (
          /* ===== NOTIFICATIONS ===== */
          <ScrollView style={{ paddingTop: 8 }}>
            {notifs.length > 0 && (
              <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 16, marginBottom: 8 }}>
                {notifs.some((n) => !n.read) && (
                  <TouchableOpacity onPress={markAllRead}>
                    <Text style={{ color: "#2563eb", fontWeight: "700" }}>Mark all as read</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={clearAll}>
                  <Text style={{ color: "#ef4444", fontWeight: "700" }}>Clear</Text>
                </TouchableOpacity>
              </View>
            )}

            {notifs.length === 0 ? (
              <Text style={{ color: "#6b7280" }}>No notifications yet.</Text>
            ) : (
              notifs.map((n) => {
                const { title, message, when } = renderNotifText(n);
                return (
                  <TouchableOpacity
                    key={n.id}
                    onPress={() => openNotif(n)}
                    style={{
                      paddingVertical: 12,
                      paddingHorizontal: 12,
                      borderBottomWidth: 1,
                      borderBottomColor: "#f3f4f6",
                      backgroundColor: n.read ? "#ffffff" : "#eef2ff",
                      borderLeftWidth: n.read ? 0 : 3,
                      borderLeftColor: "#2563eb",
                      borderRadius: 8,
                      marginBottom: 6,
                    }}
                  >
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        {!n.read && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#2563eb", marginRight: 6 }} />}
                        <Text style={{ fontWeight: "700" }}>{title}</Text>
                      </View>
                      {!!when && <Text style={{ color: "#6b7280", fontSize: 12 }}>{when}</Text>}
                    </View>
                    {!!message && <Text style={{ color: "#374151", marginTop: 2 }}>{message}</Text>}
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        ) : activeTab === "consultations" ? (
          /* ===== CONSULTATIONS (with 3 clickable labels) ===== */
          <ScrollView style={{ paddingTop: 8 }}>
            {/* Segmented header */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 12, backgroundColor: "#f9fafb", borderRadius: 999, padding: 6 }}>
              <Seg value="pending" label="Pending & Scheduled" />
              <Seg value="done" label="Done" />
              <Seg value="cancelled" label="Cancelled" />
            </View>

            {(() => {
              const now = Date.now();

              // Normalize buckets
              const isPendingOrScheduled = (c) => {
                const s = String(c.status || "").toLowerCase();
                return s === "submitted_by_student" || s === "signed_by_teacher";
              };

              const isCancelled = (c) => {
                const s = String(c.status || "").toLowerCase();
                return s === "declined_by_teacher" || s === "cancelled_by_teacher";
              };

              const isDone = (c) => {
                const s = String(c.status || "").toLowerCase();
                const ended = typeof c.endAtMs === "number" && c.endAtMs <= now;
                const outcome = !!c?.studentOutcome?.notes;
                const terminal = isCancelled(c);
                // Done if: has outcome, or ended after being scheduled, or terminal statuses (declined/cancelled)
                return outcome || (ended && s === "signed_by_teacher") || terminal;
              };

              const list = myConsultations.slice();

              let filtered = [];
              if (consultFilter === "pending") {
                filtered = list
                  .filter(isPendingOrScheduled)
                  .sort((a, b) => (a?.startAtMs || 0) - (b?.startAtMs || 0));
              } else if (consultFilter === "done") {
                filtered = list
                  .filter(isDone)
                  .sort((a, b) => (b?.startAtMs || 0) - (a?.startAtMs || 0));
              } else {
                filtered = list
                  .filter(isCancelled)
                  .sort((a, b) => (b?.startAtMs || 0) - (a?.startAtMs || 0));
              }

              const EmptyText = {
                pending: "No pending or scheduled consultations.",
                done: "No finished consultations yet.",
                cancelled: "No cancelled/declined consultations.",
              }[consultFilter];

              const Card = ({ c }) => (
                <TouchableOpacity
                  onPress={() => {
                    const needsOutcome =
                      String(c.status || "").toLowerCase() === "signed_by_teacher" &&
                      typeof c.endAtMs === "number" &&
                      c.endAtMs <= now &&
                      !c?.studentOutcome?.notes;

                    if (needsOutcome) {
                      setOutcomeTarget({ id: c.id, teacherId: c.teacherId || null });
                      setOutcomeNotes("");
                      setOutcomeVisible(true);
                      return;
                    }
                    Alert.alert("Consultation", `${prettyDT(c)}\nStatus: ${String(c.status || "")}`);
                  }}
                  style={{
                    borderWidth: 1,
                    borderColor: "#e5e7eb",
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 10,
                    backgroundColor: "white",
                  }}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                    <Text style={{ fontWeight: "700" }}>{prettyDT(c)}</Text>
                    {statusChip(c.status)}
                  </View>
                  {!!c?.form?.consultantName && (
                    <Text style={{ color: "#6b7280", marginTop: 2 }}>Consultant: {c.form.consultantName}</Text>
                  )}
                  {!!c?.studentOutcome?.notes && (
                    <Text style={{ color: "#16a34a", marginTop: 6 }} numberOfLines={2}>
                      Outcome: {c.studentOutcome.notes}
                    </Text>
                  )}
                </TouchableOpacity>
              );

              return filtered.length === 0 ? (
                <Text style={{ color: "#6b7280" }}>{EmptyText}</Text>
              ) : (
                <View style={{ paddingBottom: 12 }}>
                  {filtered.map((c) => (
                    <Card key={c.id} c={c} />
                  ))}
                </View>
              );
            })()}
          </ScrollView>
        ) : (
          /* ===== TEACHERS ===== */
          <>
            <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 8 }}>
              Your Matched Teachers
            </Text>

            {loading ? (
              <>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <ActivityIndicator />
                  <Text style={{ color: "#6b7280" }}>Finding your matched teachers…</Text>
                </View>
                <SkeletonCard pulse={pulse} />
                <SkeletonCard pulse={pulse} />
                <SkeletonCard pulse={pulse} />
              </>
            ) : matchedTeachers.length === 0 ? (
              <Text>No matched teachers found.</Text>
            ) : (
              <FlatList
                ref={listRef}
                data={matchedTeachers}
                keyExtractor={(item, i) => item.teacherId ?? String(i)}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => router.push(`/student-schedule/${item.teacherId}`)}
                    style={{
                      borderWidth: 1,
                      borderColor: "#e5e7eb",
                      borderRadius: 12,
                      padding: 14,
                      marginBottom: 12,
                      backgroundColor: "white",
                      flexDirection: "row",
                      alignItems: "center",
                    }}
                  >
                    <Image
                      source={item.photoURL ? { uri: item.photoURL } : blankProfile}
                      style={{ width: 50, height: 50, borderRadius: 25, marginRight: 12 }}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: "700" }}>{item.fullName}</Text>
                      <Text style={{ color: "#6b7280" }}>
                        {item.subjectCode} – {item.course} {item.section}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
                  </TouchableOpacity>
                )}
              />
            )}
          </>
        )}
      </Animated.View>

      {/* Outcome notes modal */}
      <Modal visible={outcomeVisible} transparent animationType="fade" onRequestClose={() => setOutcomeVisible(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 16 }}>
          <View style={{ backgroundColor: "white", borderRadius: 12, padding: 14 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", marginBottom: 8 }}>Other Notes / Proceedings / Outcome</Text>
            <TextInput
              value={outcomeNotes}
              onChangeText={setOutcomeNotes}
              placeholder="Type details of the outcome here…"
              multiline
              style={{ minHeight: 120, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 10, textAlignVertical: "top" }}
            />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <TouchableOpacity
                onPress={() => setOutcomeVisible(false)}
                disabled={submittingOutcome}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: "#e5e7eb", alignItems: "center" }}
              >
                <Text style={{ fontWeight: "600" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={submitOutcome}
                disabled={submittingOutcome}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: "#2563eb", alignItems: "center" }}
              >
                <Text style={{ fontWeight: "700", color: "white" }}>{submittingOutcome ? "Saving…" : "Submit"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Prefilled consultation form (teacher scheduled) */}
      <Modal visible={prefillVisible} transparent animationType="fade" onRequestClose={() => setPrefillVisible(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 16 }}>
          <View style={{ backgroundColor: "white", borderRadius: 12, padding: 16, maxHeight: "88%" }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <Text style={{ fontSize: 18, fontWeight: "700" }}>
                Consultation details ({prefillDay} • {prefillTime})
              </Text>
              <TouchableOpacity onPress={() => setPrefillVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color="#6b7280" />
              </TouchableOpacity>
            </View>

            {prefillLoading ? (
              <View style={{ paddingVertical: 24, alignItems: "center" }}>
                <ActivityIndicator />
              </View>
            ) : (
              <>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }}>
                  <Text>Name (Client)</Text>
                  <TextInput value={form.nameClient} editable={false} style={{ borderWidth: 1, borderRadius: 8, padding: 8, marginBottom: 8, backgroundColor: "#f3f4f6" }} />
                  <Text>Type of Client</Text>
                  <TextInput value="Student" editable={false} style={{ borderWidth: 1, borderRadius: 8, padding: 8, marginBottom: 8, backgroundColor: "#f3f4f6" }} />
                  <Text>Student Number</Text>
                  <TextInput value={form.studentNumber} editable={false} style={{ borderWidth: 1, borderRadius: 8, padding: 8, marginBottom: 8, backgroundColor: "#f3f4f6" }} />
                  <Text>Curricular Program</Text>
                  <TextInput value={form.program} editable={false} style={{ borderWidth: 1, borderRadius: 8, padding: 8, marginBottom: 8, backgroundColor: "#f3f4f6" }} />
                  <Text>Office</Text>
                  <TextInput value={form.office} editable={false} style={{ borderWidth: 1, borderRadius: 8, padding: 8, marginBottom: 8, backgroundColor: "#f3f4f6" }} />
                  <Text>Year Level & Section</Text>
                  <TextInput value={form.yearSection} onChangeText={(t) => setForm((s) => ({ ...s, yearSection: t }))} placeholder="e.g., 2-BSIT-A" style={{ borderWidth: 1, borderRadius: 8, padding: 8, marginBottom: 8 }} />
                  <Text>Contact Number</Text>
                  <TextInput value={form.contactNumber} onChangeText={(t) => setForm((s) => ({ ...s, contactNumber: t }))} keyboardType="phone-pad" style={{ borderWidth: 1, borderRadius: 8, padding: 8, marginBottom: 8 }} />
                  <Text>Name of the Consultant</Text>
                  <TextInput value={form.consultantName} editable={false} style={{ borderWidth: 1, borderRadius: 8, padding: 8, marginBottom: 8, backgroundColor: "#f3f4f6" }} />
                  <Text>Date of Consultation</Text>
                  <TextInput value={prefillDay} editable={false} style={{ borderWidth: 1, borderRadius: 8, padding: 8, marginBottom: 8, backgroundColor: "#f3f4f6" }} />
                  <Text>Time</Text>
                  <TextInput value={prefillTime} editable={false} style={{ borderWidth: 1, borderRadius: 8, padding: 8, marginBottom: 8, backgroundColor: "#f3f4f6" }} />
                  <Text>Duration</Text>
                  <TextInput value={"30 minutes"} editable={false} style={{ borderWidth: 1, borderRadius: 8, padding: 8, marginBottom: 8, backgroundColor: "#f3f4f6" }} />

                  <Text style={{ marginTop: 6, marginBottom: 2 }}>Nature of your inquiry</Text>
                  {[
                    ["Class Advising", "classAdvising"],
                    ["Student Organization Advising", "studentOrg"],
                    ["Course/Subject Concerns", "courseConcerns"],
                    ["Thesis", "thesis"],
                    ["Dissertation", "dissertation"],
                  ].map(([label, key]) => (
                    <Check
                      key={key}
                      label={label}
                      value={form.inquiry[key]}
                      onToggle={() => setForm((s) => ({ ...s, inquiry: { ...s.inquiry, [key]: !s.inquiry[key] } }))}
                    />
                  ))}
                  <View style={{ marginTop: 6 }}>
                    <Check
                      label="Others"
                      value={form.inquiry.others}
                      onToggle={() => setForm((s) => ({ ...s, inquiry: { ...s.inquiry, others: !s.inquiry.others } }))}
                    />
                    {form.inquiry.others && (
                      <TextInput
                        placeholder="Please specify"
                        value={form.inquiry.othersText}
                        onChangeText={(t) => setForm((s) => ({ ...s, inquiry: { ...s.inquiry, othersText: t } }))}
                        style={{ borderWidth: 1, borderRadius: 8, padding: 8, marginTop: 6 }}
                      />
                    )}
                  </View>

                  <Text style={{ marginTop: 12, marginBottom: 2 }}>Method of Consultation</Text>
                  {[
                    ["Video Conferencing", "video"],
                    ["Email", "email"],
                    ["Social Media Platform", "social"],
                    ["Text Messages", "text"],
                  ].map(([label, key]) => (
                    <Check
                      key={key}
                      label={label}
                      value={form.methods[key]}
                      onToggle={() => setForm((s) => ({ ...s, methods: { ...s.methods, [key]: !s.methods[key] } }))}
                    />
                  ))}
                  <View style={{ marginTop: 6 }}>
                    <Check
                      label="Others"
                      value={form.methods.others}
                      onToggle={() => setForm((s) => ({ ...s, methods: { ...s.methods, others: !s.methods.others } }))}
                    />
                    {form.methods.others && (
                      <TextInput
                        placeholder="Please specify"
                        value={form.methods.othersText}
                        onChangeText={(t) => setForm((s) => ({ ...s, methods: { ...s.methods, othersText: t } }))}
                        style={{ borderWidth: 1, borderRadius: 8, padding: 8, marginTop: 6 }}
                      />
                    )}
                  </View>

                  <View style={{ paddingVertical: 8 }}>
                    <Text style={{ color: "#374151" }}>
                      <Text style={{ fontWeight: "700" }}>Teacher signature:</Text> Signed by teacher
                    </Text>
                  </View>
                </ScrollView>

                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity onPress={submitPrefill} style={{ flex: 1, padding: 12, borderRadius: 8, backgroundColor: "#2563eb" }}>
                    <Text style={{ textAlign: "center", color: "white", fontWeight: "600" }}>Submit</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}
