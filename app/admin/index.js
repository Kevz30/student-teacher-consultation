import { Ionicons } from "@expo/vector-icons";
import { router, useNavigation } from "expo-router";
import { signOut } from "firebase/auth";
import { useLayoutEffect, useState } from "react";
import {
  Alert,
  Modal,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import auth from "../../constants/auth";


function Tile({ icon, title, subtitle, onPress, color, bg, disabled }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.9}
      style={{
        flex: 1,
        margin: 8,
        backgroundColor: "#ffffff",
        borderRadius: 20,
        shadowColor: "#000",
        shadowOpacity: 0.06,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: 2,
        borderWidth: 1,
        borderColor: "#f1f5f9",
        justifyContent: "center",
        alignItems: "center",
        paddingVertical: 18,
        paddingHorizontal: 12,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {/* Icon */}
      <View
        style={{
          width: 70,
          height: 70,
          borderRadius: 18,
          backgroundColor: bg,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 12,
        }}
      >
        <Ionicons name={icon} size={42} color={color} />
      </View>

      {/* Title */}
      <Text
        style={{
          fontSize: 17,
          fontWeight: "800",
          color: "#0f172a",
          textAlign: "center",
          marginBottom: 6,
        }}
        numberOfLines={2}
      >
        {title}
      </Text>

      {/* Subtitle */}
      {!!subtitle && (
        <Text
          style={{
            fontSize: 13.5,
            color: "#6b7280",
            textAlign: "center",
            lineHeight: 18,
          }}
          numberOfLines={3}
        >
          {subtitle}
        </Text>
      )}
    </TouchableOpacity>
  );
}

export default function AdminDashboard() {
  const navigation = useNavigation();
  const [settingsVisible, setSettingsVisible] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: "Admin Dashboard",
      headerRight: () => (
        <TouchableOpacity
          onPress={() => setSettingsVisible(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ paddingRight: 12 }}
        >
          <Ionicons name="settings-outline" size={22} color="#2563eb" />
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
          await signOut(auth);
          router.replace("/");
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#f8fafc", padding: 8 }}>
      {/* 2x2 Grid */}
      <View style={{ flex: 1, flexDirection: "row" }}>
        <Tile
          icon="checkmark-done-outline"
          title="Pending Approvals"
          subtitle="Review and approve new teachers"
          onPress={() => router.push("/admin/teacher-approvals")}
          color="#22c55e"
          bg="#eaf7ef"
        />
        <Tile
          icon="people-outline"
          title="Teachers by College"
          subtitle="Browse instructors grouped by college"
          onPress={() => router.push("/admin/teachers")}
          color="#8b5cf6"
          bg="#efeafe"
        />
      </View>

      <View style={{ flex: 1, flexDirection: "row" }}>
        <Tile
          icon="school-outline"
          title="View Students by Course"
          subtitle="See students organized per program"
          onPress={() => router.push("/admin/students")}
          color="#2563eb"
          bg="#eaf2ff"
        />
        <Tile
          icon="stats-chart-outline"
          title="View Metrics"
          subtitle="Analytics and insights"
          onPress={() => router.push("/admin/metrics")}
          color="#2563eb"
          bg="#eaf2ff"
        />
      </View>

      {/* Settings Drawer */}
      <Modal
        visible={settingsVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setSettingsVisible(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.25)",
            flexDirection: "row",
          }}
        >
          <View
            style={{ flex: 1 }}
            onTouchEnd={() => setSettingsVisible(false)}
          />
          <View
            style={{
              width: "64%",
              backgroundColor: "#ffffff",
              padding: 16,
              borderTopLeftRadius: 16,
              borderBottomLeftRadius: 16,
              shadowColor: "#000",
              shadowOpacity: 0.15,
              shadowRadius: 16,
              elevation: 8,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <Text
                style={{ fontWeight: "800", fontSize: 16, color: "#0f172a" }}
              >
                Admin Settings
              </Text>
              <TouchableOpacity
                onPress={() => setSettingsVisible(false)}
                hitSlop={10}
              >
                <Ionicons name="close" size={20} color="#334155" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={handleLogout}
              style={{
                backgroundColor: "#ef4444",
                paddingVertical: 12,
                borderRadius: 10,
                alignItems: "center",
                marginTop: 8,
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "700" }}>Logout</Text>
            </TouchableOpacity>

            <View style={{ marginTop: 14 }}>
              <Text style={{ color: "#94a3b8", fontSize: 11 }}>
                v1.0 • iConsult Admin
              </Text>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
