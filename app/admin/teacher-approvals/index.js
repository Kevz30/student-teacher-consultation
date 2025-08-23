// app/admin/teacher-approvals/index.js
import { useNavigation } from "expo-router";
import { getAuth } from "firebase/auth";
import { collection, doc, getDocs, updateDoc } from "firebase/firestore";
import { useEffect, useLayoutEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Button,
  FlatList,
  Text,
  View,
} from "react-native";
import db from "../../../constants/firestore";

export default function AdminTeacherApprovals() {
  const [pendingTeachers, setPendingTeachers] = useState([]);
  const [loading, setLoading] = useState(false);
  const navigation = useNavigation();
  const auth = getAuth();

  const loadPending = async () => {
    setLoading(true);
    const snap = await getDocs(collection(db, "instructors"));
    const pending = snap.docs
      .filter((doc) => doc.data().status === "pending")
      .map((doc) => ({ id: doc.id, ...doc.data() }));
    setPendingTeachers(pending);
    setLoading(false);
  };

  const handleApprove = async (teacher) => {
    try {
      await updateDoc(doc(db, "instructors", teacher.id), {
        status: "approved",
      });

      Alert.alert("Approved", `${teacher.fullName} has been approved.`);
      loadPending();
    } catch (err) {
      Alert.alert("Error", err.message);
    }
  };

  const handleReject = async (teacher) => {
    try {
      await updateDoc(doc(db, "instructors", teacher.id), {
        status: "rejected",
      });

      Alert.alert("Rejected", `${teacher.fullName} has been rejected.`);
      loadPending();
    } catch (err) {
      Alert.alert("Error", err.message);
    }
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: "Teacher Approvals",
      headerRight: undefined, // removes ⚙️ icon
    });
  }, [navigation]);

  useEffect(() => {
    loadPending();
  }, []);

  if (loading) return <ActivityIndicator size="large" style={{ marginTop: 50 }} />;

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Text style={{ fontSize: 20, fontWeight: "bold", marginBottom: 20 }}>
        Pending Teacher Approvals
      </Text>

      {pendingTeachers.length === 0 ? (
        <Text>No pending teachers.</Text>
      ) : (
        <FlatList
          data={pendingTeachers}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View
              style={{
                borderWidth: 1,
                borderColor: "#ccc",
                padding: 15,
                borderRadius: 8,
                marginBottom: 10,
              }}
            >
              <Text style={{ fontWeight: "bold" }}>{item.fullName}</Text>
              <Text>{item.email}</Text>
              <Text>College: {item.college}</Text>

              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  gap: 10,
                  marginTop: 10,
                }}
              >
                <Button title="✅ Approve" onPress={() => handleApprove(item)} />
                <Button title="❌ Reject" color="#f44336" onPress={() => handleReject(item)} />
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}
