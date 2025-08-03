import { useRouter } from "expo-router";
import { Button, Text, View } from "react-native";

export default function PendingApprovalScreen() {
  const router = useRouter();

  return (
    <View
      style={{
        flex: 1,
        padding: 20,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#fff",
      }}
    >
      <Text style={{ fontSize: 20, fontWeight: "bold", marginBottom: 10 }}>
        Account Pending Approval
      </Text>
      <Text style={{ fontSize: 16, textAlign: "center", marginBottom: 20 }}>
        Your account is awaiting admin approval. You’ll receive an email once your account has been approved.
      </Text>

      <Button title="Back to Login" onPress={() => router.replace("/screens/LoginScreen")} />
    </View>
  );
}
