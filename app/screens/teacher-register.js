// app/screens/teacher-register.js
import { router } from "expo-router";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  FlatList, KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text, TextInput,
  TouchableOpacity,
  View
} from "react-native";
import auth from "../../constants/auth";
import db from "../../constants/firestore";

/* ---------- Searchable modal select (no crashing, good for many items) ---------- */
function SearchableSelect({ label, placeholder, value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const filtered = (options || []).filter((x) =>
    x?.toLowerCase?.().includes(q.trim().toLowerCase())
  );

  const Item = ({ item }) => (
    <TouchableOpacity
      onPress={() => { onChange(item); setOpen(false); }}
      style={{
        paddingVertical: 12, paddingHorizontal: 14,
        borderBottomWidth: 1, borderColor: "#eee",
        backgroundColor: value === item ? "#eef" : "#fff",
      }}
    >
      <Text style={{ fontWeight: value === item ? "700" : "400" }}>{item}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ fontWeight: "700", marginBottom: 6 }}>{label}</Text>
      <TouchableOpacity
        onPress={() => { setQ(""); setOpen(true); }}
        style={{
          borderWidth: 1, borderColor: "#ddd", borderRadius: 10,
          paddingVertical: 12, paddingHorizontal: 14, backgroundColor: "#fff"
        }}
      >
        <Text style={{ color: value ? "#111" : "#777" }}>
          {value || placeholder}
        </Text>
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: "#fff" }}
                              behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={{ paddingTop: Platform.OS === "android" ? 32 : 10, paddingHorizontal: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: "800", marginBottom: 8 }}>{label}</Text>
            <TextInput
              placeholder="Search…"
              value={q}
              onChangeText={setQ}
              autoCapitalize="none"
              style={{
                borderWidth: 1, borderColor: "#ddd", borderRadius: 10,
                paddingVertical: 10, paddingHorizontal: 12, marginBottom: 10
              }}
            />
            <View style={{ maxHeight: "85%" }}>
              <FlatList
                data={filtered}
                keyExtractor={(it, i) => `${it}-${i}`}
                renderItem={Item}
                ListEmptyComponent={<Text style={{ padding: 16, color: "#777" }}>No matches</Text>}
                keyboardShouldPersistTaps="handled"
              />
            </View>
            <View style={{ height: 10 }} />
            <Button title="Close" onPress={() => setOpen(false)} />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

/* ---------- Screen ---------- */
export default function TeacherRegister() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");

  // We treat the "courses" collection doc IDs as colleges (same as your previous setup)
  const [colleges, setColleges] = useState([]);
  const [college, setCollege]   = useState("");
  const [courses, setCourses]   = useState([]);
  const [course, setCourse]     = useState("");

  const [busy, setBusy] = useState(false);

  // Safe state updates on unmount
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const safeSet = (setter) => (v) => { if (mounted.current) setter(v); };

  // Load colleges
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, "courses"));
        const list = snap.docs.map((d) => d.id).sort();
        safeSet(setColleges)(list);
      } catch (e) {
        console.error("[colleges] load failed:", e);
      }
    })();
  }, []);

  // Load courses for selected college
  useEffect(() => {
    if (!college) { safeSet(setCourses)([]); safeSet(setCourse)(""); return; }
    (async () => {
      try {
        const ref = doc(db, "courses", college);
        const s = await getDoc(ref);
        const data = s.data() || {};
        const list = Array.isArray(data.list) ? data.list : [];
        safeSet(setCourses)(list);
        safeSet(setCourse)("");
      } catch (e) {
        console.error("[courses] load failed:", e);
      }
    })();
  }, [college]);

  const handleRegister = async () => {
    if (busy) return;
    if (!fullName.trim() || !email.trim() || !password || !college || !course) {
      Alert.alert("Incomplete", "Please fill all fields and choose college & course.");
      return;
    }

    try {
      safeSet(setBusy)(true);

      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const user = cred.user;

      await setDoc(doc(db, "instructors", user.uid), {
        uid: user.uid,
        email: user.email,
        fullName: fullName.trim(),
        displayName: fullName.trim(),
        role: "teacher",
        college,
        course,
        status: "pending",            // unit head will approve
        createdAt: serverTimestamp(),
      }, { merge: true });

      Alert.alert("Submitted", "Your registration is pending approval.");
      router.replace("/screens/LoginScreen");
    } catch (e) {
      // Friendlier auth error messages
      const msg =
        e?.code === "auth/email-already-in-use" ? "Email is already registered."
      : e?.code === "auth/weak-password"        ? "Password is too weak."
      : e?.message || "Registration failed.";
      Alert.alert("Error", msg);
    } finally {
      safeSet(setBusy)(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      <View style={{ paddingTop: Platform.OS === "android" ? 38 : 18, paddingHorizontal: 20, paddingBottom: 12 }}>
        <Text style={{ fontSize: 20, fontWeight: "800" }}>Teacher Registration</Text>
        <Text style={{ color: "#666", marginTop: 6 }}>Search-select (stable for large lists).</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <TextInput
          placeholder="Full Name"
          value={fullName}
          onChangeText={setFullName}
          autoCapitalize="words"
          style={{ borderWidth:1,borderColor:"#ddd",padding:12,borderRadius:10, marginBottom:10 }}
        />
        <TextInput
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          style={{ borderWidth:1,borderColor:"#ddd",padding:12,borderRadius:10, marginBottom:10 }}
        />
        <TextInput
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          style={{ borderWidth:1,borderColor:"#ddd",padding:12,borderRadius:10, marginBottom:16 }}
        />

        <SearchableSelect
          label="College"
          placeholder="Select College"
          value={college}
          onChange={(v) => setCollege(v)}
          options={colleges}
        />

        <SearchableSelect
          label="Course"
          placeholder={college ? "Select Course" : "Select College first"}
          value={course}
          onChange={(v) => setCourse(v)}
          options={courses}
        />

        <Button title={busy ? "Registering…" : "Register"} onPress={handleRegister} disabled={busy} />
        <View style={{ height: 10 }} />
        <Button title="Back to Login" onPress={() => router.replace("/screens/LoginScreen")} />
      </ScrollView>
    </View>
  );
}
