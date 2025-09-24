// app/teacher-notifications/index.js
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "expo-router";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import auth from "../../constants/auth";
import db from "../../constants/firestore";

export default function TeacherNotificationsScreen() {
  const navigation = useNavigation();
  const [notifs, setNotifs] = useState([]);
  const uid = auth.currentUser?.uid;

  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, "notifications"),
      where("userId", "==", uid),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setNotifs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [uid]);

  const markAllRead = async () => {
    const unread = notifs.filter((n) => !n.read);
    await Promise.all(
      unread.map((n) =>
        updateDoc(doc(db, "notifications", n.id), {
          read: true,
          readAt: serverTimestamp(),
        })
      )
    );
  };

  const clearAll = async () => {
    if (!notifs.length) return;
    // delete each notification for this user
    await Promise.all(notifs.map((n) => deleteDoc(doc(db, "notifications", n.id))));
  };

  const openNotif = async (n) => {
    // mark clicked one as read, then go back (keeps highlight until it’s tapped)
    if (!n.read) {
      await updateDoc(doc(db, "notifications", n.id), {
        read: true,
        readAt: serverTimestamp(),
      });
    }
    navigation.goBack();
  };

  const unreadCount = notifs.reduce((c, n) => c + (!n.read ? 1 : 0), 0);

  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: "#e5e7eb",
        }}
      >
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={26} color="#111827" />
        </TouchableOpacity>

        <Text style={{ fontSize: 20, fontWeight: "700" }}>Notifications</Text>

        <View style={{ flexDirection: "row", gap: 16 }}>
          <TouchableOpacity onPress={markAllRead} disabled={!unreadCount}>
            <Text style={{ color: unreadCount ? "#2563eb" : "#9ca3af", fontWeight: "600" }}>
              Mark all read
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={clearAll} disabled={!notifs.length}>
            <Text style={{ color: notifs.length ? "#ef4444" : "#9ca3af", fontWeight: "600" }}>
              Clear
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* List */}
      <ScrollView style={{ padding: 16 }}>
        {notifs.length === 0 ? (
          <Text style={{ color: "#6b7280" }}>No notifications yet.</Text>
        ) : (
          notifs.map((n) => (
            <TouchableOpacity
              key={n.id}
              onPress={() => openNotif(n)}
              style={{
                paddingVertical: 12,
                paddingHorizontal: 10,
                borderBottomWidth: 1,
                borderBottomColor: "#f3f4f6",
                // highlight unread until tapped
                backgroundColor: n.read ? "white" : "#eef2ff",
                borderLeftWidth: n.read ? 0 : 3,
                borderLeftColor: n.read ? "transparent" : "#6366f1",
              }}
            >
              <Text style={{ fontWeight: "700", color: "#111827" }}>
                {n.title || "Notification"}
              </Text>
              {!!n.message && (
                <Text style={{ color: "#374151", marginTop: 2 }}>{n.message}</Text>
              )}
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}
