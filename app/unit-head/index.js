// app/unit-head/index.js
import { useRouter } from "expo-router";
import { getAuth } from "firebase/auth";
import { collection, doc, getDoc, onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import db from "../../constants/firestore";

const norm = (s = "") => String(s).trim().toLowerCase();

const Badge = ({ text, tint = "#e5e7eb", border = "#e5e7eb", color = "#374151" }) => (
  <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: tint, borderWidth: 1, borderColor: border }}>
    <Text style={{ fontWeight: "700", color }}>{text}</Text>
  </View>
);

export default function UnitHeadScreen() {
  const auth = getAuth();
  const uid = auth.currentUser?.uid;
  const router = useRouter();

  // scope
  const [scopeCollege, setScopeCollege] = useState(null);
  const [scopeCourse, setScopeCourse] = useState(null);

  const [tab, setTab] = useState("teachers");
  const [teachers, setTeachers] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [qText, setQText] = useState("");

  // load scope from /users/{uid}
  useEffect(() => {
    if (!uid) return;
    (async () => {
      const snap = await getDoc(doc(db, "users", uid));
      const data = snap.exists() ? snap.data() : {};
      const targetCourse = data.targetCourse || data.course || data.unitScope?.course || null;
      const college = targetCourse ? null : (data.college || data.unitScope?.college || null);
      setScopeCourse(targetCourse || null);
      setScopeCollege(college || null);
    })();
  }, [uid]);

  // live data by scope
  useEffect(() => {
    if (!scopeCourse && !scopeCollege) return;
    setLoading(true);

    const unsubTeachers = onSnapshot(
      query(collection(db, "instructors"), orderBy("displayName", "asc")),
      (snap) => {
        const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const filtered = all.filter((t) =>
          scopeCourse ? norm(t.course||"")===norm(scopeCourse) : norm(t.college||"")===norm(scopeCollege)
        );
        setTeachers(filtered);
        setLoading(false);
      },
      (e) => { console.warn(e?.message||e); setLoading(false); }
    );

    const unsubStudents = onSnapshot(
      query(collection(db, "students"), orderBy("fullName", "asc")),
      (snap) => {
        const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const filtered = all.filter((s) =>
          scopeCourse ? norm(s.course||"")===norm(scopeCourse) : norm(s.department||"")===norm(scopeCollege)
        );
        setStudents(filtered);
      },
      (e) => console.warn(e?.message||e)
    );

    return () => { unsubTeachers(); unsubStudents(); };
  }, [scopeCollege, scopeCourse]);

  const qNorm = norm(qText);
  const viewTeachers = useMemo(() => {
    if (!qNorm) return teachers;
    return teachers.filter((t) => norm(`${t.displayName||t.fullName||""} ${t.email||""} ${t.course||""}`).includes(qNorm));
  }, [teachers, qNorm]);

  const viewStudents = useMemo(() => {
    if (!qNorm) return students;
    return students.filter((s) => norm(`${s.fullName||""} ${s.email||""} ${s.course||""}`).includes(qNorm));
  }, [students, qNorm]);

  const approvedCount = useMemo(
    () => teachers.filter((t) => (t.status || "").toLowerCase() === "approved").length,
    [teachers]
  );

  const TeacherItem = ({ item }) => {
    const status = (item.status || "").toLowerCase();
    return (
      <TouchableOpacity
        onPress={() => router.push(`/teacher-schedule/${item.id}?fromUH=1`)}
        style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" }}
      >
        <Text style={{ fontWeight: "700" }}>{item.displayName || item.fullName || "(no name)"}</Text>
        <Text style={{ color: "#6b7280" }}>{item.email || "-"}</Text>
        <View style={{ marginTop: 6, flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          {item.course ? <Badge text={`Course: ${item.course}`} /> : null}
          {item.college ? <Badge text={`College: ${item.college}`} /> : null}
          <Badge
            text={status === "approved" ? "approved" : (status || "pending")}
            tint={status === "approved" ? "#e6f7f2" : "#fef3c7"}
            border={status === "approved" ? "#34d399" : "#f59e0b"}
            color={status === "approved" ? "#047857" : "#92400e"}
          />
        </View>
      </TouchableOpacity>
    );
  };

  const StudentItem = ({ item }) => (
    <View style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" }}>
      <Text style={{ fontWeight: "700" }}>{item.fullName || "(no name)"}</Text>
      <Text style={{ color: "#6b7280" }}>{item.email || "-"}</Text>
      <View style={{ marginTop: 6, flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        {item.course ? <Badge text={`Course: ${item.course}`} /> : null}
        {item.department ? <Badge text={`Dept: ${item.department}`} /> : null}
      </View>
    </View>
  );

  const scopeLabel = scopeCourse ? `${scopeCourse} (course scope)` :
                     scopeCollege ? `${scopeCollege} (college scope)` : "(no scope)";

  return (
    <View style={{ flex: 1, padding: 16, paddingTop: Platform.OS==="android"?30:16, backgroundColor:"#fff" }}>
      <Text style={{ fontSize: 22, fontWeight: "800", marginBottom: 4 }}>Unit Head — {scopeLabel}</Text>

      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
        <Badge text={`${teachers.length} teachers`} />
        <Badge text={`${students.length} students`} />
        <Badge text={`${approvedCount} approved`} tint="#e6f7f2" border="#34d399" color="#047857" />
      </View>

      <View style={{ flexDirection: "row", backgroundColor: "#f3f4f6", borderRadius: 10, padding: 4, marginBottom: 10 }}>
        <TouchableOpacity onPress={() => setTab("teachers")} style={{ flex:1, backgroundColor: tab==="teachers"?"#fff":"transparent", borderRadius:8, paddingVertical:8, alignItems:"center" }}>
          <Text style={{ fontWeight: "700", color: "#111827" }}>Teachers</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setTab("students")} style={{ flex:1, backgroundColor: tab==="students"?"#fff":"transparent", borderRadius:8, paddingVertical:8, alignItems:"center" }}>
          <Text style={{ fontWeight: "700", color: "#111827" }}>Students</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        value={qText}
        onChangeText={setQText}
        placeholder={`Search ${tab} by name, email, or course…`}
        style={{ borderWidth:1, borderColor:"#e5e7eb", borderRadius:10, paddingHorizontal:12, paddingVertical:10, marginBottom:12, backgroundColor:"#fafafa" }}
      />

      {loading ? (
        <View style={{ alignItems: "center", marginTop: 20 }}>
          <ActivityIndicator />
          <Text style={{ color: "#6b7280", marginTop: 8 }}>Loading…</Text>
        </View>
      ) : tab === "teachers" ? (
        viewTeachers.length === 0 ? (
          <Text style={{ color: "#6b7280" }}>No teachers found.</Text>
        ) : (
          <FlatList
            data={viewTeachers}
            keyExtractor={(it) => it.id}
            renderItem={TeacherItem}
            contentContainerStyle={{ paddingBottom: 24 }}
          />
        )
      ) : viewStudents.length === 0 ? (
        <Text style={{ color: "#6b7280" }}>No students found.</Text>
      ) : (
        <FlatList
          data={viewStudents}
          keyExtractor={(it) => it.id}
          renderItem={StudentItem}
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      )}
    </View>
  );
}
