// app/admin/students/[course].js
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  View,
} from "react-native";
import { TouchableOpacity } from "react-native-gesture-handler";
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
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((s) => s.course === course);

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
    <TouchableOpacity
      onPress={() => handleDelete(id)}
      style={styles.deleteButton}
    >
      <Text style={styles.deleteText}>Delete</Text>
    </TouchableOpacity>
  );

  const filteredStudents = students.filter(
    (s) =>
      s.fullName?.toLowerCase().includes(search.toLowerCase()) ||
      s.email?.toLowerCase().includes(search.toLowerCase()) ||
      s.studentNumber?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 20 }}>
      <TouchableOpacity onPress={() => router.back()}>
        <Text style={{ color: "#007bff", marginBottom: 10 }}>← Back</Text>
      </TouchableOpacity>

      <Text style={{ fontSize: 22, fontWeight: "bold", marginBottom: 10 }}>
        {course} Students
      </Text>

      <TextInput
        placeholder="Search by name, email, or student number"
        value={search}
        onChangeText={setSearch}
        style={styles.searchInput}
      />

      {filteredStudents.map((student, idx) => (
        <Swipeable
          key={idx}
          renderRightActions={() => renderRightActions(student.id)}
        >
          <View style={styles.studentCard}>
            <Text>{student.fullName || "No name"}</Text>
            <Text style={{ color: "#555" }}>{student.email || "No email"}</Text>
            <Text style={{ color: "#999" }}>
              {student.studentNumber || "No number"}
            </Text>
          </View>
        </Swipeable>
      ))}

      {filteredStudents.length === 0 && (
        <Text style={{ color: "#888", textAlign: "center", marginTop: 30 }}>
          No matching students found.
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  searchInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 10,
    borderRadius: 8,
    marginBottom: 20,
  },
  studentCard: {
    backgroundColor: "#f1f1f1",
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
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
});
