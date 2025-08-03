import { Stack } from "expo-router";
import "formdata-polyfill";

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="teacher-dashboard" options={{ headerShown: true }} />
      <Stack.Screen name="my-classes" options={{ title: "My Classes" }} />
      <Stack.Screen name="class-details/[id]" options={{ title: "Class Details" }} />
    </Stack>
  );
}
