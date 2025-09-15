// app/screens/student-register.js
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text, TextInput,
  TouchableOpacity,
  View
} from "react-native";
import auth from "../../constants/auth";
import db from "../../constants/firestore";
import parseCOR from "../utils/corParser"; // expects base64
import uploadToCloudinary from "../utils/uploadToCloudinary"; // expects base64

/* ---------- Searchable modal select ---------- */
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
export default function StudentRegister() {
  const [fullName, setFullName]   = useState("");
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");

  const [departments, setDepartments] = useState([]);
  const [department, setDepartment]   = useState("");
  const [courses, setCourses]         = useState([]);
  const [course, setCourse]           = useState("");

  // COR image state
  const [corUri, setCorUri] = useState(null); // local file:// path
  const [busy, setBusy] = useState(false);

  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const safeSet = (setter) => (v) => { if (mounted.current) setter(v); };

  // Load departments once
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, "courses"));
        const list = snap.docs.map((d) => d.id).sort();
        safeSet(setDepartments)(list);
      } catch (e) {
        console.error("[departments] load failed:", e);
      }
    })();
  }, []);

  // Load courses when department changes
  useEffect(() => {
    if (!department) { safeSet(setCourses)([]); safeSet(setCourse)(""); return; }
    (async () => {
      try {
        const ref = doc(db, "courses", department);
        const s = await getDoc(ref);
        const data = s.data() || {};
        const list = Array.isArray(data.list) ? data.list : [];
        safeSet(setCourses)(list);
        safeSet(setCourse)("");
      } catch (e) {
        console.error("[courses] load failed:", e);
      }
    })();
  }, [department]);

  // Pick COR image (SDK 54-safe)
  const handlePickCOR = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert("Permission required", "Please allow gallery access."); return; }

      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.85,
      });
      if (res.canceled) return;

      const asset = res.assets?.[0];
      if (!asset?.uri) { Alert.alert("No image selected"); return; }

      let uri = asset.uri;
      if (uri.startsWith("content://")) {
        const dest = `${FileSystem.cacheDirectory}cor_${Date.now()}.jpg`;
        await FileSystem.copyAsync({ from: uri, to: dest });
        uri = dest;
      }
      safeSet(setCorUri)(uri);
    } catch (e) {
      console.error("Pick COR error:", e);
      Alert.alert("Error", "Failed to pick image.");
    }
  };

  const handleRegister = async () => {
    if (busy) return;
    if (!fullName || !email || !password || !department || !course || !corUri) {
      Alert.alert("Incomplete", "Fill all fields and attach your COR image.");
      return;
    }

    try {
      safeSet(setBusy)(true);

      // Read file as base64 once
      const b64 = await FileSystem.readAsStringAsync(corUri, {encoding: FileSystem.EncodingType.Base64,});

      // Upload to Cloudinary
      const corUrl = await uploadToCloudinary(b64, "student_cor_upload");
      if (!corUrl) throw new Error("Cloudinary upload failed");

      // OCR (non-blocking)
      let studentNumber = null;
      try {
        const parsed = await parseCOR(b64);
        studentNumber = parsed?.studentNumber || null;
      } catch (e) {
        console.warn("OCR failed, continuing:", e?.message || e);
      }

      // Create auth account
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const user = cred.user;

      // Save student profile
      await setDoc(doc(db, "students", user.uid), {
        uid: user.uid,
        fullName: fullName.trim(),
        email: user.email,
        role: "student",
        status: "pending_verification",
        department,
        course,
        studentNumber, // may be null if OCR failed
        corUrl,
        createdAt: serverTimestamp(),
      }, { merge: true });

      Alert.alert("Success", "Registration complete!");
      router.replace("/screens/LoginScreen");
    } catch (e) {
      Alert.alert("Error", e?.message || "Registration failed.");
    } finally {
      safeSet(setBusy)(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      <View style={{ paddingTop: Platform.OS === "android" ? 38 : 18, paddingHorizontal: 20, paddingBottom: 12 }}>
        <Text style={{ fontSize: 20, fontWeight: "800" }}>Student Registration</Text>
        <Text style={{ color: "#666", marginTop: 6 }}>Search-select + COR upload (SDK 54 safe).</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <TextInput
          placeholder="Full Name"
          value={fullName}
          onChangeText={setFullName}
          style={{ borderWidth:1,borderColor:"#ddd",padding:12,borderRadius:10, marginBottom:10 }}
          autoCapitalize="words"
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
          label="Department"
          placeholder="Select Department"
          value={department}
          onChange={(v) => setDepartment(v)}
          options={departments}
        />

        <SearchableSelect
          label="Course"
          placeholder={department ? "Select Course" : "Select Department first"}
          value={course}
          onChange={(v) => setCourse(v)}
          options={courses}
        />

        <View style={{ height: 8 }} />
        <Button title={corUri ? "Change COR Image" : "Pick COR Image"} onPress={handlePickCOR} />
        {corUri ? (
          <Image
            source={{ uri: corUri }}
            style={{ height: 180, marginTop: 12, borderRadius: 10, borderWidth: 1, borderColor: "#ddd" }}
            resizeMode="cover"
          />
        ) : null}

        <View style={{ height: 16 }} />
        <Button title={busy ? "Registering…" : "Register"} onPress={handleRegister} disabled={busy} />
        <View style={{ height: 10 }} />
        <Button title="Back to Login" onPress={() => router.replace("/screens/LoginScreen")} />
      </ScrollView>
    </View>
  );
}
