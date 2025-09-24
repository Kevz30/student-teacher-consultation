// app/admin/teacher-approvals/index.js
import { useNavigation } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { useEffect, useLayoutEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import auth from "../../../constants/auth";
import db from "../../../constants/firestore";

const norm = (s = "") => String(s).trim().toLowerCase();

export default function AdminTeacherApprovals() {
  const navigation = useNavigation();

  const [pendingTeachers, setPendingTeachers] = useState([]);
  const [loading, setLoading] = useState(false);

  // UH scope
  const [isUH, setIsUH] = useState(false);
  const [uhCollege, setUhCollege] = useState(null); // preferred scope
  const [uhCourse, setUhCourse] = useState(null);   // fallback scope

  // detect role + scope (college takes priority)
  useEffect(() => {
    (async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      try {
        const snap = await getDoc(doc(db, "users", uid));
        const u = snap.exists() ? snap.data() : {};

        const roleStr = String(u.role || "").toLowerCase();
        const isUnitHead =
          roleStr === "unit_head" ||
          roleStr === "unithead" ||
          u.roles?.unitHead ||
          u.roles?.unit_head;

        setIsUH(!!isUnitHead);

        const college = u.college || u.unitScope?.college || null;
        const course =
          (college ? null : (u.unitScope?.course ||
                             u.targetCourse ||
                             u.targetCourese ||
                             u.course || null));

        setUhCollege(college || null);
        setUhCourse(course || null);
      } catch {}
    })();
  }, []);

  const loadPending = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, "instructors"), where("status", "==", "pending"))
      );
      let list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      if (isUH) {
        if (uhCollege) {
          const want = norm(uhCollege);
          list = list.filter((t) => norm(t.college || "") === want);
        } else if (uhCourse) {
          const want = norm(uhCourse);
          list = list.filter((t) => norm(t.course || "") === want);
        }
      }

      setPendingTeachers(list);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (teacher) => {
    try {
      await updateDoc(doc(db, "instructors", teacher.id), { status: "approved" });
      Alert.alert("Approved", `${teacher.fullName || "Teacher"} has been approved.`);
      loadPending();
    } catch (err) {
      Alert.alert("Error", err?.message || String(err));
    }
  };

  const handleReject = async (teacher) => {
    try {
      await updateDoc(doc(db, "instructors", teacher.id), { status: "rejected" });
      Alert.alert("Rejected", `${teacher.fullName || "Teacher"} has been rejected.`);
      loadPending();
    } catch (err) {
      Alert.alert("Error", err?.message || String(err));
    }
  };

  useLayoutEffect(() => {
    navigation.setOptions({ headerTitle: "Teacher Approvals", headerRight: undefined });
  }, [navigation]);

  useEffect(() => {
    loadPending();
  }, [isUH, uhCollege, uhCourse]);

  if (loading) return <ActivityIndicator size="large" style={{ marginTop: 50 }} />;

  const Card = ({ item }) => (
    <View
      style={{
        backgroundColor: "#fff",
        borderRadius: 16,
        padding: 14,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: "#e9edf2",
        shadowColor: "#000",
        shadowOpacity: 0.06,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: 2,
      }}
    >
      <Text style={{ fontWeight: "800", fontSize: 16 }}>
        {item.fullName || item.displayName || "(no name)"}
      </Text>
      <Text style={{ color: "#6b7280" }}>{item.email || "-"}</Text>
      <Text style={{ color: "#6b7280", marginTop: 2 }}>
        College: {item.college || "-"} • {item.course || "-"}
      </Text>

      <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
        <TouchableOpacity
          onPress={() => handleApprove(item)}
          style={{
            flex: 1,
            backgroundColor: "#e9f9ef",
            borderColor: "#bbf7d0",
            borderWidth: 1,
            paddingVertical: 10,
            borderRadius: 12,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#047857", fontWeight: "800" }}>Approve</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => handleReject(item)}
          style={{
            flex: 1,
            backgroundColor: "#fee2e2",
            borderColor: "#fecaca",
            borderWidth: 1,
            paddingVertical: 10,
            borderRadius: 12,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#b91c1c", fontWeight: "800" }}>Reject</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, padding: 16, backgroundColor: "#f7f7fb" }}>
      {pendingTeachers.length === 0 ? (
        <Text style={{ color: "#6b7280", marginTop: 6 }}>
          {isUH && (uhCollege || uhCourse)
            ? `No pending teachers for ${uhCollege || uhCourse}.`
            : "No pending teachers."}
        </Text>
      ) : (
        <FlatList
          data={pendingTeachers}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <Card item={item} />}
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      )}
    </View>
  );
}
