import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { useState } from "react";
import { Alert, Button, Image, View } from "react-native";
import auth from "../../constants/auth";
import db from "../../constants/firestore";
import parseCOR from "../../utils/corParser";
import { matchStudentToClasses } from "../../utils/matchingHelper";

export default function UploadCORScreen() {
  const [image, setImage] = useState(null);
  const uid = auth.currentUser?.uid;

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
    });

    if (!result.canceled) {
      const uri = result.assets[0].uri;
      setImage(uri);
      await processImage(uri);
    }
  };

  const processImage = async (uri) => {
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: "base64" });

      const parsed = await parseCOR(base64);
      if (!parsed || !parsed.studentNumber) {
        return Alert.alert("Error", "Student number not found in COR.");
      }

      const studentRef = doc(db, "users", uid);
      const studentSnap = await getDoc(studentRef);

      await setDoc(studentRef, {
        ...studentSnap.data(),
        studentNumber: parsed.studentNumber,
      });

      await matchStudentToClasses(uid);

      Alert.alert("Success", `Student number saved and matched to classes.`);
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Failed to process COR.");
    }
  };

  return (
    <View style={{ padding: 20 }}>
      <Button title="Upload COR Image" onPress={pickImage} />
      {image && (
        <Image
          source={{ uri: image }}
          style={{ width: "100%", height: 400, marginTop: 20 }}
        />
      )}
    </View>
  );
}
