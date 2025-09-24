// app/screens/ChangePassword.js
import { router } from "expo-router";
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "firebase/auth";
import { useState } from "react";
import { Alert, Text, TextInput, TouchableOpacity, View } from "react-native";
import auth from "../../constants/auth";

export default function ChangePassword() {
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [loading, setLoading] = useState(false);

  const onSave = async () => {
    const user = auth.currentUser;
    if (!user) return Alert.alert("Not signed in", "Please log in again.");

    if (!currentPwd || !newPwd || !confirmPwd) return Alert.alert("Required", "Fill in all fields.");
    if (newPwd.length < 6) return Alert.alert("Weak password", "Use at least 6 characters.");
    if (newPwd !== confirmPwd) return Alert.alert("Mismatch", "New password and confirm do not match.");

    try {
      setLoading(true);
      // re-authenticate with current password
      const email = user.email;
      if (!email) throw new Error("Your account has no email.");
      const cred = EmailAuthProvider.credential(email, currentPwd);
      await reauthenticateWithCredential(user, cred);

      // update password
      await updatePassword(user, newPwd);

      Alert.alert("Success", "Password updated.");
      router.back();
    } catch (e) {
      const msg =
        e?.code === "auth/wrong-password" ? "Current password is incorrect." :
        e?.code === "auth/too-many-requests" ? "Too many tries. Try again later." :
        e?.code === "auth/requires-recent-login" ? "Please log in again and retry." :
        e?.message || String(e);
      Alert.alert("Failed", msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, padding: 16, backgroundColor: "#fff" }}>
      <Text style={{ fontSize: 20, fontWeight: "800", marginBottom: 16 }}>Change password</Text>

      <Text>Current password</Text>
      <TextInput
        value={currentPwd}
        onChangeText={setCurrentPwd}
        secureTextEntry
        autoCapitalize="none"
        style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 10, marginBottom: 10 }}
      />

      <Text>New password</Text>
      <TextInput
        value={newPwd}
        onChangeText={setNewPwd}
        secureTextEntry
        autoCapitalize="none"
        style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 10, marginBottom: 10 }}
      />

      <Text>Confirm new password</Text>
      <TextInput
        value={confirmPwd}
        onChangeText={setConfirmPwd}
        secureTextEntry
        autoCapitalize="none"
        style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 10, marginBottom: 16 }}
      />

      <TouchableOpacity
        onPress={onSave}
        disabled={loading}
        style={{ backgroundColor: "#2563eb", padding: 12, borderRadius: 10, alignItems: "center" }}
      >
        <Text style={{ color: "#fff", fontWeight: "700" }}>{loading ? "Saving…" : "Save password"}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.back()} style={{ padding: 12, alignItems: "center", marginTop: 8 }}>
        <Text style={{ color: "#111827", fontWeight: "600" }}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}
