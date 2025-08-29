// app/teacher-dashboard.js
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { router, useNavigation } from "expo-router";
import { getAuth, signOut, updateProfile } from "firebase/auth";
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
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as XLSX from "xlsx";
import { createDefaultGrid } from "../app/utils/scheduleTemplate";
import ScheduleGrid from "../components/ScheduleGrid";
import TeacherConsultModal from "../components/TeacherConsultModal";
import db from "../constants/firestore";
import uploadToCloudinary from "./utils/uploadToCloudinary";

const norm = (s = "") => String(s).replace(/–/g, "-").replace(/\s+/g, "").toLowerCase();

/* ---------- Custom Header (prevents icon clipping) ---------- */
function TeacherHeader({ unreadCount, onOpenNotifs, onOpenSettings, onOpenClasses }) {
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
      <Text style={{ fontSize: 22, fontWeight: "800" }}>Teacher Dashboard</Text>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
        <TouchableOpacity
          onPress={onOpenClasses}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={{ color: "#2563eb", fontWeight: "600" }}>My Classes</Text>
        </TouchableOpacity>

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

        <TouchableOpacity
          onPress={onOpenSettings}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="settings-outline" size={26} />
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
  const [showNotifs, setShowNotifs] = useState(false);

  const auth = getAuth();
  const user = auth.currentUser;
  const uid = user?.uid;
  const navigation = useNavigation();

  const unreadCount = useMemo(() => notifs.filter((n) => !n.read).length, [notifs]);

  /* ---------- Use the custom header (like student screen) ---------- */
  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: "",
      headerShadowVisible: true,
      header: () => (
        <TeacherHeader
          unreadCount={unreadCount}
          onOpenNotifs={() => setShowNotifs(true)}
          onOpenSettings={() => setSettingsVisible(true)}
          onOpenClasses={() => navigation.navigate("my-classes")}
        />
      ),
    });
  }, [navigation, unreadCount]);

  // ---- Load schedule + profile bits ----
  useEffect(() => {
    if (!uid) return;
    (async () => {
      const docSnap = await getDoc(doc(db, "schedules", uid));
      if (docSnap.exists()) {
        setGrid(docSnap.data().grid);
        setHasSchedule(true);
        setShowConfirm(false);
      }
      setDisplayName(user?.displayName || "");
      setPhotoURL(user?.photoURL || "");
    })();
  }, [uid]);

  // ---- Live teacher notifications ----
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

  /* ---------- helpers to extract / update cell ---------- */
  const extractDaySlot = (consultData) => {
    const day = consultData?.day || consultData?.form?.date || null;
    const slot = consultData?.time || consultData?.form?.time || null;
    return { day, slot };
  };

  const updateCellBlue = async (day, slot) => {
    if (!grid || !day || !slot) return false;
    const g = { ...(grid || {}) };
    const dayRow = g[day];
    if (!dayRow) return false;

    // exact key
    let key = slot;
    if (!dayRow[key]) {
      // normalize to find matching slot label
      const match = Object.keys(dayRow).find((k) => norm(k) === norm(slot));
      if (!match) return false;
      key = match;
    }

    if (dayRow[key]) {
      g[day] = { ...dayRow, [key]: "blue" };
      await setDoc(doc(db, "schedules", uid), { grid: g }, { merge: true });
      setGrid(g);
      return true;
    }
    return false;
  };

  const openNotif = async (n) => {
    setShowNotifs(false);
    try {
      // mark read
      if (!n.read) {
        await updateDoc(doc(db, "notifications", n.id), { read: true, readAt: serverTimestamp() });
      }

      if (n.consultationId) {
        // prefetch to capture day/slot for auto-blue after signing
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

      // Fallback: open by day+time stored on notif
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

      if (qs.empty) {
        Alert.alert("No request", "No consultation found for this block.");
        return;
      }

      setConsultationId(qs.docs[0].id);
      setTeacherModalOpen(true);
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
      if (d && status === "signed_by_teacher") {
        // Prefer the slot captured when opening; otherwise derive from doc
        let day = lastTap?.day;
        let slot = lastTap?.slot;

        if (!day || !slot) {
          const derived = extractDaySlot(d);
          day = derived.day;
          slot = derived.slot;
        }

        // Update grid to blue (robust matching)
        await updateCellBlue(day, slot);
      }
    } finally {
      setConsultationId(null);
      setLastTap(null);
    }
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

  // ✅ Step 5: Save grid AND capture `defaultGrid` once (if missing)
  const handleConfirm = async () => {
    if (!uid || !grid) return;

    const schedRef = doc(db, "schedules", uid);
    const existing = await getDoc(schedRef);

    const payload = { grid, uploadedAt: serverTimestamp() };
    if (!existing.exists() || !existing.data()?.defaultGrid) {
      payload.defaultGrid = grid; // baseline saved once
    }

    await setDoc(schedRef, payload, { merge: true });
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

  return (
    <View style={{ flex: 1, padding: 20 }}>
      {!hasSchedule ? (
        <TouchableOpacity
          onPress={handleUpload}
          style={{ backgroundColor: "#2196F3", padding: 12, borderRadius: 6, alignItems: "center" }}
        >
          <Text style={{ color: "#fff" }}>Upload your current schedule</Text>
        </TouchableOpacity>
      ) : (
        <>
          <ScheduleGrid
            grid={grid}
            onSelectBlock={handleBlockSelect}
            onOpenTeacherConsultModal={onOpenTeacherConsultModal}
          />
          {showConfirm && (
            <TouchableOpacity
              onPress={handleConfirm}
              style={{
                backgroundColor: "green",
                padding: 12,
                borderRadius: 6,
                alignItems: "center",
                marginTop: 10,
              }}
            >
              <Text style={{ color: "#fff" }}>Confirm Changes</Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {/* Teacher Consult modal */}
      {teacherModalOpen && (
        <TeacherConsultModal
          visible={teacherModalOpen}
          onClose={handleModalClose}
          consultationId={consultationId}
          teacherId={uid}
        />
      )}

      {/* Notifications modal */}
      <Modal
        visible={showNotifs}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNotifs(false)}
      >
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
