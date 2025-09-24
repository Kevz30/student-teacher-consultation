// app/unit-head/create-teacher.js
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { getApps, initializeApp } from "firebase/app";
import { createUserWithEmailAndPassword, getAuth } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import auth from "../../constants/auth";
import db from "../../constants/firestore";

/* ---------- tiny searchable select ---------- */
function SearchableSelect({ label, placeholder, value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const filtered = (options || []).filter((x) =>
    x?.toLowerCase?.().includes(q.trim().toLowerCase())
  );

  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ fontWeight: "800", marginBottom: 6 }}>{label}</Text>
      <TouchableOpacity
        onPress={() => {
          setQ("");
          setOpen(true);
        }}
        style={{
          borderWidth: 1,
          borderColor: "#e5e7eb",
          borderRadius: 12,
          paddingVertical: 12,
          paddingHorizontal: 14,
          backgroundColor: "#fff",
        }}
      >
        <Text style={{ color: value ? "#111" : "#6b7280" }}>
          {value || placeholder}
        </Text>
      </TouchableOpacity>

      {open && (
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 72,
            zIndex: 10,
            backgroundColor: "white",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "#e5e7eb",
            maxHeight: 240,
            overflow: "hidden",
          }}
        >
          <TextInput
            placeholder="Search…"
            value={q}
            onChangeText={setQ}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderBottomWidth: 1,
              borderColor: "#eee",
            }}
          />
          <ScrollView keyboardShouldPersistTaps="handled">
            {filtered.length === 0 ? (
              <Text style={{ padding: 12, color: "#6b7280" }}>No matches</Text>
            ) : (
              filtered.map((item) => (
                <TouchableOpacity
                  key={item}
                  onPress={() => {
                    onChange(item);
                    setOpen(false);
                  }}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderBottomWidth: 1,
                    borderColor: "#f3f4f6",
                  }}
                >
                  <Text>{item}</Text>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
          <TouchableOpacity
            onPress={() => setOpen(false)}
            style={{ padding: 10, alignItems: "center" }}
          >
            <Text style={{ color: "#2563eb", fontWeight: "700" }}>Close</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

/* ---------- helpers ---------- */
const USERNAME_DOMAIN = "noemail.local";

const normUsername = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9._-]/g, "");

const aliasEmailFromUsername = (u) => `${u}@${USERNAME_DOMAIN}`;

