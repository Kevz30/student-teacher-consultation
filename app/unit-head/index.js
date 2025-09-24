// app/unit-head/index.js
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRouter } from "expo-router";
import { sendPasswordResetEmail, signOut } from "firebase/auth";
import { collection, doc, getDoc, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  FlatList,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import auth from "../../constants/auth";
import db from "../../constants/firestore";

const norm = (s = "") => String(s).trim().toLowerCase();

const Badge = ({ text, tint = "#e5e7eb", border = "#e5e7eb", color = "#374151" }) => (
  <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: tint, borderWidth: 1, borderColor: border }}>
    <Text style={{ fontWeight: "700", color }}>{text}</Text>
  </View>
);

/* --- Dashboard Card --- */
function Tile({ icon, accent = "#2563eb", tint = "#e5efff", title, subtitle, onPress, badge }) {
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: "rgba(0,0,0,0.06)" }}
      style={({ pressed }) => [
        {
          flex: 1,
          borderRadius: 22,
          padding: 18,
          backgroundColor: "#fff",
          borderWidth: 1,
          borderColor: "#e9edf2",
          shadowColor: "#000",
          shadowOpacity: 0.06,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 3 },
          elevation: 2,
          transform: [{ scale: pressed ? 0.98 : 1 }],
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
        },
      ]}
    >
      {!!badge && (
        <View style={{ position: "absolute", top: 10, right: 10, backgroundColor: "#111827", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 }}>
          <Text style={{ color: "white", fontSize: 12, fontWeight: "800" }}>{badge}</Text>
        </View>
      )}
      <View style={{ width: 72, height: 72, borderRadius: 18, backgroundColor: tint, alignItems: "center", justifyContent: "center", marginBottom: 6 }}>
        <Ionicons name={icon} size={36} color={accent} />
      </View>
      <Text style={{ fontSize: 16, fontWeight: "800", textAlign: "center" }}>{title}</Text>
      <Text style={{ color: "#6b7280", textAlign: "center" }}>{subtitle}</Text>
    </Pressable>
  );
}

