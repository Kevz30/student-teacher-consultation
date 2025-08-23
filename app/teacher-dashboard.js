// app/teacher-dashboard.js
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
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { useEffect, useLayoutEffect, useState } from "react";
import {
  Alert,
  Image,
  Modal,
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

export default function TeacherDashboard() {
  const [grid, setGrid] = useState(null);
  const [hasSchedule, setHasSchedule] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [photoURL, setPhotoURL] = useState("");

  // modal state for yellow tap
  const [consultationId, setConsultationId] = useState(null);
  const [teacherModalOpen, setTeacherModalOpen] = useState(false);
  const [lastTap, setLastTap] = useState(null); // {day, slot}

  const auth = getAuth();
  const user = auth.currentUser;
  const uid = user?.uid;
  const navigation = useNavigation();

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: "Teacher Dashboard",
      headerRight: () => (
        <View style={{ flexDirection: "row", gap: 15, marginRight: 10 }}>
          <TouchableOpacity onPress={() => navigation.navigate("my-classes")}>
            <Text style={{ color: "#007bff" }}>My Classes</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => Alert.alert("Notifications")}>
            <Text style={{ fontSize: 18 }}>🔔</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setSettingsVisible(true)}>
            <Text style={{ fontSize: 18 }}>⚙️</Text>
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation]);

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

  // ---------- Teacher: tap yellow -> open modal ----------
  const onOpenTeacherConsultModal = async ({ day, slot }) => {
    try {
      if (!uid) return;
      setLastTap({ day, slot });

      // exact match first
      let q1 = query(
        collection(db, "consultations"),
        where("teacherId", "==", uid),
        where("day", "==", day),
        where("time", "==", slot),
        limit(1)
      );
      let qs = await getDocs(q1);

      // fallback: normalize time text
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

      // if teacher signed, turn that cell blue
      if (d && String(d.status || "").toLowerCase() === "signed_by_teacher" && lastTap) {
        const newGrid = { ...(grid || {}) };
        const { day, slot } = lastTap;
        if (newGrid?.[day]?.[slot]) {
          newGrid[day][slot] = "blue";
          await setDoc(doc(db, "schedules", uid), { grid: newGrid }, { merge: true });
          setGrid(newGrid);
        }
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

  const handleConfirm = async () => {
    if (!uid || !grid) return;
    await setDoc(doc(db, "schedules", uid), { grid, uploadedAt: serverTimestamp() });
    Alert.alert("Saved", "Schedule updated.");
    setShowConfirm(false);
  };

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
          style={{
            backgroundColor: "#2196F3",
            padding: 12,
            borderRadius: 6,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#fff" }}>Upload your current schedule</Text>
        </TouchableOpacity>
      ) : (
        <>
          <ScheduleGrid
            grid={grid}
            onSelectBlock={handleBlockSelect}            // keep edit modal
            onOpenTeacherConsultModal={onOpenTeacherConsultModal} // yellow tap -> modal
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

      {teacherModalOpen && (
        <TeacherConsultModal
          visible={teacherModalOpen}
          onClose={handleModalClose}
          consultationId={consultationId}
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
