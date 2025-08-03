import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { ActivityIndicator, Button, Image, Text, View } from "react-native";

export default function OCRTestScreen() {
  const [imageUri, setImageUri] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const pickImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ quality: 1 });
    if (!res.canceled) setImageUri(res.assets[0].uri);
  };

  const sendToOCR = async () => {
    try {
      setLoading(true);
      const formData = new FormData();
      formData.append("file", {
        uri: imageUri,
        name: "test.jpg",
        type: "image/jpeg",
      });
      formData.append("apikey", "YOUR_OCRSPACE_API_KEY");

      const res = await fetch("https://api.ocr.space/parse/image", {
        method: "POST",
        headers: { "Content-Type": "multipart/form-data" },
        body: formData,
      });

      const data = await res.json();
      setResult(data.ParsedResults?.[0]?.ParsedText || "No text found.");
    } catch (err) {
      setResult("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Button title="Pick Image" onPress={pickImage} />
      {imageUri && <Image source={{ uri: imageUri }} style={{ height: 200, marginTop: 10 }} />}
      {imageUri && <Button title="Send to OCR" onPress={sendToOCR} />}
      {loading && <ActivityIndicator />}
      {result && <Text style={{ marginTop: 20 }}>{result}</Text>}
    </View>
  );
}
