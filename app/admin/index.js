// app/admin/index.js
import { router, useNavigation } from "expo-router";
import { getAuth, signOut } from "firebase/auth";
import { useLayoutEffect, useState } from "react";
import {
  Alert,
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function AdminDashboard() {
  const navigation = useNavigation();
  const [settingsVisible, setSettingsVisible] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: "Admin Dashboard",
      headerRight: () => (
        <TouchableOpacity onPress={() => setSettingsVisible(true)}>
          <Text style={{ fontSize: 18, color: "#007bff", marginRight: 15 }}>⚙️</Text>
        </TouchableOpacity>
      ),
    });
  }, []);

  const handleLogout = () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          await signOut(getAuth());
          router.replace("/");
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Text
          style={{
            fontSize: 24,
            fontWeight: "bold",
            marginBottom: 30,
            textAlign: "center",
          }}
        >
          Admin Dashboard
        </Text>

        {/* 👤 Approval Section */}
        <TouchableOpacity
          onPress={() => router.push("/admin/teacher-approvals")}
          style={buttonStyle}
        >
          <Text style={textStyle}>Pending Approvals</Text>
        </TouchableOpacity>

        {/* 🧑‍🏫 Teachers Section */}
        <TouchableOpacity
          onPress={() => router.push("/admin/teachers")}
          style={buttonStyle}
        >
          <Text style={textStyle}>Teachers by College</Text>
        </TouchableOpacity>

        {/* 🎓 Students Section */}
        <TouchableOpacity
          onPress={() => router.push("/admin/students")}
          style={[buttonStyle, { marginTop: 40 }]}
        >
          <Text style={textStyle}>View Students by Course</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Settings Drawer */}
      <Modal
        visible={settingsVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSettingsVisible(false)}
      >
        <View style={{ flex: 1, flexDirection: "row" }}>
          <View
            style={{ flex: 1 }}
            onTouchEnd={() => setSettingsVisible(false)}
          />
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
            <Text
              style={{
                fontWeight: "bold",
                fontSize: 16,
                marginBottom: 20,
              }}
            >
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

const buttonStyle = {
  backgroundColor: "#007bff",
  padding: 15,
  borderRadius: 8,
  marginBottom: 20,
  alignItems: "center",
};

const textStyle = {
  color: "#fff",
  fontSize: 16,
};
