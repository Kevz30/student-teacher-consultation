// app/student-dashboard.js

import { useRouter } from "expo-router";
import { getAuth } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { FlatList, Image, Text, TouchableOpacity, View } from "react-native";
import blankProfile from "../assets/images/blank-profile.png";
import db from "../constants/firestore";
import { matchStudentToClasses } from "./utils/matchingHelper";


export default function StudentDashboard() {
  const [matchedTeachers, setMatchedTeachers] = useState([]);
  const auth = getAuth();
  const uid = auth.currentUser?.uid;
  const router = useRouter();

  useEffect(() => {
    if (!uid) return;

    (async () => {
      // 1️⃣ Re-run matching
      await matchStudentToClasses(uid);

      // 2️⃣ Fetch updated matchedClasses from students/{uid}
      const studentSnap = await getDoc(doc(db, "students", uid));
      const matches = studentSnap.data()?.matchedClasses || [];

      // 3️⃣ Load each instructor’s profile from instructors/{teacherId}
      const teacherData = await Promise.all(
        matches.map(async (match) => {
          const instSnap = await getDoc(doc(db, "instructors", match.teacherId));
          const info = instSnap.data() || {};
          return {
            ...match,
            fullName: info.displayName || info.fullName || "Unnamed",
            photoURL: info.photoURL || null,
          };
        })
      );

      setMatchedTeachers(teacherData);
    })();
  }, [uid]);

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Text style={{ fontSize: 20, fontWeight: "bold", marginBottom: 10 }}>
        Your Matched Teachers
      </Text>

      {matchedTeachers.length === 0 ? (
        <Text>No matched teachers found.</Text>
      ) : (
        <FlatList
          data={matchedTeachers}
          keyExtractor={(_, i) => i.toString()}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => router.push(`/student-schedule/${item.teacherId}`)}
              style={{
                borderWidth: 1,
                borderRadius: 8,
                padding: 15,
                marginBottom: 10,
                backgroundColor: "#f9f9f9",
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <Image
                source={item.photoURL ? { uri: item.photoURL } : blankProfile}
                style={{ width: 50, height: 50, borderRadius: 25, marginRight: 15 }}
              />
              <View>
                <Text style={{ fontWeight: "bold" }}>{item.fullName}</Text>
                <Text>
                  {item.subjectCode} – {item.course} {item.section}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}
