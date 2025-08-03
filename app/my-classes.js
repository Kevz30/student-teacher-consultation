// app/my-classes.js

import { Picker } from "@react-native-picker/picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { useRouter } from "expo-router";
import { getAuth } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  FlatList,
  Image,
  Modal,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as XLSX from "xlsx";
import db from "../constants/firestore";

export default function MyClassesScreen() {
  const [subjectCode, setSubjectCode] = useState("");
  const [section, setSection] = useState("");
  const [course, setCourse] = useState("");
  const [courseOptions, setCourseOptions] = useState([]);
  const [allCodes, setAllCodes] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [classes, setClasses] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [masterlistFile, setMasterlistFile] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [allCourses, setAllCourses] = useState([]);
  const [showAllCourses, setShowAllCourses] = useState(false);

  const auth = getAuth();
  const uid = auth.currentUser?.uid;
  const router = useRouter();

  // Load teacher's college course list
  useEffect(() => {
    if (!uid) return;
    let unsub;
    (async () => {
      const userSnap = await getDoc(doc(db, "instructors", uid));
      const college = userSnap.data()?.college;

      if (college) {
        const courseSnap = await getDoc(doc(db, "courses", college));
        const list = courseSnap.data()?.list || [];
        setCourseOptions(list);
        setCourse(list[0] || "");
      }

      unsub = onSnapshot(
        query(collection(db, "TeachersClasses", uid, "classes")),
        (snap) => setClasses(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      );
    })();
    return () => unsub && unsub();
  }, [uid]);

  // Load subject codes from selected course
  useEffect(() => {
    if (!course) return;
    (async () => {
      const snap = await getDoc(doc(db, "subjects", course));
      setAllCodes(snap.data()?.codes || []);
    })();
  }, [course]);

  // Optional: load "all courses" from master
  useEffect(() => {
    if (!showAllCourses) return;
    (async () => {
      const masterSnap = await getDoc(doc(db, "allCourses", "master"));
      const list = masterSnap.data()?.courses || [];
      setAllCourses(list);
      setCourse(list[0] || "");
    })();
  }, [showAllCourses]);

  const handlePickMasterlist = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
      ],
    });
    if (!res.canceled) setMasterlistFile(res.assets[0]);
  };

  const parseExcelStudents = async (uri) => {
    const b64 = await FileSystem.readAsStringAsync(uri, { encoding: "base64" });
    const wb = XLSX.read(b64, { type: "base64" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);
    return rows.map((r) => ({
      name: r["STUDENT NAME"],
      studentNumber: r["STUDENT NUMBER"],
    }));
  };

  const handleAddClass = async () => {
    if (!subjectCode || !section || !course || !masterlistFile) {
      return Alert.alert("Missing Fields", "Fill all fields and select masterlist.");
    }
    try {
      await setDoc(
        doc(db, "TeachersClasses", uid),
        { createdAt: serverTimestamp() },
        { merge: true }
      );
      const students = await parseExcelStudents(masterlistFile.uri);
      await addDoc(
        collection(db, "TeachersClasses", uid, "classes"),
        {
          subjectCode: subjectCode.trim().toUpperCase(),
          section: section.trim().toUpperCase(),
          course,
          students,
          createdAt: serverTimestamp(),
        }
      );
      setSubjectCode("");
      setSection("");
      setMasterlistFile(null);
      setModalVisible(false);
      setSuggestions([]);
      setShowAllCourses(false);
    } catch (err) {
      Alert.alert("Error", err.message);
    }
  };

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <FlatList
        ListHeaderComponent={
          <>
            <Text style={{ fontWeight: "bold", fontSize: 18, marginBottom: 10 }}>
              My Classes
            </Text>
            <Button title="Add Class" onPress={() => setModalVisible(true)} />
            <Text style={{ marginTop: 20, fontWeight: "bold", fontSize: 16 }}>
              Class List
            </Text>
          </>
        }
        data={classes}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => router.push(`/class-details/${uid}-${item.id}`)}
            style={{ padding: 10, borderBottomWidth: 1, borderColor: "#ccc" }}
          >
            <Text>
              {item.subjectCode} {item.course} {item.section}
            </Text>
            <Text style={{ fontSize: 12, color: "#555" }}>
              {item.students?.length || 0} student(s)
            </Text>
          </TouchableOpacity>
        )}
      />

      <Modal visible={modalVisible} animationType="slide">
        <View style={{ flex: 1, padding: 20 }}>
          <Text style={{ fontWeight: "bold", fontSize: 18, marginBottom: 10 }}>
            Add Class
          </Text>

          <TextInput
            placeholder="Subject Code (e.g., CC101)"
            value={subjectCode}
            onChangeText={(text) => {
              setSubjectCode(text);
              setSuggestions(
                text
                  ? allCodes.filter((c) =>
                      c.toLowerCase().startsWith(text.toLowerCase())
                    )
                  : []
              );
            }}
            style={{ borderWidth: 1, padding: 8, marginBottom: 10 }}
          />
          {suggestions.map((s, i) => (
            <TouchableOpacity key={i} onPress={() => {
              setSubjectCode(s);
              setSuggestions([]);
            }}>
              <Text style={{ padding: 6, backgroundColor: "#eee" }}>{s}</Text>
            </TouchableOpacity>
          ))}

          <TextInput
            placeholder="Section (e.g., 1-A)"
            value={section}
            onChangeText={setSection}
            style={{ borderWidth: 1, padding: 8, marginBottom: 10 }}
          />

          <Text style={{ fontWeight: "bold", marginBottom: 4 }}>Course</Text>
          <Picker
            selectedValue={course}
            onValueChange={(val) => {
              if (val === "__OTHER__") {
                setShowAllCourses(true);
              } else {
                setCourse(val);
                setShowAllCourses(false);
              }
            }}
            style={{ borderWidth: 1, marginBottom: 10 }}
          >
            {courseOptions.map((c) => (
              <Picker.Item key={c} label={c} value={c} />
            ))}
            <Picker.Item label="Other courses…" value="__OTHER__" />
          </Picker>

          {showAllCourses && (
            <>
              <Text style={{ fontWeight: "bold", marginBottom: 4 }}>
                All Courses
              </Text>
              <Picker
                selectedValue={course}
                onValueChange={setCourse}
                style={{ borderWidth: 1, marginBottom: 10 }}
              >
                {allCourses.map((c) => (
                  <Picker.Item key={c} label={c} value={c} />
                ))}
              </Picker>
            </>
          )}

          <Button title="Pick Masterlist Excel" onPress={handlePickMasterlist} />
          {masterlistFile && (
            <Text style={{ marginVertical: 10 }}>{masterlistFile.name}</Text>
          )}

          <TouchableOpacity
            onPress={() => setShowPreview((p) => !p)}
            style={{
              backgroundColor: "#ccc",
              padding: 10,
              marginTop: 10,
              borderRadius: 6,
              alignItems: "center",
            }}
          >
            <Text>Preview Format</Text>
          </TouchableOpacity>

          {showPreview && (
            <Image
              source={require("../assets/images/masterlist_preview.png")}
              style={{
                width: "100%",
                height: 300,
                resizeMode: "contain",
                marginTop: 10,
              }}
            />
          )}

          <View style={{ flexDirection: "row", marginTop: 20 }}>
            <Button title="Cancel" onPress={() => setModalVisible(false)} />
            <View style={{ width: 20 }} />
            <Button title="Save Class" onPress={handleAddClass} />
          </View>
        </View>
      </Modal>
    </View>
  );
}
