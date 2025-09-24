// app/utils/videosdkToken.js
export async function getVideoSDKToken(role = "student", roomId = "test-room") {
  try {
    const response = await fetch(
      `https://videosdk-token.leviackerman694119.workers.dev/token?role=${role}&roomId=${roomId}`
    );

    if (!response.ok) {
      throw new Error("Failed to fetch VideoSDK token");
    }

    const data = await response.json();
    return data.token;
  } catch (error) {
    console.error("Error fetching VideoSDK token:", error);
    return null;
  }
}
