import * as MediaLibrary from "expo-media-library";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import {
  createUserWithEmailAndPassword,
  getAuth,
} from "firebase/auth";
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
        <TouchableOpacity
          onPress={handleOpenModal}
          style={{ marginRight: 15 }}
        >
          <Text style={{ fontSize: 18, color: "#007bff" }}>➕</Text>
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
      const auth = getAuth();
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
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
    <TouchableOpacity
      onPress={() => handleDelete(id)}
      style={styles.deleteButton}
    >
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

  if (loading) return <ActivityIndicator size="large" style={{ marginTop: 50 }} />;

  return (
    <View style={{ padding: 20 }}>
      <Text style={{ fontSize: 20, fontWeight: "bold", marginBottom: 20 }}>
        {college} Teachers
      </Text>

      {teachers.length === 0 ? (
        <Text>No teachers found in this college.</Text>
      ) : (
        <FlatList
          data={teachers}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Swipeable renderRightActions={() => renderRightActions(item.id)}>
              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: "/teacher-schedule/[id]",
                    params: { id: item.id },
                  })
                }
                style={styles.card}
              >
                <Text style={{ fontWeight: "bold" }}>{item.fullName}</Text>
                <Text>{item.email}</Text>
                <Text>Status: {item.status}</Text>
              </TouchableOpacity>
            </Swipeable>
          )}
        />
      )}

      {/* Centered Add Modal */}
      <Modal
        visible={showModal}
        animationType="fade"
        transparent={true}
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
                style={[styles.input, { backgroundColor: "#f1f1f1", color: "#333" }]}
              />

              <TouchableOpacity
                onPress={handleAddTeacher}
                style={styles.addBtn}
              >
                <Text style={{ color: "#fff" }}>Add Teacher</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSaveScreenshot}
                style={[styles.addBtn, { backgroundColor: "#28a745", marginTop: 10 }]}
              >
                <Text style={{ color: "#fff" }}>📸 Save Confirmation</Text>
              </TouchableOpacity>
            </View>
          </ViewShot>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    backgroundColor: "#fff",
  },
  deleteButton: {
    backgroundColor: "#dc3545",
    justifyContent: "center",
    alignItems: "center",
    width: 80,
    borderRadius: 8,
    marginLeft: 10,
  },
  deleteText: {
    color: "#fff",
    fontWeight: "bold",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalBox: {
    backgroundColor: "#fff",
    width: 300,
    borderRadius: 12,
    padding: 20,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 15,
    textAlign: "center",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  addBtn: {
    backgroundColor: "#007bff",
    padding: 12,
    borderRadius: 6,
    alignItems: "center",
  },
});
