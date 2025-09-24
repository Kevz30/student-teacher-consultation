// app/index.js
import { router } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import auth from "../constants/auth";
import routeByRole from "../utils/routeByRole"; // ✅ shared helper

export default function IndexGate() {
  const [checking, setChecking] = useState(true);
  const routed = useRef(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user && !routed.current) {
        routed.current = true;
        await routeByRole(user.uid); // auto-route restored user
      } else if (!user) {
        router.replace("/screens/LoginScreen");
      }
      setChecking(false);
    });
    return unsub;
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <ActivityIndicator size="large" />
      <Text style={{ marginTop: 12, fontWeight: "600" }}>
        {checking ? "Restoring session…" : "Loading…"}
      </Text>
    </View>
  );
}
