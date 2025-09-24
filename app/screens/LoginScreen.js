// app/screens/LoginScreen.js
import { router } from "expo-router";
import {
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { useEffect, useRef, useState } from "react";
import {
  Alert, Button, KeyboardAvoidingView, Platform,
  Text, TextInput, TouchableOpacity
} from "react-native";

import auth from "../../constants/auth";
import routeByRole from "../../utils/routeByRole";



const USERNAME_DOMAIN = "noemail.local"; // alias for username logins

// 🔒 toggle this for dev/prod
const VERIFY_EMAIL_REQUIRED = true; // set to false to bypass during testing

// optional test emails (only bypassed if VERIFY_EMAIL_REQUIRED = false)
const TEST_EMAILS = ["dcsunithead@test.com", "bsitunithead@test.com", "admin@test.com",];

const toLoginEmail = (input) => {
  const s = String(input || "").trim();
  if (!s) return "";
  if (s.includes("@")) return s; // real email
  const u = s.toLowerCase().replace(/\s+/g, "");
  return `${u}@${USERNAME_DOMAIN}`;
};

const isTestEmail = (email) => {
  if (!email) return false;
  return TEST_EMAILS.includes(String(email).toLowerCase());
};

export default function LoginScreen() {
  const [emailOrUsername, setEmailOrUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const routed = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const safeSetBusy = (v) => { if (mounted.current) setBusy(v); };

  // Session check
  useEffect(() => {
    safeSetBusy(true);
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!mounted.current) return;
      if (user && !routed.current) {
        const isUsername = user.email?.endsWith(`@${USERNAME_DOMAIN}`);
        const bypass = !VERIFY_EMAIL_REQUIRED && isTestEmail(user.email);

        if (!isUsername && !user.emailVerified && VERIFY_EMAIL_REQUIRED && !bypass) {
          try { await sendEmailVerification(user); } catch {}
          try { await signOut(auth); } catch {}
          Alert.alert(
            "Verify your email",
            "We sent a verification link to your email. Please verify, then log in again."
          );
          safeSetBusy(false);
          return;
        }

        routed.current = true;
        await routeByRole(user.uid);
      }
      safeSetBusy(false);
    });
    return unsub;
  }, []);

  const handleLogin = async () => {
    if (busy) return;
    const loginEmail = toLoginEmail(emailOrUsername);
    if (!loginEmail || !password) {
      Alert.alert("Missing info", "Enter username/email and password.");
      return;
    }
    try {
      safeSetBusy(true);
      const cred = await signInWithEmailAndPassword(auth, loginEmail, password);
      const user = cred.user;

      const isUsername = user.email?.endsWith(`@${USERNAME_DOMAIN}`);
      const bypass = !VERIFY_EMAIL_REQUIRED && isTestEmail(user.email);

      if (!isUsername && !user.emailVerified && VERIFY_EMAIL_REQUIRED && !bypass) {
        try { await sendEmailVerification(user); } catch {}
        try { await signOut(auth); } catch {}
        Alert.alert(
          "Verify your email",
          "We sent a verification link to your email. Please verify, then log in again."
        );
        safeSetBusy(false);
        return;
      }

      if (!routed.current) {
        routed.current = true;
        await routeByRole(user.uid, { showPendingAlert: true });
      }
    } catch (err) {
      Alert.alert("Login Failed", err?.message || String(err));
    } finally {
      safeSetBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#fff", justifyContent: "center", padding: 20 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <Text style={{ fontSize: 28, fontWeight: "bold", marginBottom: 20, textAlign: "center" }}>
        Login
      </Text>

      <TextInput
        placeholder="Email or Username"
        placeholderTextColor="#999"
        value={emailOrUsername}
        onChangeText={setEmailOrUsername}
        autoCapitalize="none"
        keyboardType="default"
        editable={!busy}
        style={{
          backgroundColor: "#f2f2f2",
          marginBottom: 12,
          padding: 10,
          borderRadius: 8,
          opacity: busy ? 0.6 : 1
        }}
      />

      <TextInput
        placeholder="Password"
        placeholderTextColor="#999"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        editable={!busy}
        style={{
          backgroundColor: "#f2f2f2",
          marginBottom: 12,
          padding: 10,
          borderRadius: 8,
          opacity: busy ? 0.6 : 1
        }}
      />

      <Button title={busy ? "Signing in…" : "Login"} onPress={handleLogin} disabled={busy} />

      <TouchableOpacity onPress={() => router.push("/screens/student-register")} disabled={busy}>
        <Text style={{ marginTop: 20, textAlign: "center", color: "blue", opacity: busy ? 0.6 : 1 }}>
          Don’t have an account? Register
        </Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.push("/screens/teacher-register")} disabled={busy}>
        <Text style={{ marginTop: 10, textAlign: "center", color: "blue", opacity: busy ? 0.6 : 1 }}>
          Register as a Teacher?
        </Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}
