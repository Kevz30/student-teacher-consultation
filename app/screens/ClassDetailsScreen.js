// app/class-details/[id].js

import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { deleteDoc, doc } from "firebase/firestore";
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
  const navigation = useNavigation();
  const route = useRoute();
  const { classId, classData, uid } = route.params;

  const [students, setStudents] = useState(classData.students || []);
  const [matchedStudentIds, setMatchedStudentIds] = useState([]);

  useEffect(() => {
    navigation.setOptions({
      headerTitle: `${classData.subjectCode} ${classData.course} ${classData.section}`,
      headerLeft: () => (
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginLeft: 10 }}>
          <Ionicons name="arrow-back" size={24} />
        </TouchableOpacity>
      ),
      headerRight: () => (
        <TouchableOpacity onPress={handleDeleteClass} style={{ marginRight: 10 }}>
          <Ionicons name="trash" size={24} color="red" />
        </TouchableOpacity>
      ),
    });

    // you already have the roster in `classData.students`
    setStudents(classData.students || []);

    fetchMatchedStudents();
  }, []);

  const fetchMatchedStudents = async () => {
    try {
      // TODO: adjust to read from `students/{uid}` if you want to mark registered ones
      // (this example leaves your existing logic in place)
    } catch (err) {
      console.error("❌ Error checking matched students:", err.message);
    }
  };

  const handleDeleteClass = () => {
    Alert.alert("Delete Class", "Are you sure you want to delete this class?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            // ← updated path to your new root
            await deleteDoc(
              doc(db, "TeachersClasses", uid, "classes", classId)
            );
            navigation.goBack();
          } catch (err) {
            Alert.alert("Error", err.message);
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={students}
        keyExtractor={(item, index) => index.toString()}
        renderItem={({ item }) => (
          <View style={styles.studentItem}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.id}>{item.studentNumber}</Text>
            <Text style={{ color: matchedStudentIds.includes(item.studentNumber.toLowerCase()) ? 'green' : 'gray' }}>
              {matchedStudentIds.includes(item.studentNumber.toLowerCase())
                ? '✅ Registered'
                : '❌ Not registered'}
            </Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  studentItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: "#ccc",
  },
  name: { fontWeight: "bold", fontSize: 16 },
  id: { fontSize: 14, color: "#555" },
});
