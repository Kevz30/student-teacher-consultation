import { useLocalSearchParams } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import ScheduleGrid from "../../components/ScheduleGrid";
import db from "../../constants/firestore";

export default function TeacherScheduleScreen() {
  const { id: teacherId } = useLocalSearchParams();
  const [grid, setGrid] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSchedule = async () => {
      const snap = await getDoc(doc(db, "schedules", teacherId));
      if (snap.exists()) setGrid(snap.data().grid);
      setLoading(false);
    };
    fetchSchedule();
  }, [teacherId]);

  if (loading) return <ActivityIndicator size="large" />;
  if (!grid) return <Text>Teacher hasn’t uploaded a schedule yet.</Text>;

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <ScheduleGrid grid={grid} readonly />
    </View>
  );
}
