import { Picker } from "@react-native-picker/picker";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { createUserWithEmailAndPassword } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Button,
  Image,
  Text,
  TextInput,
  View,
} from "react-native";
import auth from "../../constants/auth";
import db from "../../constants/firestore";
import parseCOR from "../utils/corParser"; // expects a base64 string
import { matchStudentToClasses } from "../utils/matchingHelper";
import uploadToCloudinary from "../utils/uploadToCloudinary";

export default function StudentRegistrationScreen() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // department/course pickers
  const [departments, setDepartments] = useState([]);
  const [department, setDepartment] = useState("");
  const [courses, setCourses] = useState([]);
  const [course, setCourse] = useState("");

  // COR upload
  const [corImage, setCorImage] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, "courses"));
        setDepartments(snap.docs.map((d) => d.id));
      } catch (err) {
        console.error(err);
      }
    })();
  }, []);

  useEffect(() => {
    if (!department) {
      setCourses([]);
      setCourse("");
      return;
    }
    (async () => {
      try {
        const deptSnap = await getDoc(doc(db, "courses", department));
        const list = deptSnap.data()?.list || [];
        setCourses(list);
        setCourse(list[0] || "");
      } catch (err) {
        console.error(err);
      }
    })();
  }, [department]);

  const handlePickImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
    });
    if (!res.canceled) setCorImage(res.assets[0].uri);
  };

  const handleRegister = async () => {
    if (
      !fullName ||
      !email ||
      !password ||
      !department ||
      !course ||
      !corImage
    ) {
      return Alert.alert("Error", "Complete all fields and upload your COR.");
    }

    try {
      setLoading(true);

      // 1️⃣ Upload COR to Cloudinary
      const b64 = await FileSystem.readAsStringAsync(corImage, {
        encoding: "base64",
      });
      const corUrl = await uploadToCloudinary(b64, "student_cor_upload");

      // 2️⃣ OCR → studentNumber (remote)
      const parsed = await parseCOR(b64);
      if (!parsed?.studentNumber) {
        return Alert.alert("Error", "Student number not found on COR.");
      }

      // 3️⃣ Create Auth user
      const { user } = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      // 4️⃣ Write profile under "students"
      await setDoc(
        doc(db, "students", user.uid),
        {
          uid: user.uid,
          fullName,
          email: user.email,
          role: "student",
          status: "pending_verification",
          department,
          course,
          studentNumber: parsed.studentNumber,
          corUrl,
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      // 5️⃣ Match against instructors’ classes
      await matchStudentToClasses(user.uid);

      Alert.alert("Success", "Registration complete!");
    } catch (err) {
      console.error(err);
      Alert.alert("Error", err.message || "Registration failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Text style={{ fontSize: 18, fontWeight: "bold", marginBottom: 10 }}>
        Student Registration
      </Text>

      <TextInput
        placeholder="Full Name"
        value={fullName}
        onChangeText={setFullName}
        autoCapitalize="words"
        style={{ marginBottom: 12, borderBottomWidth: 1, padding: 8 }}
      />
      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        style={{ marginBottom: 12, borderBottomWidth: 1, padding: 8 }}
      />
      <TextInput
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        style={{ marginBottom: 12, borderBottomWidth: 1, padding: 8 }}
      />

      <Text style={{ marginBottom: 4 }}>Department:</Text>
      <Picker
        selectedValue={department}
        onValueChange={setDepartment}
        style={{ marginBottom: 12 }}
      >
        <Picker.Item label="Select Department" value="" />
        {departments.map((d) => (
          <Picker.Item key={d} label={d} value={d} />
        ))}
      </Picker>

      <Text style={{ marginBottom: 4 }}>Course:</Text>
      <Picker
        selectedValue={course}
        onValueChange={setCourse}
        enabled={courses.length > 0}
        style={{ marginBottom: 12 }}
      >
        {courses.map((c) => (
          <Picker.Item key={c} label={c} value={c} />
        ))}
      </Picker>

      <Button title="Pick COR Image" onPress={handlePickImage} />
      {corImage && (
        <Image
          source={{ uri: corImage }}
          style={{ height: 150, marginVertical: 12, borderRadius: 8 }}
        />
      )}

      {loading ? (
        <ActivityIndicator size="large" />
      ) : (
        <Button title="Register" onPress={handleRegister} />
      )}
    </View>
  );
}