/* --- Teacher list Card (with non-overlapping notif badge) --- */
function TeacherCard({ item, onPress, notifCount = 0 }) {
  const status = (item.status || "").toLowerCase();
  const isApproved = status === "approved";
  const pill = {
    bg: isApproved ? "#e9f9ef" : "#fff7ed",
    text: isApproved ? "#047857" : "#92400e",
    border: isApproved ? "#bbf7d0" : "#fed7aa",
    label: isApproved ? "approved" : (status || "pending"),
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.9}
      style={{
        backgroundColor: "#fff",
        borderRadius: 18,
        paddingHorizontal: 16,
        paddingVertical: 14,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: "#e9edf2",
        shadowColor: "#000",
        shadowOpacity: 0.06,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: 2,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: "800", fontSize: 16 }} numberOfLines={1}>
          {item.displayName || item.fullName || "(no name)"}
        </Text>
        <Text style={{ color: "#6b7280" }} numberOfLines={1}>
          {item.email || "-"}
        </Text>
      </View>

      <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: pill.bg, borderWidth: 1, borderColor: pill.border }}>
        <Text style={{ color: pill.text, fontWeight: "800" }}>{pill.label}</Text>
      </View>

      {notifCount > 0 && (
        <View style={{ marginLeft: 8, backgroundColor: "#ef4444", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, minWidth: 20, alignItems: "center" }}>
          <Text style={{ color: "white", fontWeight: "800", fontSize: 12 }}>{notifCount}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

/* --- Smooth RIGHT→LEFT sliding Settings sheet (half screen) --- */
function SettingsSheet({ visible, onClose, onResetPassword, onLogout }) {
  const screenW = Dimensions.get("window").width;
  const sheetW = Math.round(screenW * 0.5);
  const [mounted, setMounted] = useState(visible);
  const slideX = useRef(new Animated.Value(sheetW)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(slideX, { toValue: 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(overlayOpacity, { toValue: 0.35, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start();
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(slideX, { toValue: sheetW, duration: 240, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.timing(overlayOpacity, { toValue: 0, duration: 200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]).start(() => setMounted(false));
    }
  }, [visible]);

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={{ flex: 1, flexDirection: "row" }}>
        <Animated.View style={{ flex: 1, backgroundColor: "black", opacity: overlayOpacity }}>
          <Pressable style={{ flex: 1 }} onPress={onClose} />
        </Animated.View>

        <Animated.View
          style={{
            width: sheetW,
            backgroundColor: "#fff",
            height: "100%",
            borderTopLeftRadius: 18,
            borderBottomLeftRadius: 18,
            paddingTop: Platform.OS === "android" ? 16 : 18,
            shadowColor: "#000",
            shadowOpacity: 0.18,
            shadowRadius: 18,
            elevation: 16,
            transform: [{ translateX: slideX }],
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 8, borderBottomWidth: 1, borderColor: "#f1f5f9" }}>
            <Text style={{ fontSize: 18, fontWeight: "800", flex: 1 }}>Settings</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color="#111827" />
            </Pressable>
          </View>

          <Pressable
            onPress={onResetPassword}
            android_ripple={{ color: "rgba(0,0,0,0.06)" }}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: 14,
              paddingHorizontal: 16,
              borderBottomWidth: 1,
              borderColor: "#f1f5f9",
              gap: 12,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            })}
          >
            <Ionicons name="key-outline" size={20} color="#111827" />
            <Text style={{ fontSize: 16, color: "#111827" }}>Change password</Text>
          </Pressable>

          <Pressable
            onPress={onLogout}
            android_ripple={{ color: "rgba(0,0,0,0.06)" }}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: 14,
              paddingHorizontal: 16,
              borderBottomWidth: 1,
              borderColor: "#f1f5f9",
              gap: 12,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            })}
          >
            <Ionicons name="log-out-outline" size={20} color="#dc2626" />
            <Text style={{ fontSize: 16, color: "#dc2626", fontWeight: "600" }}>Log out</Text>
          </Pressable>

          <View style={{ marginTop: "auto", paddingHorizontal: 16, paddingVertical: 12 }}>
            <Text style={{ color: "#9ca3af", fontSize: 12 }}>v1.0 • Simple & modern • iConsult</Text>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

/* =================== MAIN SCREEN =================== */

export default function UnitHeadScreen() {
  const uid = auth.currentUser?.uid;
  const router = useRouter();
  const navigation = useNavigation();

  const [scopeCollege, setScopeCollege] = useState(null);
  const [scopeCourse, setScopeCourse] = useState(null);
  const [mode, setMode] = useState("dashboard"); // "dashboard" | "teachers" | "students"

  const [teachers, setTeachers] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [qText, setQText] = useState("");

  const [showSettings, setShowSettings] = useState(false);

  // 🔴 notif counts per teacherId
  const consultUnsubsRef = useRef([]);
  const [notifMap, setNotifMap] = useState({});

  // load scope
  useEffect(() => {
    if (!uid) return;
    (async () => {
      const snap = await getDoc(doc(db, "users", uid));
      const data = snap.exists() ? snap.data() : {};
      const targetCourse = data.targetCourse || data.targetCourese || data.course || data.unitScope?.course || null;
      const college = targetCourse ? null : (data.college || data.unitScope?.college || null);
      setScopeCourse(targetCourse || null);
      setScopeCollege(college || null);
    })();
  }, [uid]);

  // live data by scope
  useEffect(() => {
    if (!scopeCourse && !scopeCollege) return;
    setLoading(true);

    const unsubTeachers = onSnapshot(
      query(collection(db, "instructors"), orderBy("displayName", "asc")),
      (snap) => {
        const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const filtered = all.filter((t) =>
          scopeCourse ? norm(t.course||"")===norm(scopeCourse) : norm(t.college||"")===norm(scopeCollege)
        );
        setTeachers(filtered);
        setLoading(false);
      },
      (e) => { console.warn(e?.message||e); setLoading(false); }
    );

    const unsubStudents = onSnapshot(
      query(collection(db, "students"), orderBy("fullName", "asc")),
      (snap) => {
        const all = snap.docs.map((d) => ({ id: d.id, ...d.data() } ));
        const filtered = all.filter((s) =>
          scopeCourse ? norm(s.course||"")===norm(scopeCourse) : norm(s.department||"")===norm(scopeCollege)
        );
        setStudents(filtered);
      },
      (e) => console.warn(e?.message||e)
    );

    return () => { unsubTeachers(); unsubStudents(); };
  }, [scopeCollege, scopeCourse]);

  // 🔔 set up consultation listeners for teachers in scope (chunked by 10)
  useEffect(() => {
    // clear previous
    consultUnsubsRef.current.forEach((u) => u && u());
    consultUnsubsRef.current = [];
    setNotifMap({});

    const ids = Array.from(new Set(teachers.map((t) => String(t.id)).filter(Boolean)));
    if (ids.length === 0) return;

    const chunkSize = 10;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const subset = ids.slice(i, i + chunkSize);
      const qy = query(collection(db, "consultations"), where("teacherId", "in", subset));
      const unsub = onSnapshot(
        qy,
        (snap) => {
          const counts = {};
          // initialize subset teachers to 0 so removals clear the badge
          subset.forEach((id) => (counts[id] = 0));
          snap.docs.forEach((d) => {
            const c = d.data();
            const status = String(c.status || "").toLowerCase();
            const notDeclined =
              status !== "declined_by_teacher" &&
              status !== "declined" &&
              status !== "cancelled" &&
              status !== "canceled";
            const hasTeacherSig = !!(c.teacherSignature && c.teacherSignature.base64);
            const noUHsig = !(c.unitHeadSignature && c.unitHeadSignature.base64);
            if (hasTeacherSig && noUHsig && notDeclined) {
              const tid = String(c.teacherId || "");
              if (tid && subset.includes(tid)) counts[tid] = (counts[tid] || 0) + 1;
            }
          });
          setNotifMap((prev) => ({ ...prev, ...counts }));
        },
        (e) => console.warn("[consultations] listener err:", e?.message || e)
      );
      consultUnsubsRef.current.push(unsub);
    }

    return () => {
      consultUnsubsRef.current.forEach((u) => u && u());
      consultUnsubsRef.current = [];
    };
  }, [teachers]);

  const qNorm = useMemo(() => norm(qText), [qText]);
  const viewTeachers = useMemo(() => {
    if (!qNorm) return teachers;
    return teachers.filter((t) => norm(`${t.displayName||t.fullName||""} ${t.email||""} ${t.course||""}`).includes(qNorm));
  }, [teachers, qNorm]);

  const viewStudents = useMemo(() => {
    if (!qNorm) return students;
    return students.filter((s) => norm(`${s.fullName||""} ${s.email||""} ${s.course||""}`).includes(qNorm));
  }, [students, qNorm]);

  const approvedCount = useMemo(
    () => teachers.filter((t) => (t.status || "").toLowerCase() === "approved").length,
    [teachers]
  );
  const pendingCount = useMemo(
    () => teachers.filter((t) => (t.status || "").toLowerCase() !== "approved").length,
    [teachers]
  );

  const scopeLabel = scopeCourse ? `${scopeCourse} (course scope)` :
                     scopeCollege ? `${scopeCollege} (college scope)` : "(no scope)";

  const openSettings = () => setShowSettings(true);
  const closeSettings = () => setShowSettings(false);

  const handleResetPassword = async () => {
    try {
      const email = auth.currentUser?.email;
      if (!email) {
        Alert.alert("No email on account", "Add an email to your account first, then try resetting the password.");
        return;
      }
      await sendPasswordResetEmail(auth, email);
      Alert.alert("Email sent", `Password reset link sent to ${email}.`);
    } catch (e) {
      Alert.alert("Reset failed", e?.message || String(e));
    } finally {
      closeSettings();
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      Alert.alert("Logout failed", e?.message || String(e));
    } finally {
      closeSettings();
      // keep history clean
      router.replace("/screens/LoginScreen");
    }
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle:
        mode === "dashboard"
          ? `Unit Head — ${scopeLabel}`
          : `${mode === "teachers" ? "Teachers" : "Students"} — ${scopeLabel}`,
      headerLeft: () =>
        mode === "dashboard" ? null : (
          <Pressable onPress={() => setMode("dashboard")} hitSlop={10} style={{ paddingHorizontal: 8 }}>
            <Ionicons name="arrow-back" size={22} color="#111827" />
          </Pressable>
        ),
      headerRight: () => (
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {mode === "teachers" && (
            <Pressable
              onPress={() =>
                router.push(
                  `/unit-head/create-teacher?course=${encodeURIComponent(scopeCourse||"")}&college=${encodeURIComponent(scopeCollege||"")}`
                )
              }
              hitSlop={10}
              style={{ paddingHorizontal: 8 }}
            >
              <Ionicons name="add" size={24} color="#111827" />
            </Pressable>
          )}
          <Pressable onPress={openSettings} hitSlop={10} style={{ paddingHorizontal: 8 }}>
            <Ionicons name="settings-outline" size={22} color="#111827" />
          </Pressable>
        </View>
      ),
    });
  }, [navigation, mode, scopeLabel, scopeCourse, scopeCollege, router]);

  /* ---------- DASHBOARD ---------- */
  if (mode === "dashboard") {
    return (
      <View style={{ flex: 1, padding: 16, paddingTop: Platform.OS==="android"?8:8, backgroundColor:"#fff" }}>
        <View style={{ flex: 1, gap: 12 }}>
          <View style={{ flexDirection: "row", gap: 12, flex: 1 }}>
            <Tile
              icon="checkmark-done-outline"
              accent="#16a34a"
              tint="#e9f9ef"
              title="Pending Approvals"
              subtitle="Review and approve"
              badge={pendingCount > 0 ? String(pendingCount) : undefined}
              onPress={() => router.push("/admin/teacher-approvals")}
            />
            <Tile
              icon="people-outline"
              accent="#7c3aed"
              tint="#eee7ff"
              title="Teacher"
              subtitle={`${approvedCount} approved`}
              onPress={() => setMode("teachers")}
            />
          </View>
          <View style={{ flexDirection: "row", gap: 12, flex: 1 }}>
            <Tile
              icon="school-outline"
              accent="#2563eb"
              tint="#e7f0ff"
              title="Students"
              subtitle="Browse students"
              onPress={() => setMode("students")}
            />
            <Tile
              icon="bar-chart-outline"
              accent="#1d4ed8"
              tint="#e8f0ff"
              title="View Metrics"
              subtitle="Analytics & insights"
              onPress={() => router.push("/unit-head/metrics")}
            />
          </View>
        </View>

        <SettingsSheet
          visible={showSettings}
          onClose={closeSettings}
          onResetPassword={handleResetPassword}
          onLogout={handleLogout}
        />
      </View>
    );
  }

  /* ---------- LISTS ---------- */
  const titleText = mode === "teachers" ? "Teachers" : "Students";

  return (
    <View style={{ flex: 1, padding: 16, paddingTop: Platform.OS==="android"?8:8, backgroundColor:"#fff" }}>
      <TextInput
        value={qText}
        onChangeText={setQText}
        placeholder={`Search ${titleText.toLowerCase()} by name, email, or course…`}
        style={{ borderWidth:1, borderColor:"#e5e7eb", borderRadius:12, paddingHorizontal:12, paddingVertical:10, marginBottom:12, backgroundColor:"#fafafa" }}
      />

      {loading ? (
        <View style={{ alignItems: "center", marginTop: 20 }}>
          <ActivityIndicator />
          <Text style={{ color: "#6b7280", marginTop: 8 }}>Loading…</Text>
        </View>
      ) : mode === "teachers" ? (
        viewTeachers.length === 0 ? (
          <Text style={{ color: "#6b7280" }}>No teachers found.</Text>
        ) : (
          <FlatList
            data={viewTeachers}
            keyExtractor={(it) => it.id}
            renderItem={({ item }) => (
              <TeacherCard
                item={item}
                onPress={() => router.push(`/teacher-schedule/${item.id}?fromUH=1`)}
                notifCount={notifMap[item.id] || 0}
              />
            )}
            contentContainerStyle={{ paddingBottom: 24 }}
          />
        )
      ) : viewStudents.length === 0 ? (
        <Text style={{ color: "#6b7280" }}>No students found.</Text>
      ) : (
        <FlatList
          data={viewStudents}
          keyExtractor={(it) => it.id}
          renderItem={({ item }) => (
            <View
              style={{
                backgroundColor: "#fff",
                borderRadius: 18,
                paddingHorizontal: 16,
                paddingVertical: 14,
                marginBottom: 10,
                borderWidth: 1,
                borderColor: "#e9edf2",
                shadowColor: "#000",
                shadowOpacity: 0.06,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 3 },
                elevation: 2,
              }}
            >
              <Text style={{ fontWeight: "800", fontSize: 16 }} numberOfLines={1}>
                {item.fullName || "(no name)"}
              </Text>
              <Text style={{ color: "#6b7280" }} numberOfLines={1}>
                {item.email || "-"}
              </Text>
            </View>
          )}
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      )}

      <SettingsSheet
        visible={showSettings}
        onClose={closeSettings}
        onResetPassword={handleResetPassword}
        onLogout={handleLogout}
      />
    </View>
  );
}
