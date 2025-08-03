// app/screens/TeacherRegistrationScreen.js

import { Picker } from "@react-native-picker/picker";
import { useRouter } from "expo-router";
import { createUserWithEmailAndPassword } from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Button,
  Text,
  TextInput,
  View,
} from "react-native";

import auth from "../../constants/auth";
import db from "../../constants/firestore";

export default function TeacherRegistrationScreen() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [college, setCollege] = useState("");
  const [colleges, setColleges] = useState([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const loadColleges = async () => {
      try {
        const snap = await getDocs(collection(db, "courses"));
        const list = snap.docs.map((d) => d.id);
        setColleges(list);
      } catch (err) {
        console.error("Error loading colleges:", err);
      }
    };
    loadColleges();
  }, []);

  const handleRegister = async () => {
    if (!fullName || !email || !password || !college) {
      return Alert.alert("Please complete all fields.");
    }

    try {
      setLoading(true);
      const userCred = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      const user = userCred.user;

      await setDoc(doc(db, "instructors", user.uid), {
        uid: user.uid,
        email: user.email,
        fullName,
        displayName: fullName,
        role: "teacher",
        college,
        status: "pending", // ✅ Mark as pending
        createdAt: serverTimestamp(),
      });

      router.replace("/screens/PendingApprovalScreen"); // ✅ Redirect after success
    } catch (err) {
      Alert.alert("Error", err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ padding: 20 }}>
      <Text style={{ fontSize: 18, fontWeight: "bold", marginBottom: 10 }}>
        Teacher Registration
      </Text>

      <TextInput
        placeholder="Full Name"
        value={fullName}
        onChangeText={setFullName}
        autoCapitalize="words"
        style={{ marginBottom: 10, borderBottomWidth: 1, padding: 8 }}
      />

      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        style={{ marginBottom: 10, borderBottomWidth: 1, padding: 8 }}
      />

      <TextInput
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        style={{ marginBottom: 10, borderBottomWidth: 1, padding: 8 }}
      />

      <Text style={{ marginBottom: 4 }}>Select College</Text>
      <Picker
        selectedValue={college}
        onValueChange={setCollege}
        style={{ marginBottom: 20 }}
      >
        <Picker.Item label="-- Choose College --" value="" />
        {colleges.map((col) => (
          <Picker.Item key={col} label={col} value={col} />
        ))}
      </Picker>

      {loading ? (
        <ActivityIndicator size="large" color="#000" />
      ) : (
        <Button title="Register" onPress={handleRegister} />
      )}
    </View>
  );
}
