import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { collection, getDocs, query, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import db from "../../../constants/firestore";

export default function CollegeTeachersScreen() {
  const { college } = useLocalSearchParams();
  const navigation = useNavigation();
  const router = useRouter();
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    navigation.setOptions({ title: `Teachers in ${college}` });

    const fetch = async () => {
      const q = query(collection(db, "instructors"), where("college", "==", college));
      const snap = await getDocs(q);
      const list = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setTeachers(list);
      setLoading(false);
    };

    fetch();
  }, [college]);

  if (loading) return <ActivityIndicator size="large" style={{ marginTop: 50 }} />;

  return (
    <View style={{ padding: 20 }}>
      <Text style={{ fontSize: 20, fontWeight: "bold", marginBottom: 20 }}>
        {college} Teachers
      </Text>

      {teachers.length === 0 ? (
        <Text>No teachers found in this college.</Text>
      ) : (
        <FlatList
          data={teachers}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/teacher-schedule/[id]",
                  params: { id: item.id },
                })
              }

              style={{
                borderWidth: 1,
                borderColor: "#ccc",
                padding: 15,
                borderRadius: 8,
                marginBottom: 10,
              }}
            >
              <Text style={{ fontWeight: "bold" }}>{item.fullName}</Text>
              <Text>{item.email}</Text>
              <Text>Status: {item.status}</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}
