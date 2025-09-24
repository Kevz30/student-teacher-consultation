// app/admin/teachers/index.js
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { FlatList, Text, TouchableOpacity, View } from "react-native";

const colleges = [
  { code: "CAS", subtitle: "Course details coming soon...", color: "#22c55e", icon: "school-outline" },
  { code: "CBA", subtitle: "Course details coming soon...", color: "#f97316", icon: "briefcase-outline" },
  { code: "COE", subtitle: "Course details coming soon...", color: "#8b5cf6", icon: "construct-outline" },
  { code: "CHM", subtitle: "Course details coming soon...", color: "#14b8a6", icon: "flask-outline" },
  { code: "DCS", subtitle: "Course details coming soon...", color: "#2563eb", icon: "laptop-outline" },
];

export default function CollegesListScreen() {
  return (
    <View style={{ flex: 1, padding: 20, backgroundColor: "#f8fafc" }}>
      <Text
        style={{
          fontSize: 22,
          fontWeight: "800",
          marginBottom: 20,
          textAlign: "center",
          color: "#0f172a",
        }}
      >
        Colleges
      </Text>

      <FlatList
        data={colleges}
        keyExtractor={(item) => item.code}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => router.push(`/admin/teachers/${item.code}`)}
            activeOpacity={0.9}
            style={{
              backgroundColor: "#ffffff",
              borderRadius: 16,
              padding: 16,
              marginBottom: 14,
              shadowColor: "#000",
              shadowOpacity: 0.06,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 3 },
              elevation: 2,
              borderWidth: 1,
              borderColor: "#f1f5f9",
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            {/* Icon */}
            <View
              style={{
                width: 50,
                height: 50,
                borderRadius: 14,
                backgroundColor: `${item.color}20`,
                alignItems: "center",
                justifyContent: "center",
                marginRight: 14,
              }}
            >
              <Ionicons name={item.icon} size={26} color={item.color} />
            </View>

            {/* Texts */}
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "700",
                  color: "#0f172a",
                }}
              >
                {item.code}
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: "#6b7280",
                  marginTop: 2,
                }}
              >
                {item.subtitle}
              </Text>
            </View>

            <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
          </TouchableOpacity>
        )}
      />
    </View>
  );
}
