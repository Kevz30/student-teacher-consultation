// app/admin/students/[course].js
import { useLocalSearchParams, useRouter } from "expo-router";
import { collection, deleteDoc, doc, getDocs } from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  TouchableOpacity,
  View,
} from "react-native";
import Swipeable from "react-native-gesture-handler/Swipeable";
import db from "../../../constants/firestore";

export default function StudentsByCourseScreen() {
  const { course } = useLocalSearchParams();
  const router = useRouter();
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchStudents();
  }, [course]);

  const fetchStudents = async () => {
    const snap = await getDocs(collection(db, "students"));
    const filtered = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((s) => s.course === course);

    // alphabetically sort
    const sorted = filtered.sort((a, b) =>
      (a.fullName || "").localeCompare(b.fullName || "")
    );
    setStudents(sorted);
  };

  const handleDelete = (studentId) => {
    Alert.alert("Delete Student", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteDoc(doc(db, "students", studentId));
          fetchStudents();
          ToastAndroid.show("Student deleted successfully", ToastAndroid.SHORT);
        },
      },
    ]);
  };

  const renderRightActions = (id) => (
    <TouchableOpacity onPress={() => handleDelete(id)} style={styles.deleteBtn}>
      <Text style={styles.deleteText}>Delete</Text>
    </TouchableOpacity>
  );

  const filteredStudents = students.filter((s) => {
    const q = search.toLowerCase();
    return (
      s.fullName?.toLowerCase().includes(q) ||
      s.email?.toLowerCase().includes(q) ||
      s.studentNumber?.toLowerCase().includes(q)
    );
  });

  return (
    <ScrollView contentContainerStyle={styles.container}>

      <Text style={styles.title}>{course} Students</Text>

      <TextInput
        placeholder="Search by name, email, or student number"
        placeholderTextColor="#9CA3AF"
        value={search}
        onChangeText={setSearch}
        style={styles.searchInput}
      />

      <View style={{ gap: 8 }}>
        {filteredStudents.map((s) => (
          <Swipeable key={s.id} renderRightActions={() => renderRightActions(s.id)}>
            <View style={styles.card}>
              <Text style={styles.name}>{s.fullName || "No name"}</Text>
              <Text style={styles.email}>{s.email || "No email"}</Text>
              <Text style={styles.number}>{s.studentNumber || "No number"}</Text>
            </View>
          </Swipeable>
        ))}
      </View>

      {filteredStudents.length === 0 && (
        <Text style={styles.empty}>No matching students found.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  backLink: { color: "#2563EB", marginBottom: 8, fontSize: 13, fontWeight: "600" },
  title: { fontSize: 20, fontWeight: "700", marginBottom: 10, color: "#111827" },
  searchInput: {
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    fontSize: 14,
    color: "#111827",
    marginBottom: 12,
  },
  card: {
    backgroundColor: "#FFFFFF",
    paddingVertical: 8, // smaller padding
    paddingHorizontal: 10,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  name: { fontSize: 14, fontWeight: "600", color: "#111827" },
  email: { marginTop: 2, fontSize: 12, color: "#6B7280" },
  number: { marginTop: 1, fontSize: 11, color: "#9CA3AF" },
  empty: { color: "#9CA3AF", textAlign: "center", marginTop: 20, fontSize: 13 },
  deleteBtn: {
    backgroundColor: "#DC2626",
    justifyContent: "center",
    alignItems: "center",
    width: 70,
    borderRadius: 10,
    marginLeft: 6,
  },
  deleteText: { color: "#fff", fontWeight: "700", fontSize: 12 },
});
