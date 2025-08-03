// app/screens/LoginScreen.js

import { router } from "expo-router";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useState } from "react";
import {
  Alert,
  Button,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
} from "react-native";

import auth from "../../constants/auth";
import db from "../../constants/firestore";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async () => {
    try {
      const userCred = await signInWithEmailAndPassword(auth, email, password);
      const uid = userCred.user.uid;

      const studentSnap = await getDoc(doc(db, "students", uid));
      if (studentSnap.exists()) {
        return router.replace("/student-dashboard");
      }

      const instrSnap = await getDoc(doc(db, "instructors", uid));
      if (instrSnap.exists()) {
        const status = instrSnap.data()?.status;
        if (status !== "approved") {
          Alert.alert("Pending Approval", "Your account is still awaiting admin approval.");
          return;
        }
        return router.replace("/teacher-dashboard");
      }

      const userSnap = await getDoc(doc(db, "users", uid));
      if (userSnap.exists()) {
        const role = userSnap.data()?.role;
        if (role === "admin") {
          return router.replace("/admin");
        }
      }

      Alert.alert("Login Failed", "No role assigned. Contact administrator.");
    } catch (err) {
      Alert.alert("Login Failed", err.message);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{
        flex: 1,
        backgroundColor: "#fff",
        justifyContent: "center",
        padding: 20,
      }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <Text
        style={{
          fontSize: 28,
          fontWeight: "bold",
          marginBottom: 20,
          textAlign: "center",
        }}
      >
        Login
      </Text>

      <TextInput
        placeholder="Email"
        placeholderTextColor="#999"
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        style={{
          backgroundColor: "#f2f2f2",
          marginBottom: 12,
          padding: 10,
          borderRadius: 8,
        }}
      />

      <TextInput
        placeholder="Password"
        placeholderTextColor="#999"
        secureTextEntry
        onChangeText={setPassword}
        style={{
          backgroundColor: "#f2f2f2",
          marginBottom: 20,
          padding: 10,
          borderRadius: 8,
        }}
      />

      <Button title="Login" onPress={handleLogin} />

      <TouchableOpacity onPress={() => router.push("/student-register")}>
        <Text style={{ marginTop: 20, textAlign: "center", color: "blue" }}>
          Don’t have an account? Register
        </Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.push("/teacher-register")}>
        <Text style={{ marginTop: 10, textAlign: "center", color: "blue" }}>
          Register as a Teacher?
        </Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}
