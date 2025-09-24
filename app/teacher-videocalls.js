// app/teacher-videocalls.js
import { MeetingConsumer, MeetingProvider } from "@videosdk.live/react-native-sdk";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { getVideoSDKToken } from "../utils/videosdkToken";

export default function TeacherVideoCall() {
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const roomId = "test-room"; // you can later make this dynamic

  useEffect(() => {
    async function fetchToken() {
      setLoading(true);
      const t = await getVideoSDKToken("teacher", roomId);
      setToken(t);
      setLoading(false);
    }
    fetchToken();
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={{ marginTop: 10 }}>Fetching VideoSDK token...</Text>
      </View>
    );
  }

  if (!token) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text>Failed to fetch token. Please try again later.</Text>
      </View>
    );
  }

  return (
    <MeetingProvider
      config={{
        meetingId: roomId,
        name: "Teacher",
        micEnabled: true,
        webcamEnabled: true,
      }}
      token={token}
    >
      <MeetingConsumer>
        {() => (
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <Text style={{ fontSize: 20, fontWeight: "bold" }}>
              Teacher in room: {roomId}
            </Text>
            <Text>You are connected with VideoSDK 🎉</Text>
          </View>
        )}
      </MeetingConsumer>
    </MeetingProvider>
  );
}
