import { router, useNavigation } from "expo-router";
import { getAuth, signOut } from "firebase/auth";
import { collection, doc, getDocs, updateDoc } from "firebase/firestore";
import { useEffect, useLayoutEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Button,
  FlatList,
  Modal,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import db from "../../../constants/firestore";

export default function AdminTeacherApprovals() {
  const [pendingTeachers, setPendingTeachers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
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

  const handleLogout = async () => {
    Alert.alert("Confirm Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          await signOut(auth);
          router.replace("/screens/LoginScreen");
        },
      },
    ]);
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: "Teacher Approvals",
      headerRight: () => (
        <TouchableOpacity onPress={() => setSettingsVisible(true)} style={{ marginRight: 10 }}>
          <Text style={{ fontSize: 18 }}>⚙️</Text>
        </TouchableOpacity>
      ),
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

              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10, marginTop: 10 }}>
                <Button title="✅ Approve" onPress={() => handleApprove(item)} />
                <Button title="❌ Reject" color="#f44336" onPress={() => handleReject(item)} />
              </View>
            </View>
          )}
        />
      )}

      {/* Settings Drawer */}
      <Modal
        visible={settingsVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSettingsVisible(false)}
      >
        <View style={{ flex: 1, flexDirection: "row" }}>
          <View style={{ flex: 1 }} onTouchEnd={() => setSettingsVisible(false)} />
          <View
            style={{
              width: "60%",
              backgroundColor: "#fff",
              padding: 20,
              elevation: 5,
              borderTopLeftRadius: 12,
              borderBottomLeftRadius: 12,
            }}
          >
            <Text style={{ fontWeight: "bold", fontSize: 16, marginBottom: 20 }}>
              Admin Settings
            </Text>

            <TouchableOpacity
              onPress={handleLogout}
              style={{
                backgroundColor: "#f44336",
                padding: 12,
                borderRadius: 6,
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#fff" }}>Logout</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
