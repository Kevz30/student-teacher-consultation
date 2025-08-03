// app/admin/index.js
import { router } from "expo-router";
import { ScrollView, Text, TouchableOpacity } from "react-native";

export default function AdminDashboard() {
  return (
    <ScrollView contentContainerStyle={{ padding: 20 }}>
      <Text style={{ fontSize: 24, fontWeight: "bold", marginBottom: 30, textAlign: "center" }}>
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
