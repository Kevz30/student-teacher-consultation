// app/class-details/[id].js

import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import db from "../../constants/firestore";

export default function ClassDetailsScreen() {
  const { id } = useLocalSearchParams(); // “teacherUid-classId”
  const router = useRouter();
  const [classData, setClassData] = useState(null);

  useEffect(() => {
    const fetch = async () => {
      const [teacherUid, classId] = id.split("-");
      // load the class from TeachersClasses collection
      const snap = await getDoc(
        doc(db, "TeachersClasses", teacherUid, "classes", classId)
      );
      const raw = snap.data() || {};

      // enrich each student with registered status
      const studentsWithStatus = await Promise.all(
        (raw.students || []).map(async (st) => {
          const q = query(
            collection(db, "students"),
            where("studentNumber", "==", st.studentNumber)
          );
          const userSnap = await getDocs(q);
          return {
            ...st,
            registered: !userSnap.empty,
          };
        })
      );

      setClassData({
        id: classId,
        uid: teacherUid,
        subjectCode: raw.subjectCode,
        course: raw.course,
        section: raw.section,
        students: studentsWithStatus,
      });
    };

    fetch();
  }, [id]);

  const handleDelete = () => {
    Alert.alert("Delete Class", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteDoc(
            doc(db, "TeachersClasses", classData.uid, "classes", classData.id)
          );
          router.back();
        },
      },
    ]);
  };

  if (!classData) return <Text style={{ padding: 20 }}>Loading...</Text>;

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={router.back}>
          <Ionicons name="arrow-back" size={24} />
        </TouchableOpacity>
        <Text style={styles.title}>
          {classData.subjectCode} {classData.course} {classData.section}
        </Text>
        <TouchableOpacity onPress={handleDelete}>
          <Ionicons name="trash" size={24} color="red" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={classData.students}
        keyExtractor={(_, i) => i.toString()}
        renderItem={({ item }) => (
          <View style={styles.studentCard}>
            <Text style={{ fontWeight: "bold" }}>{item.name}</Text>
            <Text>{item.studentNumber}</Text>
            <Text style={{ color: item.registered ? "green" : "gray" }}>
              {item.registered ? "✅ Registered" : "❌ Not registered"}
            </Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    fontWeight: "bold",
    fontSize: 16,
    flex: 1,
  },
  studentCard: {
    padding: 10,
    borderBottomWidth: 1,
    borderColor: "#ccc",
  },
});
