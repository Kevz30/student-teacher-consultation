// app/student-dashboard.js
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  Modal,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { getAuth } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDoc as getDocOnce,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";

import blankProfile from "../assets/images/blank-profile.png";
import db from "../constants/firestore";
import { matchStudentToClasses } from "./utils/matchingHelper";

/* ---------- Custom Header ---------- */
function StudentHeader({ unreadCount, onOpenNotifs, onSearch, onOpenSettings }) {
  return (
    <View
      style={{
        height: 82,
        backgroundColor: "#fff",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingTop: Platform.OS === "android" ? 4 : 0,
        borderBottomWidth: 1,
        borderBottomColor: "#eee",
      }}
    >
      <Text style={{ fontSize: 22, fontWeight: "800" }}>Student Dashboard</Text>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
        {/* Search */}
        <TouchableOpacity onPress={onSearch} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="search-outline" size={26} />
        </TouchableOpacity>

        {/* Bell */}
        <TouchableOpacity
          onPress={onOpenNotifs}
          style={{ position: "relative" }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="notifications-outline" size={26} />
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

        {/* Settings */}
        <TouchableOpacity onPress={onOpenSettings} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="settings-outline" size={26} />
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

export default function StudentDashboard() {
  const [matchedTeachers, setMatchedTeachers] = useState([]);
  const [notifs, setNotifs] = useState([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const [loading, setLoading] = useState(true);

  // NEW: we keep the student's consultations in memory for the watcher
  const [myConsultations, setMyConsultations] = useState([]);

  const auth = getAuth();
  const uid = auth.currentUser?.uid;

  const router = useRouter();
  const navigation = useNavigation();

  // pulsing animation for skeletons
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

  /* ---------- Live notifications ---------- */
  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, "notifications"),
      where("userId", "==", uid),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setNotifs(arr);
    });
    return unsub;
  }, [uid]);

  const unreadCount = useMemo(() => notifs.filter((n) => !n.read).length, [notifs]);

  /* ---------- Header ---------- */
  useEffect(() => {
    navigation.setOptions({
      headerTitle: "",
      headerShadowVisible: true,
      header: () => (
        <StudentHeader
          unreadCount={unreadCount}
          onOpenNotifs={openNotifs}
          onSearch={() => Alert.alert("Search", "Search coming soon.")}
          onOpenSettings={() => Alert.alert("Settings", "Settings coming soon.")}
        />
      ),
    });
  }, [navigation, unreadCount]);

  /* ---------- NEW: subscribe to student's consultations ---------- */
  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, "consultations"), where("studentId", "==", uid));
    const unsub = onSnapshot(q, (snap) => {
      setMyConsultations(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [uid]);

  /* ---------- NEW: background checker to dispatch outcome requests ---------- */
  useEffect(() => {
    if (!uid) return;
    // Check every 30s (change to 5000 for dev if you want faster)
    const interval = setInterval(async () => {
      const now = Date.now();
      const due = myConsultations.filter((c) => {
        const status = String(c.status || "").toLowerCase();
        return (
          status === "signed_by_teacher" &&
          typeof c.endAtMs === "number" &&
          c.endAtMs <= now &&
          !c.outcomeDispatched
        );
      });

      for (const c of due) {
        try {
          const ref = doc(db, "consultations", c.id);
          // double-check latest server state to avoid duplicates
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
              createdAt: serverTimestamp(),
              createdAtMs: Date.now(),
              read: false,
            }),
            updateDoc(ref, { outcomeDispatched: true }),
          ]);
        } catch (e) {
          // noop: best-effort
        }
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [uid, myConsultations]);

  /* ---------- Helpers ---------- */
  const openNotifs = async () => {
    setShowNotifs(true);
    const unread = notifs.filter((n) => !n.read);
    if (!unread.length) return;

    // Optimistic UI: remove dot right away
    setNotifs((prev) => prev.map((n) => (n.read ? n : { ...n, read: true })));

    try {
      await Promise.all(
        unread.map((n) =>
          updateDoc(doc(db, "notifications", n.id), { read: true, readAt: serverTimestamp() })
        )
      );
    } catch {}
  };

  const markAllRead = async () => {
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

  // NEW: tap a notification
  const openNotif = async (n) => {
    try {
      if (!n.read) {
        await updateDoc(doc(db, "notifications", n.id), { read: true, readAt: serverTimestamp() });
        setNotifs((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      }

      if (n.type === "consultation_outcome_request" && n.consultationId) {
        // Step 3 will open a real modal to collect notes & upload to Cloudinary.
        Alert.alert(
          "Outcome notes",
          "This is where you'll fill your notes. We’ll add the form in the next step."
        );
        return;
      }

      // default
      Alert.alert(n.title || "Notification", n.message || "");
    } catch {}
  };

  /* ---------- UI ---------- */
  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 8 }}>
        Your Matched Teachers
      </Text>

      {loading ? (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <ActivityIndicator />
            <Text style={{ color: "#6b7280" }}>Finding your matched teachers…</Text>
          </View>
          {/* 3 skeleton rows */}
          <SkeletonCard pulse={pulse} />
          <SkeletonCard pulse={pulse} />
          <SkeletonCard pulse={pulse} />
        </>
      ) : matchedTeachers.length === 0 ? (
        <Text>No matched teachers found.</Text>
      ) : (
        <FlatList
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

      {/* Notifications modal */}
      <Modal visible={showNotifs} transparent animationType="fade" onRequestClose={() => setShowNotifs(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 16 }}>
          <View style={{ backgroundColor: "white", borderRadius: 12, maxHeight: "80%", padding: 14 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <Text style={{ fontSize: 16, fontWeight: "700" }}>Notifications</Text>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <TouchableOpacity onPress={markAllRead} disabled={!unreadCount}>
                  <Text style={{ color: unreadCount ? "#2563eb" : "#9ca3af", fontWeight: "600" }}>
                    Mark all read
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowNotifs(false)}>
                  <Text style={{ color: "#2563eb", fontWeight: "600" }}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView>
              {notifs.length === 0 ? (
                <Text style={{ color: "#6b7280" }}>No notifications yet.</Text>
              ) : (
                notifs.map((n) => (
                  <TouchableOpacity
                    key={n.id}
                    onPress={() => openNotif(n)}
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
