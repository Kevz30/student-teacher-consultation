// app/_layout.js
import { Stack } from "expo-router";
import "formdata-polyfill";
import { GestureHandlerRootView } from "react-native-gesture-handler";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack screenOptions={{ headerTitleStyle: { fontWeight: "700" } }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />

        {/* make sure student dashboard shows a header */}
        <Stack.Screen
          name="student-dashboard"
          options={{ headerShown: true, title: "Student Dashboard" }}
        />

        {/* optional: keep these explicit too */}
        <Stack.Screen name="student-schedule/[id]" options={{ title: "Schedule" }} />
        <Stack.Screen name="teacher-dashboard" options={{ headerShown: true, title: "Teacher Dashboard" }} />
        <Stack.Screen name="teacher-schedule/[id]" options={{ title: "Teacher Schedule" }} />
        <Stack.Screen name="my-classes" options={{ title: "My Classes" }} />
        <Stack.Screen name="class-details/[id]" options={{ title: "Class Details" }} />
      </Stack>
    </GestureHandlerRootView>
  );
}
