// app/teacher-dashboard.js
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { router, useNavigation } from "expo-router";
import { getAuth, signOut, updateProfile } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  Image,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as XLSX from "xlsx";
import { createDefaultGrid } from "../app/utils/scheduleTemplate";
import ScheduleGrid from "../components/ScheduleGrid";
import TeacherConsultModal from "../components/TeacherConsultModal";
import db from "../constants/firestore";
import MyClasses from "./my-classes";
import uploadToCloudinary from "./utils/uploadToCloudinary";

const norm = (s = "") => String(s).replace(/–/g, "-").replace(/\s+/g, "").toLowerCase();

/* ---------- Header (title + icons row) ---------- */
function TeacherHeader({
  unreadCount,
  activeTab,
  onOpenCalendar,
  onOpenClasses,
  onOpenNotifs,
  onOpenSettings,
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
      <Text style={{ fontSize: 24, fontWeight: "800", color: "#111827", marginBottom: 12 }}>
        Teacher Dashboard
      </Text>

      <View style={{ flexDirection: "row", justifyContent: "space-around", alignItems: "center" }}>
        <TouchableOpacity accessibilityLabel="Calendar" onPress={onOpenCalendar}>
          <Ionicons name="calendar-outline" size={28} color={iconColor("calendar")} />
        </TouchableOpacity>

        <TouchableOpacity onPress={onOpenClasses} accessibilityLabel="My Classes">
          <Ionicons name="school-outline" size={28} color={iconColor("classes")} />
        </TouchableOpacity>

        <TouchableOpacity onPress={onOpenNotifs} style={{ position: "relative" }} accessibilityLabel="Notifications">
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

        <TouchableOpacity onPress={onOpenSettings} accessibilityLabel="Settings">
          <Ionicons name="settings-outline" size={28} color={iconColor("settings")} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function TeacherDashboard() {
  const [grid, setGrid] = useState(null);
  const [hasSchedule, setHasSchedule] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // settings drawer
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [photoURL, setPhotoURL] = useState("");

  // yellow tap modal
  const [consultationId, setConsultationId] = useState(null);
  const [teacherModalOpen, setTeacherModalOpen] = useState(false);
  const [lastTap, setLastTap] = useState(null); // { day, slot }

  // notifications (teacher)
  const [notifs, setNotifs] = useState([]);

  const auth = getAuth();
  theUser: {}
  const user = auth.currentUser;
  const uid = user?.uid;
  const navigation = useNavigation();

  const unreadCount = useMemo(() => notifs.filter((n) => !n.read).length, [notifs]);

  /* ---------- Tabs + direction-aware slide animation ---------- */
  const [activeTab, setActiveTab] = useState("calendar"); // "calendar" | "classes" | "notifications"
  const { width } = useWindowDimensions();
  const slideX = useRef(new Animated.Value(0)).current;

  // icon order left ➜ right
  const tabOrder = ["calendar", "classes", "notifications"];
  const smoothEase = Easing.bezier(0.22, 1, 0.36, 1); // smooth ease-out

  const switchTo = (nextTab) => {
    if (activeTab === nextTab) return;

    const from = tabOrder.indexOf(activeTab);
    const to = tabOrder.indexOf(nextTab);
    const direction = to > from ? +1 : -1; // rightward => slide left, leftward => slide right

    setActiveTab(nextTab);
    slideX.setValue(direction * width);
    Animated.timing(slideX, {
      toValue: 0,
      duration: 320,
      easing: smoothEase,
      useNativeDriver: true,
    }).start();
  };

  /* ---------- Custom header ---------- */
  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: "",
      headerShadowVisible: true,
      header: () => (
        <>
          <StatusBar translucent={false} backgroundColor="#fff" barStyle="dark-content" />
          <TeacherHeader
            unreadCount={unreadCount}
            activeTab={activeTab}
            onOpenCalendar={() => switchTo("calendar")}
            onOpenClasses={() => switchTo("classes")}
            onOpenNotifs={() => switchTo("notifications")}
            onOpenSettings={() => setSettingsVisible(true)}
          />
        </>
      ),
    });
  }, [navigation, unreadCount, activeTab]);

  /* ---------- LIVE schedule + one-time profile ---------- */
  useEffect(() => {
    if (!uid) return;

    // live schedule doc
    const unsubSched = onSnapshot(doc(db, "schedules", uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setGrid(data.grid || null);
        setHasSchedule(!!data.grid);
        setShowConfirm(false); // remote changes shouldn't show confirm
      } else {
        setGrid(null);
        setHasSchedule(false);
        setShowConfirm(false);
      }
    });

    // one-time profile init
    setDisplayName(user?.displayName || "");
    setPhotoURL(user?.photoURL || "");

    return () => {
      unsubSched && unsubSched();
    };
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
      setNotifs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [uid]);

  const markAllRead = async () => {
    const unread = notifs.filter((n) => !n.read);
    await Promise.all(
      unread.map((n) =>
        updateDoc(doc(db, "notifications", n.id), { read: true, readAt: serverTimestamp() })
      )
    );
  };

  const clearAllNotifs = async () => {
    if (!uid) return;
    const snap = await getDocs(
      query(collection(db, "notifications"), where("userId", "==", uid))
    );
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  };

  /* ---------- helpers to extract / update cell ---------- */
  const normFindKey = (row, slot) => {
    if (row[slot]) return slot;
    const match = Object.keys(row).find((k) => norm(k) === norm(slot));
    return match || null;
  };

  const extractDaySlot = (consultData) => {
    const day = consultData?.day || consultData?.form?.date || null;
    const slot = consultData?.time || consultData?.form?.time || null;
    return { day, slot };
  };

  const updateCellBlue = async (day, slot) => {
    if (!grid || !day || !slot) return false;
    const g = { ...(grid || {}) };
    const row = g[day];
    if (!row) return false;
    const key = normFindKey(row, slot);
    if (!key) return false;
    g[day] = { ...row, [key]: "blue" };
    await setDoc(doc(db, "schedules", uid), { grid: g }, { merge: true });
    setGrid(g);
    return true;
  };

  const updateCellWhite = async (day, slot) => {
    if (!grid || !day || !slot) return false;
    const g = { ...(grid || {}) };
    const row = g[day];
    if (!row) return false;
    const key = normFindKey(row, slot);
    if (!key) return false;
    g[day] = { ...row, [key]: "white" };
    await setDoc(doc(db, "schedules", uid), { grid: g }, { merge: true });
    setGrid(g);
    return true;
  };

  const updateCellRed = async (day, slot) => {
    if (!grid || !day || !slot) return false;
    const g = { ...(grid || {}) };
    const row = g[day];
    if (!row) return false;
    const key = normFindKey(row, slot);
    if (!key) return false;
    g[day] = { ...row, [key]: "red" };
    await setDoc(doc(db, "schedules", uid), { grid: g }, { merge: true });
    setGrid(g);
    return true;
  };

  const openNotif = async (n) => {
    try {
      if (!n.read) {
        await updateDoc(doc(db, "notifications", n.id), { read: true, readAt: serverTimestamp() });
      }

      if (n.consultationId) {
        try {
          const snap = await getDoc(doc(db, "consultations", n.consultationId));
          if (snap.exists()) {
            const { day, slot } = extractDaySlot(snap.data());
            if (day && slot) setLastTap({ day, slot });
          }
        } catch {}
        setConsultationId(n.consultationId);
        setTeacherModalOpen(true);
        return;
      }

      if (n.day && n.time) {
        setLastTap({ day: n.day, slot: n.time });
        onOpenTeacherConsultModal({ day: n.day, slot: n.time });
        return;
      }

      Alert.alert(n.title || "Notification", n.message || "");
    } catch (e) {
      Alert.alert("Error", String(e?.message || e));
    }
  };

  // ---------- Teacher: tap yellow -> open modal ----------
  const onOpenTeacherConsultModal = async ({ day, slot }) => {
    try {
      if (!uid) return;
      setLastTap({ day, slot });

      let q1 = query(
        collection(db, "consultations"),
        where("teacherId", "==", uid),
        where("day", "==", day),
        where("time", "==", slot),
        limit(1)
      );
      let qs = await getDocs(q1);

      if (qs.empty) {
        const q2 = query(
          collection(db, "consultations"),
          where("teacherId", "==", uid),
          where("day", "==", day),
          limit(25)
        );
        const qs2 = await getDocs(q2);
        const hit = qs2.docs.find((d) => norm(d.data().time) === norm(slot));
        if (hit) qs = { empty: false, docs: [hit] };
      }

      if (qs.empty) Alert.alert("No request", "No consultation found for this block.");
      else {
        setConsultationId(qs.docs[0].id);
        setTeacherModalOpen(true);
      }
    } catch (e) {
      Alert.alert("Error", String(e?.message || e));
    }
  };

  const handleModalClose = async () => {
    setTeacherModalOpen(false);
    try {
      if (!consultationId) return;
      const snap = await getDoc(doc(db, "consultations", consultationId));
      const d = snap.exists() ? snap.data() : null;
      const status = String(d?.status || "").toLowerCase();
      if (d) {
        let day = lastTap?.day;
        let slot = lastTap?.slot;
        if (!day || !slot) {
          const derived = extractDaySlot(d);
          day = derived.day;
          slot = derived.slot;
        }
        if (status === "signed_by_teacher") {
          await updateCellBlue(day, slot);
        }
        if (status === "declined_by_teacher") {
          await updateCellWhite(day, slot);
        }
      }
    } finally {
      setConsultationId(null);
      setLastTap(null);
    }
  };

  // 🔹 Cancel a blue schedule — update consultation, flip grid to red, notify student (FETCH teacher name from Firestore)
  const handleCancelSchedule = async (day, slot, reason) => {
    if (!uid) throw new Error("No user");

    // fetch teacher name fresh from Firestore to ensure it's the real/latest name
    let actorName = "your teacher";
    try {
      const userSnap = await getDoc(doc(db, "users", uid));
      const nameFromUsers = userSnap.exists() ? userSnap.data()?.displayName : null;
      actorName = nameFromUsers || user?.displayName || actorName;
    } catch {
      actorName = user?.displayName || actorName;
    }

    // find the consultation for this day/slot
    let q1 = query(
      collection(db, "consultations"),
      where("teacherId", "==", uid),
      where("day", "==", day),
      where("time", "==", slot),
      limit(1)
    );
    let qs = await getDocs(q1);

    if (qs.empty) {
      // fallback to normalized time match within the same day
      const q2 = query(
        collection(db, "consultations"),
        where("teacherId", "==", uid),
        where("day", "==", day),
        limit(25)
      );
      const qs2 = await getDocs(q2);
      const hit = qs2.docs.find((d) => norm(d.data().time) === norm(slot));
      if (hit) qs = { empty: false, docs: [hit] };
    }

    if (qs.empty) {
      throw new Error("No matching consultation found for this block.");
    }

    const consultRef = qs.docs[0].ref;
    const consult = qs.docs[0].data();
    const studentId = consult.studentId;

    // update consultation doc
    await updateDoc(consultRef, {
      status: "cancelled_by_teacher",
      cancelReason: reason,
      cancelledAt: serverTimestamp(),
      cancelledByName: actorName,
      cancelledById: uid,
    });

    // flip grid to red
    await updateCellRed(day, slot);

    // notify the student (include actor + timestamp)
    if (studentId) {
      await addDoc(collection(db, "notifications"), {
        userId: studentId,
        title: `Consultation cancelled by ${actorName}`,
        message: `Your consultation with ${actorName} on ${day} at ${slot} was cancelled.\nReason: ${reason}`,
        createdAt: serverTimestamp(),
        read: false,
        consultationId: consultRef.id,
        day,
        time: slot,
        type: "consultation_cancelled",
        actorId: uid,
        actorName,
        actorRole: "teacher",
      });
    }

    Alert.alert("Cancelled", "The schedule was cancelled and the student was notified.");
  };

  // ---------- Upload / Edit / Save schedule ----------
  const handleUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-excel",
        ],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;

      const file = result.assets[0];
      const res = await fetch(file.uri);
      const data = await res.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array", cellStyles: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      const headerRow = json[0];
      const merged = sheet["!merges"] || [];
      const newGrid = createDefaultGrid();

      merged.forEach(({ s, e }) => {
        const startRow = s.r;
        const endRow = e.r;
        const col = s.c;
        const day = headerRow[col];
        const rows = json.slice(startRow, endRow + 1);
        rows.forEach((_, i) => {
          const time = json[startRow + i][0];
          if (newGrid[day] && newGrid[day][time]) newGrid[day][time] = "red";
        });
      });

      setGrid(newGrid);
      setHasSchedule(true);
      setShowConfirm(true);
    } catch (err) {
      Alert.alert("Error", err.message);
    }
  };

  const handleBlockSelect = (day, slot, newColor) => {
    const current = grid[day][slot];
    if (current === newColor) return;
    const newGrid = { ...grid, [day]: { ...grid[day], [slot]: newColor } };
    setGrid(newGrid);
    setShowConfirm(true);
  };

  const handleConfirm = async () => {
    if (!uid || !grid) return;
    const ref = doc(db, "schedules", uid);
    const snap = await getDoc(ref);
    const payload = { grid, uploadedAt: serverTimestamp() };
    if (!snap.exists() || !snap.data()?.defaultGrid) payload.defaultGrid = grid;
    await setDoc(ref, payload, { merge: true });
    Alert.alert("Saved", "Schedule updated.");
    setShowConfirm(false);
  };

  // ---- Settings actions ----
  const handleSaveSettings = async () => {
    try {
      await updateProfile(user, { displayName });
      await setDoc(doc(db, "users", uid), { displayName }, { merge: true });
      Alert.alert("Updated", "Profile updated.");
      setSettingsVisible(false);
    } catch (err) {
      Alert.alert("Error", err.message);
    }
  };

  const handleImagePick = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 1,
    });
    if (result.canceled) return;

    const uri = result.assets[0].uri;
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: "base64" });

    try {
      const imageUrl = await uploadToCloudinary(base64, "teacher_photo_upload");
      await updateProfile(user, { photoURL: imageUrl });
      await setDoc(doc(db, "users", uid), { photoURL: imageUrl }, { merge: true });
      setPhotoURL(imageUrl);
      Alert.alert("Success", "Profile photo updated.");
    } catch (err) {
      Alert.alert("Upload Failed", "Could not upload image.");
    }
  };

  const handleLogout = async () => {
    Alert.alert("Confirm Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          await signOut(auth);
          router.replace("/screens/LoginScreen");
        },
      },
    ]);
  };

  /* ---------- Simple timestamp formatter for the notifications list ---------- */
  const formatWhen = (ts) => {
    try {
      const d = ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null;
      if (!d) return "";
      return d.toLocaleString();
    } catch {
      return "";
    }
  };

  /* ===== Helpers for the cancellation modal details (student name, year/section, method, nature) ===== */
  const joinMethods = (m = {}) => {
    if (!m || typeof m !== "object") return null;
    const items = [];
    if (m.video) items.push("Video Conferencing");
    if (m.email) items.push("Email");
    if (m.social) items.push("Social Media Platform");
    if (m.text) items.push("Text Messages");
    if (m.others) items.push(m.othersText ? `Others (${m.othersText})` : "Others");
    return items.length ? items.join(", ") : null;
  };

  const joinInquiry = (q = {}) => {
    if (!q || typeof q !== "object") return null;
    const items = [];
    if (q.classAdvising) items.push("Class Advising");
    if (q.studentOrg) items.push("Student Organization Advising");
    if (q.courseConcerns) items.push("Course/Subject Concerns");
    if (q.thesis) items.push("Thesis");
    if (q.dissertation) items.push("Dissertation");
    if (q.others) items.push(q.othersText ? `Others (${q.othersText})` : "Others");
    return items.length ? items.join(", ") : null;
  };

  // 🔹 This is called by ScheduleGrid when you open the "Cancel schedule" modal on a blue cell.
  const getConsultDetails = async (day, slot) => {
    if (!uid) return null;

    // Query by exact day/time first
    let q1 = query(
      collection(db, "consultations"),
      where("teacherId", "==", uid),
      where("day", "==", day),
      where("time", "==", slot),
      limit(1)
    );
    let qs = await getDocs(q1);

    // Fallback: same day, normalized  time
    if (qs.empty) {
      const q2 = query(
        collection(db, "consultations"),
        where("teacherId", "==", uid),
        where("day", "==", day),
        limit(25)
      );
      const qs2 = await getDocs(q2);
      const hit = qs2.docs.find((d) => norm(d.data().time) === norm(slot));
      if (hit) qs = { empty: false, docs: [hit] };
    }

    if (qs.empty) return null;

    const data = qs.docs[0].data();
    const studentName =
      data.form?.nameClient || data.studentName || "-";
    const yearSection =
      data.form?.yearSection || "-";
    const methodsText =
      data.methodsText || joinMethods(data.form?.methods) || "-";
    const inquiryText =
      data.inquiryText || joinInquiry(data.form?.inquiry) || "-";

    return { studentName, yearSection, methodsText, inquiryText };
  };

  /* ---------- Render ---------- */
  return (
    <View style={{ flex: 1, padding: 20, backgroundColor: "#fff" }}>
      <Animated.View style={{ flex: 1, transform: [{ translateX: slideX }] }}>
        {activeTab === "notifications" ? (
          <ScrollView style={{ paddingTop: 8 }}>
            {notifs.length > 0 && (
              <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 16, marginBottom: 8 }}>
                {notifs.some((n) => !n.read) && (
                  <TouchableOpacity onPress={markAllRead}>
                    <Text style={{ color: "#2563eb", fontWeight: "700" }}>Mark all as read</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={clearAllNotifs}>
                  <Text style={{ color: "#ef4444", fontWeight: "700" }}>Clear</Text>
                </TouchableOpacity>
              </View>
            )}

            {notifs.length === 0 ? (
              <Text style={{ color: "#6b7280" }}>No notifications yet.</Text>
            ) : (
              notifs.map((n) => (
                <TouchableOpacity
                  key={n.id}
                  onPress={() => openNotif(n)}
                  style={{
                    paddingVertical: 12,
                    paddingHorizontal: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: "#f3f4f6",
                    backgroundColor: n.read ? "#ffffff" : "#eef2ff", // highlighted until clicked
                    borderLeftWidth: n.read ? 0 : 3,
                    borderLeftColor: "#2563eb",
                    borderRadius: 8,
                    marginBottom: 6,
                  }}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      {!n.read && (
                        <View
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 4,
                            backgroundColor: "#2563eb",
                            marginRight: 6,
                          }}
                        />
                      )}
                      <Text style={{ fontWeight: "700" }}>{n.title || "Notification"}</Text>
                    </View>
                    <Text style={{ color: "#6b7280", fontSize: 12 }}>{formatWhen(n.createdAt)}</Text>
                  </View>
                  <Text style={{ color: "#374151", marginTop: 2 }}>{n.message}</Text>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        ) : activeTab === "classes" ? (
          <MyClasses />
        ) : (
          <>
            {!hasSchedule ? (
              <TouchableOpacity
                onPress={handleUpload}
                style={{ backgroundColor: "#2196F3", padding: 12, borderRadius: 6, alignItems: "center" }}
              >
                <Text style={{ color: "#fff" }}>Upload your current schedule</Text>
              </TouchableOpacity>
            ) : (
              <>
                {/* ==== confirm button ABOVE the grid ==== */}
                {showConfirm && (
                  <TouchableOpacity
                    onPress={handleConfirm}
                    style={{
                      backgroundColor: "green",
                      padding: 12,
                      borderRadius: 6,
                      alignItems: "center",
                      marginBottom: 10,
                    }}
                  >
                    <Text style={{ color: "#fff" }}>Confirm Changes</Text>
                  </TouchableOpacity>
                )}

                {/* ==== make the GRID scrollable ONLY when showConfirm is true ==== */}
                {showConfirm ? (
                  <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={{ paddingBottom: 8 }}
                    keyboardShouldPersistTaps="handled"
                  >
                    <ScheduleGrid
                      grid={grid}
                      onSelectBlock={handleBlockSelect}
                      onOpenTeacherConsultModal={onOpenTeacherConsultModal}
                      onCancelSchedule={handleCancelSchedule}
                      // 🔹 Provide details for the cancel modal
                      getConsultDetails={getConsultDetails}
                      teacherId={uid}
                    />
                  </ScrollView>
                ) : (
                  <ScheduleGrid
                    grid={grid}
                    onSelectBlock={handleBlockSelect}
                    onOpenTeacherConsultModal={onOpenTeacherConsultModal}
                    onCancelSchedule={handleCancelSchedule}
                    // 🔹 Provide details for the cancel modal
                    getConsultDetails={getConsultDetails}
                    teacherId={uid}
                  />
                )}
              </>
            )}
          </>
        )}
      </Animated.View>

      {/* Teacher Consult modal */}
      {teacherModalOpen && (
        <TeacherConsultModal
          visible={teacherModalOpen}
          onClose={handleModalClose}
          consultationId={consultationId}
          teacherId={uid}
        />
      )}

      {/* Settings Drawer */}
      <Modal
        visible={settingsVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setSettingsVisible(false)}
      >
        <View style={{ flex: 1, flexDirection: "row" }}>
          <View style={{ flex: 1 }} onTouchEnd={() => setSettingsVisible(false)} />
          <View
            style={{
              width: "60%",
              backgroundColor: "#fff",
              padding: 20,
              elevation: 5,
              borderTopLeftRadius: 12,
              borderBottomLeftRadius: 12,
            }}
          >
            <Text style={{ fontWeight: "bold", fontSize: 16, marginBottom: 10 }}>
              Account Settings
            </Text>

            <TouchableOpacity onPress={handleImagePick}>
              {photoURL ? (
                <Image source={{ uri: photoURL }} style={{ width: 100, height: 100, borderRadius: 50 }} />
              ) : (
                <Text>📷 Upload Display Picture</Text>
              )}
            </TouchableOpacity>

            <Text style={{ marginTop: 20 }}>Name:</Text>
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              style={{ borderWidth: 1, padding: 8, borderRadius: 6, marginTop: 4 }}
            />

            <TouchableOpacity
              onPress={() => Alert.alert("Change Password", "Feature coming soon.")}
              style={{ marginTop: 20 }}
            >
              <Text style={{ color: "#007bff" }}>Change Password</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push("/teacher-archive")}
              style={{
                marginTop: 20,
                backgroundColor: "#f4f4f5",
                padding: 10,
                borderRadius: 6,
                borderWidth: 1,
                borderColor: "#e5e7eb",
              }}
            >
              <Text style={{ textAlign: "center", color: "#111827", fontWeight: "600" }}>
                Archive
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleSaveSettings}
              style={{ marginTop: 20, backgroundColor: "#007bff", padding: 10, borderRadius: 6 }}
            >
              <Text style={{ color: "#fff", textAlign: "center" }}>Save Settings</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleLogout}
              style={{ marginTop: 20, backgroundColor: "#f44336", padding: 10, borderRadius: 6 }}
            >
              <Text style={{ color: "#fff", textAlign: "center" }}>Logout</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
