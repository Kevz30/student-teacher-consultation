import { router } from "expo-router";
import { collection, getDocs } from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import db from "../../../constants/firestore";

export default function StudentCoursesScreen() {
  const [courses, setCourses] = useState([]);

  useEffect(() => {
    const fetchCourses = async () => {
      const snap = await getDocs(collection(db, "students"));
      const all = snap.docs.map((doc) => doc.data());
      const uniqueCourses = [...new Set(all.map((s) => s.course))];
      setCourses(uniqueCourses);
    };
    fetchCourses();
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.header}>Select Course</Text>

      <View style={styles.list}>
        {courses.map((course) => (
          <TouchableOpacity
            key={course}
            onPress={() => router.push(`/admin/students/${course}`)}
            style={styles.card}
          >
            <View>
              <Text style={styles.course}>{course}</Text>
              <Text style={styles.subtitle}>Course details coming soon…</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
  },
  header: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 20,
    color: "#111827",
  },
  list: {
    gap: 14,
  },
  card: {
    backgroundColor: "#fff",
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  course: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  subtitle: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 4,
  },
});
