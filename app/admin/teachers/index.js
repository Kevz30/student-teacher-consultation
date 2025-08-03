// app/admin/teachers/index.js
import { router } from "expo-router";
import { FlatList, Text, TouchableOpacity, View } from "react-native";

const colleges = ["CAS", "CBA", "COE", "CHM", "DCS"];

export default function CollegesListScreen() {
  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Text style={{ fontSize: 24, fontWeight: "bold", marginBottom: 20, textAlign: "center" }}>
        Colleges
      </Text>

      <FlatList
        data={colleges}
        keyExtractor={(item) => item}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={{
              backgroundColor: "#007bff",
              padding: 15,
              borderRadius: 8,
              marginBottom: 15,
              alignItems: "center",
            }}
            onPress={() => router.push(`/admin/teachers/${item}`)}
          >
            <Text style={{ color: "#fff", fontSize: 16 }}>{item}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}
