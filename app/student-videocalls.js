// app/student-videocalls.js
import { MeetingConsumer, MeetingProvider } from "@videosdk.live/react-native-sdk";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import auth from "../constants/auth";
import { getVideoSDKToken } from "../utils/videosdkToken";

export default function StudentVideoCall() {
  const displayName = auth?.currentUser?.displayName || "Student";
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const roomId = "test-room"; // later: pass the scheduled room id here

  useEffect(() => {
    (async () => {
      setLoading(true);
      const t = await getVideoSDKToken("student", roomId);
      setToken(t);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={{ marginTop: 10 }}>Joining meeting…</Text>
      </View>
    );
  }

  if (!token) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text>Couldn’t get access token. Try again.</Text>
      </View>
    );
  }

  return (
    <MeetingProvider
      config={{
        meetingId: roomId,
        name: displayName,
        micEnabled: true,
        webcamEnabled: true,
      }}
      token={token}
    >
      <MeetingConsumer>
        {() => (
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <Text style={{ fontSize: 20, fontWeight: "bold" }}>Student in room: {roomId}</Text>
            <Text>Connected via VideoSDK 🎉</Text>
          </View>
        )}
      </MeetingConsumer>
    </MeetingProvider>
  );
}