const genPassword = () => {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  let s = "";
  for (let i = 0; i < 12; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
};

// Use a secondary Firebase App so the UH stays signed-in on the primary app.
function getSecondaryAuth() {
  const base = auth.app; // ← use the same config as your initialized primary app
  const existing = getApps().find((a) => a.name === "uh_secondary");
  const secApp = existing || initializeApp(base.options, "uh_secondary");
  return getAuth(secApp);
}

export default function CreateTeacher() {
  const router = useRouter();
  const { course: preCourse = "", college: preCollege = "" } =
    useLocalSearchParams();

  const viewerUid = auth.currentUser?.uid || null;

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [email, setEmail] = useState(""); // optional contact email
  const [college, setCollege] = useState(String(preCollege || ""));
  const [course, setCourse] = useState(String(preCourse || ""));
  const [busy, setBusy] = useState(false);

  const [colleges, setColleges] = useState([]);
  const [courses, setCourses] = useState([]);

  // load colleges
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, "courses"));
        const list = snap.docs.map((d) => d.id).sort();
        setColleges(list);
      } catch (e) {
        console.warn(e?.message || e);
      }
    })();
  }, []);

  // load courses per college
  useEffect(() => {
    if (!college) {
      setCourses([]);
      setCourse("");
      return;
    }
    (async () => {
      try {
        const s = await getDoc(doc(db, "courses", college));
        const data = s.exists() ? s.data() : {};
        setCourses(Array.isArray(data.list) ? data.list : []);
      } catch (e) {
        console.warn(e?.message || e);
      }
    })();
  }, [college]);

  const handleCreate = async () => {
    if (busy) return;
    if (!fullName.trim() || !college || !course) {
      Alert.alert("Incomplete", "Fill Name, College and Course.");
      return;
    }
    const u = normUsername(username);
    if (!u) {
      Alert.alert("Username missing", "Enter a username or tap Generate.");
      return;
    }
    const pwd = password || genPassword();

    try {
      setBusy(true);

      // ensure username unique in Firestore
      const dupSnap = await getDocs(
        query(
          collection(db, "instructors"),
          where("username", "==", u),
          limit(1)
        )
      );
      if (!dupSnap.empty) {
        Alert.alert("Username taken", "Choose a different username.");
        setBusy(false);
        return;
      }

      // create Auth user on secondary auth (alias email)
      const secondaryAuth = getSecondaryAuth();
      const aliasEmail = aliasEmailFromUsername(u);
      const cred = await createUserWithEmailAndPassword(
        secondaryAuth,
        aliasEmail,
        pwd
      );
      const uid = cred.user.uid;

      // create Firestore profile (auto-approved)
      await setDoc(
        doc(db, "instructors", uid),
        {
          uid,
          username: u,
          aliasEmail, // backing login email
          email: email.trim() || "", // optional contact; teacher can change later
          fullName: fullName.trim(),
          displayName: fullName.trim(),
          role: "teacher",
          college,
          course,
          status: "approved",
          createdBy: viewerUid || null,
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      Alert.alert("Teacher created", `Username: ${u}\nPassword (copy now): ${pwd}`);

      router.replace(`/teacher-schedule/${uid}?fromUH=1`);
    } catch (e) {
      const msg =
        e?.code === "auth/email-already-in-use"
          ? "Username already exists."
          : e?.code === "auth/invalid-email"
          ? "Username format looks invalid."
          : e?.message || "Create failed.";
      Alert.alert("Error", msg);
    } finally {
      setBusy(false);
    }
  };

  const handleGenUsername = () => {
    if (username) return;
    const base = normUsername(fullName) || "teacher";
    const suffix = Math.floor(1000 + Math.random() * 9000);
    setUsername(`${base}${suffix}`);
  };

  const handleGenPassword = () => setPassword(genPassword());

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#fff" }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingTop: Platform.OS === "android" ? 30 : 16,
        }}
      >
        <Text style={{ fontSize: 20, fontWeight: "800", marginBottom: 12 }}>
          Create Teacher
        </Text>

        <TextInput
          placeholder="Full name"
          value={fullName}
          onChangeText={setFullName}
          autoCapitalize="words"
          onBlur={handleGenUsername}
          style={{
            borderWidth: 1,
            borderColor: "#e5e7eb",
            borderRadius: 12,
            padding: 12,
            marginBottom: 12,
          }}
        />

        <SearchableSelect
          label="College"
          placeholder="Select college"
          value={college}
          onChange={setCollege}
          options={colleges}
        />

        <SearchableSelect
          label="Course"
          placeholder={college ? "Select course" : "Select college first"}
          value={course}
          onChange={setCourse}
          options={courses}
        />

        <Text style={{ fontWeight: "800", marginBottom: 6 }}>Username</Text>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
          <TextInput
            placeholder="username"
            value={username}
            onChangeText={(t) => setUsername(normUsername(t))}
            autoCapitalize="none"
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: "#e5e7eb",
              borderRadius: 12,
              padding: 12,
            }}
          />
          <TouchableOpacity
            onPress={handleGenUsername}
            style={{
              paddingHorizontal: 12,
              borderRadius: 12,
              backgroundColor: "#e5e7eb",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontWeight: "800" }}>Generate</Text>
          </TouchableOpacity>
        </View>

        <Text style={{ fontWeight: "800", marginBottom: 6 }}>Password</Text>
        <View
          style={{
            flexDirection: "row",
            gap: 8,
            marginBottom: 16,
            alignItems: "center",
          }}
        >
          <View style={{ flex: 1, position: "relative" }}>
            <TextInput
              placeholder="auto-generated if blank"
              value={password}
              onChangeText={setPassword}
              autoCapitalize="none"
              secureTextEntry={!showPwd}
              style={{
                borderWidth: 1,
                borderColor: "#e5e7eb",
                borderRadius: 12,
                padding: 12,
                paddingRight: 44,
              }}
            />
            <TouchableOpacity
              onPress={() => setShowPwd((v) => !v)}
              style={{ position: "absolute", right: 8, top: 10, padding: 6 }}
              hitSlop={8}
            >
              <Ionicons
                name={showPwd ? "eye-off-outline" : "eye-outline"}
                size={22}
                color="#6b7280"
              />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            onPress={handleGenPassword}
            style={{
              paddingHorizontal: 12,
              borderRadius: 12,
              backgroundColor: "#e5e7eb",
              justifyContent: "center",
              height: 44,
            }}
          >
            <Text style={{ fontWeight: "800" }}>Generate</Text>
          </TouchableOpacity>
        </View>

        <Text style={{ fontWeight: "800", marginBottom: 6 }}>
          Email (optional)
        </Text>
        <TextInput
          placeholder="email@school.edu (teacher can add later)"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          style={{
            borderWidth: 1,
            borderColor: "#e5e7eb",
            borderRadius: 12,
            padding: 12,
            marginBottom: 16,
          }}
        />

        <TouchableOpacity
          onPress={handleCreate}
          disabled={busy}
          style={{
            backgroundColor: "#2563eb",
            paddingVertical: 12,
            borderRadius: 12,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "white", fontWeight: "800" }}>
            {busy ? "Creating…" : "Create Teacher"}
          </Text>
        </TouchableOpacity>

        <View style={{ height: 12 }} />
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ alignItems: "center", paddingVertical: 10 }}
        >
          <Text style={{ color: "#6b7280", fontWeight: "700" }}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
