// app/_layout.js
import { Stack } from "expo-router";
import React from "react";
import { Text } from "react-native";
import "react-native-gesture-handler";
import { GestureHandlerRootView } from "react-native-gesture-handler";

class ScreenErrorBoundary extends React.Component {
  constructor(p){ super(p); this.state = { error: null }; }
  static getDerivedStateFromError(error){ return { error }; }
  componentDidCatch(error, info){
    console.error("[SCREEN ERROR]", error?.message, info?.componentStack);
  }
  render(){
    if (this.state.error){
      return (
        <GestureHandlerRootView style={{flex:1,justifyContent:"center",alignItems:"center",padding:20,backgroundColor:"#fff"}}>
          <Text style={{fontWeight:"700",fontSize:16}}>Screen crashed</Text>
          <Text style={{marginTop:8, textAlign:"center"}}>{String(this.state.error?.message || this.state.error)}</Text>
        </GestureHandlerRootView>
      );
    }
    return this.props.children;
  }
}

export default function RootLayout(){
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ScreenErrorBoundary>
        <Stack screenOptions={{ headerTitleStyle: { fontWeight: "700" } }}>
          {/* entry + auth-free routes */}
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="screens/LoginScreen" options={{ title: "Login" }} />
          <Stack.Screen name="screens/student-register" options={{ title: "Student Registration" }} />
          <Stack.Screen name="screens/teacher-register" options={{ title: "Teacher Registration" }} />

          {/* dashboards and other routes */}
          <Stack.Screen name="student-dashboard" options={{ headerShown: true, title: "Student Dashboard" }} />
          <Stack.Screen name="student-notifications/index" options={{ headerShown: false }} />
          <Stack.Screen name="student-schedule/[id]" options={{ title: "Schedule" }} />
          <Stack.Screen name="teacher-dashboard" options={{ headerShown: true, title: "Teacher Dashboard" }} />
          <Stack.Screen name="teacher-schedule/[id]" options={{ title: "Teacher Schedule" }} />
          <Stack.Screen name="my-classes" options={{ title: "My Classes" }} />
          <Stack.Screen name="class-details/[id]" options={{ title: "Class Details" }} />
        </Stack>
      </ScreenErrorBoundary>
    </GestureHandlerRootView>
  );
}
