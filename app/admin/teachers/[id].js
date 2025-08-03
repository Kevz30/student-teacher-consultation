import { useLocalSearchParams, useRouter } from "expo-router";
import { deleteDoc, doc, getDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TouchableOpacity,
} from "react-native";
import ScheduleGrid from "../../../components/ScheduleGrid"; // ✅ correct path now
import db from "../../../constants/firestore";

export default function AdminTeacherSchedule() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [grid, setGrid] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchSchedule = async () => {
    setLoading(true);
    const snap = await getDoc(doc(db, "schedules", id));
    if (snap.exists()) {
      setGrid(snap.data().grid);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSchedule();
  }, []);

  const handleDelete = () => {
    Alert.alert("Delete Schedule", "Are you sure you want to delete this schedule?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteDoc(doc(db, "schedules", id));
          setGrid(null);
          Alert.alert("Deleted", "Schedule removed.");
        },
      },
    ]);
  };

  if (loading) return <ActivityIndicator style={{ marginTop: 50 }} />;

  return (
    <ScrollView contentContainerStyle={{ padding: 20 }}>
      <Text style={{ fontSize: 20, fontWeight: "bold", marginBottom: 20 }}>
        {grid ? "View Schedule" : "No Schedule Found"}
      </Text>

      {grid ? (
        <>
          <ScheduleGrid grid={grid} /> {/* 👈 Removed onSelectBlock to disable clicks */}
          <TouchableOpacity
            onPress={handleDelete}
            style={{ marginTop: 20, backgroundColor: "#f44336", padding: 10, borderRadius: 6 }}
          >
            <Text style={{ color: "white", textAlign: "center" }}>Delete Schedule</Text>
          </TouchableOpacity>
        </>
      ) : (
        <TouchableOpacity
          onPress={fetchSchedule}
          style={{ backgroundColor: "#007bff", padding: 12, borderRadius: 6 }}
        >
          <Text style={{ color: "#fff", textAlign: "center" }}>Refresh</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}
