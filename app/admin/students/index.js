// app/admin/students/index.js
import { router } from "expo-router";
import { collection, getDocs } from "firebase/firestore";
import { useEffect, useState } from "react";
import { ScrollView, Text, TouchableOpacity } from "react-native";
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
    <ScrollView contentContainerStyle={{ padding: 20 }}>
      <Text style={{ fontSize: 22, fontWeight: "bold", marginBottom: 20 }}>
        Select Course
      </Text>

      {courses.map((course) => (
        <TouchableOpacity
          key={course}
          onPress={() => router.push(`/admin/students/${course}`)}
          style={{
            backgroundColor: "#007bff",
            padding: 15,
            borderRadius: 8,
            marginBottom: 10,
          }}
        >
          <Text style={{ color: "#fff", fontSize: 16 }}>{course}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}
