// app/_layout.js
import { Stack } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { createContext, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import "react-native-gesture-handler";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import auth from "../constants/auth";

export const AuthPrefsContext = createContext({
  autoLoginEnabled: true,
  setAutoLoginEnabled: () => {},
});

function ScreenErrorBoundary({ children }) { return children; }

export default function RootLayout(){
  const [authChecked, setAuthChecked] = useState(false);
  const [autoLoginEnabled] = useState(true); // always ON
  const prefsValue = useMemo(() => ({ autoLoginEnabled, setAutoLoginEnabled: () => {} }), [autoLoginEnabled]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, () => setAuthChecked(true));
    return unsub;
  }, []);

  if (!authChecked) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={{ flex:1, justifyContent:"center", alignItems:"center" }}>
          <ActivityIndicator size="large" />
          <Text style={{ marginTop: 12, fontWeight: "600" }}>Loading…</Text>
        </View>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthPrefsContext.Provider value={prefsValue}>
        <ScreenErrorBoundary>
          <Stack screenOptions={{ headerTitleStyle: { fontWeight: "700" } }}>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            {/* Hide header entirely on Login */}
            <Stack.Screen name="screens/LoginScreen" options={{ headerShown: false }} />
            <Stack.Screen name="screens/student-register" options={{ title: "Student Registration" }} />
            <Stack.Screen name="screens/teacher-register" options={{ title: "Teacher Registration" }} />
            <Stack.Screen name="student-dashboard" options={{ headerShown: true, title: "Student Dashboard" }} />
            <Stack.Screen name="student-notifications/index" options={{ headerShown: false }} />
            <Stack.Screen name="student-schedule/[id]" options={{ title: "Schedule" }} />
<Stack.Screen name="teacher-dashboard" options={{ headerShown: true, title: "Teacher Dashboard" }} />

            <Stack.Screen name="teacher-schedule/[id]" options={{ title: "Teacher Schedule" }} />
            <Stack.Screen name="my-classes" options={{ title: "My Classes" }} />
            <Stack.Screen name="class-details/[id]" options={{ title: "Class Details" }} />
            <Stack.Screen name="screens/PendingApprovalScreen" options={{ title: "Pending Approval", headerShown: false }} />
          </Stack>
        </ScreenErrorBoundary>
      </AuthPrefsContext.Provider>
    </GestureHandlerRootView>
  );
}
