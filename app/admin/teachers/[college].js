// app/admin/teachers/[college].js
import * as MediaLibrary from "expo-media-library";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { createUserWithEmailAndPassword } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  TouchableOpacity,
  View,
} from "react-native";
import Swipeable from "react-native-gesture-handler/Swipeable";
import ViewShot from "react-native-view-shot";
import auth from "../../../constants/auth";
import db from "../../../constants/firestore";

export default function CollegeTeachersScreen() {
  const { college } = useLocalSearchParams();
  const navigation = useNavigation();
  const router = useRouter();
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const modalRef = useRef(null);

  useEffect(() => {
    navigation.setOptions({
      title: `Teachers in ${college}`,
      headerRight: () => (
        <TouchableOpacity onPress={handleOpenModal} style={{ marginRight: 14 }}>
          <Text style={{ fontSize: 20, color: "#2563eb" }}>＋</Text>
        </TouchableOpacity>
      ),
    });
    fetchTeachers();
  }, [college]);

  const fetchTeachers = async () => {
    const q = query(collection(db, "instructors"), where("college", "==", college));
    const snap = await getDocs(q);
    const list = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    setTeachers(list);
    setLoading(false);
  };

  const handleOpenModal = () => {
    setFullName("");
    setEmail("");
    const generated = Math.random().toString(36).slice(-8);
    setPassword(generated);
    setShowModal(true);
  };

  const handleAddTeacher = async () => {
    if (!fullName || !email) {
      Alert.alert("Missing Info", "Please fill in all fields.");
      return;
    }
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const uid = userCredential.user.uid;

      await setDoc(doc(db, "instructors", uid), {
        fullName,
        email,
        college,
        status: "approved",
      });

      setShowModal(false);
      ToastAndroid.show("Account created successfully", ToastAndroid.SHORT);
      fetchTeachers();
    } catch (err) {
      Alert.alert("Error", err.message);
    }
  };

  const handleDelete = (id) => {
    Alert.alert("Delete Teacher", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteDoc(doc(db, "instructors", id));
          fetchTeachers();
          ToastAndroid.show("Teacher deleted successfully", ToastAndroid.SHORT);
        },
      },
    ]);
  };

  const renderRightActions = (id) => (
    <TouchableOpacity onPress={() => handleDelete(id)} style={styles.deleteButton}>
      <Text style={styles.deleteText}>Delete</Text>
    </TouchableOpacity>
  );

  const handleSaveScreenshot = async () => {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Please allow storage access to save the image.");
      return;
    }
    try {
      const uri = await modalRef.current.capture();
      await MediaLibrary.saveToLibraryAsync(uri);
      ToastAndroid.show("Saved to gallery", ToastAndroid.SHORT);
    } catch (err) {
      Alert.alert("Failed to save", err.message);
    }
  };

  const statusChip = (status) => {
    const s = String(status || "").toLowerCase();
    const map = {
      approved: { bg: "#ecfdf5", fg: "#059669", label: "approved" },
      pending: { bg: "#fffbeb", fg: "#b45309", label: "pending" },
      declined: { bg: "#fef2f2", fg: "#b91c1c", label: "declined" },
    };
    const m = map[s] || { bg: "#f3f4f6", fg: "#374151", label: s || "unknown" };
    return (
      <View style={[styles.chip, { backgroundColor: m.bg }]}>
        <Text style={{ color: m.fg, fontWeight: "700", fontSize: 12 }}>{m.label}</Text>
      </View>
    );
  };

  if (loading) return <ActivityIndicator size="large" style={{ marginTop: 50 }} />;

  return (
    <View style={{ flex: 1, backgroundColor: "#f8fafc", padding: 16 }}>
      <Text style={styles.pageTitle}>{college} Teachers</Text>

      {teachers.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>No teachers yet</Text>
          <Text style={styles.emptySub}>Tap + to add a teacher to this college.</Text>
        </View>
      ) : (
        <FlatList
          data={teachers}
          keyExtractor={(item) => item.id}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={({ item }) => (
            <Swipeable renderRightActions={() => renderRightActions(item.id)}>
              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: "/teacher-schedule/[id]",
                    params: { id: item.id },
                  })
                }
                activeOpacity={0.9}
                style={styles.card}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {item.fullName}
                  </Text>
                  {!!item.email && (
                    <Text style={styles.cardSub} numberOfLines={1}>
                      {item.email}
                    </Text>
                  )}
                </View>
                {statusChip(item.status)}
              </TouchableOpacity>
            </Swipeable>
          )}
        />
      )}

      {/* Centered Add Modal */}
      <Modal
        visible={showModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalOverlay}>
          <ViewShot ref={modalRef} options={{ format: "png", quality: 1.0 }}>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>Add New Teacher</Text>

              <TextInput
                placeholder="Full Name"
                value={fullName}
                onChangeText={setFullName}
                style={styles.input}
              />
              <TextInput
                placeholder="Email"
                value={email}
                onChangeText={setEmail}
                style={styles.input}
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <TextInput
                placeholder="Generated Password"
                value={password}
                editable={false}
                style={[styles.input, styles.inputReadonly]}
              />

              <TouchableOpacity onPress={handleAddTeacher} style={styles.primaryBtn}>
                <Text style={styles.primaryBtnText}>Add Teacher</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSaveScreenshot}
                style={[styles.primaryBtn, styles.successBtn]}
              >
                <Text style={styles.primaryBtnText}>📸 Save Confirmation</Text>
              </TouchableOpacity>
            </View>
          </ViewShot>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  pageTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 12,
  },
  emptyBox: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 16,
    alignItems: "center",
  },
  emptyTitle: { fontWeight: "800", color: "#0f172a", marginBottom: 4 },
  emptySub: { color: "#6b7280", fontSize: 13 },

  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingVertical: 14,
    paddingHorizontal: 16,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  cardTitle: { fontSize: 15.5, fontWeight: "800", color: "#0f172a" },
  cardSub: { fontSize: 13, color: "#6b7280", marginTop: 2 },

  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: "flex-start",
  },

  deleteButton: {
    backgroundColor: "#ef4444",
    justifyContent: "center",
    alignItems: "center",
    width: 88,
    borderRadius: 12,
    marginLeft: 10,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  deleteText: { color: "#fff", fontWeight: "800" },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalBox: {
    backgroundColor: "#ffffff",
    width: 320,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 10,
    textAlign: "center",
    color: "#0f172a",
  },
  input: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    backgroundColor: "#ffffff",
  },
  inputReadonly: { backgroundColor: "#f1f5f9", color: "#334155" },

  primaryBtn: {
    backgroundColor: "#2563eb",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 4,
  },
  successBtn: { backgroundColor: "#16a34a", marginTop: 10 },
  primaryBtnText: { color: "#fff", fontWeight: "800" },
});
