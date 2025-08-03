import { collection, doc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { ActivityIndicator, Button, FlatList, Text, View } from "react-native";
import db from "../../constants/firestore";

export default function AdminTeacherApprovalScreen() {
  const [loading, setLoading] = useState(true);
  const [pendingTeachers, setPendingTeachers] = useState([]);

  useEffect(() => {
    const fetchPendingTeachers = async () => {
      const q = query(
        collection(db, "users"),
        where("role", "==", "teacher"),
        where("status", "==", "pending_approval")
      );
      const snapshot = await getDocs(q);
      const list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setPendingTeachers(list);
      setLoading(false);
    };

    fetchPendingTeachers();
  }, []);

  const handleApprove = async (id) => {
    await updateDoc(doc(db, "users", id), {
      status: "approved",
    });
    setPendingTeachers((prev) => prev.filter((t) => t.id !== id));
  };

  const handleReject = async (id) => {
    await updateDoc(doc(db, "users", id), {
      status: "rejected",
    });
    setPendingTeachers((prev) => prev.filter((t) => t.id !== id));
  };

  if (loading)
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );

  return (
    <View style={{ padding: 20 }}>
      <Text style={{ fontSize: 20, fontWeight: "bold", marginBottom: 20 }}>
        Pending Teacher Accounts
      </Text>

      <FlatList
        data={pendingTeachers}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={{ marginBottom: 20, padding: 10, borderWidth: 1, borderRadius: 8 }}>
            <Text>Name: {item.fullName}</Text>
            <Text>Email: {item.email}</Text>
            <Text>Department: {item.department}</Text>

            <View style={{ flexDirection: "row", marginTop: 10, justifyContent: "space-between" }}>
              <Button title="Approve" onPress={() => handleApprove(item.id)} />
              <Button title="Reject" color="red" onPress={() => handleReject(item.id)} />
            </View>
          </View>
        )}
      />
    </View>
  );
}
