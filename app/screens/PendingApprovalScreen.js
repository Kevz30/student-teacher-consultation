// app/screens/PendingApprovalScreen.js
import { useRouter } from "expo-router";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { ActivityIndicator, Button, Text, View } from "react-native";
import auth from "../../constants/auth";
import db from "../../constants/firestore";

export default function PendingApprovalScreen() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let unsubDoc; // hold doc listener

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      // clean up previous doc listener if any
      if (unsubDoc) {
        unsubDoc();
        unsubDoc = undefined;
      }

      if (!user) {
        router.replace("/screens/LoginScreen");
        return;
      }

      const ref = doc(db, "instructors", user.uid);
      unsubDoc = onSnapshot(
        ref,
        (snap) => {
          const status = (snap.data()?.status || "").toLowerCase();
          if (status === "approved") {
            router.replace("/teacher-dashboard");
          } else {
            setChecking(false);
          }
        },
        (err) => {
          console.warn("Firestore listener error:", err.message);
          setChecking(false);
        }
      );
    });

    // cleanup on unmount
    return () => {
      unsubAuth();
      if (unsubDoc) unsubDoc();
    };
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      // snapshot will auto-cleanup because of onAuthStateChanged + unsub
      router.replace("/screens/LoginScreen");
    } catch (e) {
      console.error("Logout failed:", e);
    }
  };

  return (
    <View
      style={{
        flex: 1,
        padding: 20,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#fff",
      }}
    >
      <Text style={{ fontSize: 20, fontWeight: "bold", marginBottom: 10 }}>
        Account Pending Approval
      </Text>
      <Text style={{ fontSize: 16, textAlign: "center", marginBottom: 20 }}>
        Your account is awaiting admin approval. You’ll be moved automatically once approved.
      </Text>

      {checking ? (
        <View style={{ alignItems: "center" }}>
          <ActivityIndicator size="large" />
          <Text style={{ marginTop: 10, color: "#666" }}>Checking status…</Text>
        </View>
      ) : (
        <Button title="Go back to Login" onPress={handleLogout} />
      )}
    </View>
  );
}
