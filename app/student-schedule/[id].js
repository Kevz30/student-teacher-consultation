// app/student-schedule/[id].js
console.log("MOUNT → student-schedule");

import { useLocalSearchParams } from "expo-router";
import * as Sharing from "expo-sharing";
import { getAuth } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import ScheduleGrid from "../../components/ScheduleGrid";
import db from "../../constants/firestore";
import { generatePrefilledPDF } from "../utils/generatePrefilledPdf";


/** ==== SWITCH: set to true/false to enable/disable grey + block past days ==== */
const GREY_PAST_DAYS_ENABLED = false;
/** ========================================================================== */

const WEEK = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const isPastDayThisWeek = (dayName) => {
  const idx = WEEK.indexOf(dayName);
  if (idx === -1) return false;
  const todayIdx = new Date().getDay(); // 0=Sun ... 6=Sat
  return idx < todayIdx; // e.g. Wed(3) disables Mon(1), Tue(2)
};

export default function StudentScheduleScreen() {
  const { id: teacherIdParam } = useLocalSearchParams();
  const teacherId = Array.isArray(teacherIdParam) ? teacherIdParam[0] : teacherIdParam;

  const [grid, setGrid] = useState(null);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [slot, setSlot] = useState({ day: "", time: "" });

  const [form, setForm] = useState({
    nameClient: "",
    typeOfClient: "Student",
    studentNumber: "",
    program: "",
    office: "",
    consultantName: "",
    date: "",
    time: "",
    duration: "30 minutes",
    contactNumber: "",
    yearSection: "",
    methods: {
      video: false,
      email: false,
      social: false,
      text: false,
      others: false,
      othersText: "",
    },
    inquiry: {
      classAdvising: false,
      studentOrg: false,
      courseConcerns: false,
      thesis: false,
      dissertation: false,
      others: false,
      othersText: "",
    },
  });

  const auth = getAuth();

  const fetchSchedule = async () => {
    setLoading(true);
    const snap = await getDoc(doc(db, "schedules", teacherId));
    setGrid(snap.exists() ? snap.data().grid : null);
    setLoading(false);
  };

  useEffect(() => {
    fetchSchedule();
  }, [teacherId]);

  const Check = ({ label, value, onToggle }) => (
    <TouchableOpacity
      onPress={onToggle}
      style={{ flexDirection: "row", alignItems: "center", marginVertical: 6 }}
    >
      <View
        style={{
          width: 18,
          height: 18,
          borderWidth: 1,
          borderColor: "#374151",
          marginRight: 8,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: value ? "#2563eb" : "white",
        }}
      >
        {value ? <Text style={{ color: "white", fontSize: 12 }}>✓</Text> : null}
      </View>
      <Text>{label}</Text>
    </TouchableOpacity>
  );

  // 🔒 Guard: students can only request white slots; when switch is ON, block past days
  const handleRequestBlock = async (day, time) => {
    const currentUser = auth.currentUser;
    if (!currentUser?.uid) return Alert.alert("Sign in required", "Please log in first.");

    if (GREY_PAST_DAYS_ENABLED && isPastDayThisWeek(day)) {
      return Alert.alert("Past day", "You can only request current or future days.");
    }

    if (grid?.[day]?.[time] !== "white")
      return Alert.alert("Unavailable", "Pick an available (white) slot.");

    const [studentSnap, teacherSnap] = await Promise.all([
      getDoc(doc(db, "students", currentUser.uid)),
      getDoc(doc(db, "instructors", teacherId)),
    ]);
    const s = studentSnap.data() || {};
    const t = teacherSnap.data() || {};

    setSlot({ day, time });
    setForm((prev) => ({
      ...prev,
      nameClient: s.fullName || s.displayName || "",
      studentNumber: s.studentNumber || "",
      program: s.course || "",
      office: t.college || t.office || "",
      consultantName: t.displayName || t.fullName || "",
      date: day,
      time,
      duration: "30 minutes",
      contactNumber: "",
      yearSection: "",
      methods: {
        video: false,
        email: false,
        social: false,
        text: false,
        others: false,
        othersText: "",
      },
      inquiry: {
        classAdvising: false,
        studentOrg: false,
        courseConcerns: false,
        thesis: false,
        dissertation: false,
        others: false,
        othersText: "",
      },
    }));
    setShowForm(true);
  };

  const submitConsultation = async () => {
  const currentUser = auth.currentUser;
  if (!currentUser?.uid) return;

  try {
    // 1) Create the consultation
    const ref = await addDoc(collection(db, "consultations"), {
      teacherId,
      studentId: currentUser.uid,
      day: form.date,
      time: form.time,
      status: "pending_teacher",
      createdAt: serverTimestamp(),
      form,
    });

    // 2) 🔔 Notify the TEACHER
    try {
      await addDoc(collection(db, "notifications"), {
        userId: teacherId,                              // <-- teacher sees it
        title: "New consultation request",
        message: `${form.nameClient || "A student"} requested ${form.date} at ${form.time}. Tap to review.`,
        type: "consultation_request",
        consultationId: ref.id,                         // <-- lets the bell open the modal
        teacherId,
        studentId: currentUser.uid,
        day: form.date,
        time: form.time,
        createdAt: serverTimestamp(),
        createdAtMs: Date.now(),
        read: false,
      });
    } catch (e) {
      console.warn("[notif->teacher] failed:", e?.message || e);
    }

    // 3) Turn the slot yellow
    const newGrid = { ...grid };
    newGrid[form.date][form.time] = "yellow";
    await setDoc(doc(db, "schedules", teacherId), { grid: newGrid }, { merge: true });
    setGrid(newGrid);
    setShowForm(false);

    // 4) (existing) PDF prompt flow…
    Alert.alert("PDF copy", "Do you want a PDF copy of this form?", [
      {
        text: "No",
        style: "cancel",
        onPress: () => Alert.alert("Submitted", "Your consultation request is now pending."),
      },
      {
        text: "Yes",
        onPress: async () => {
          try {
            const [studentSnap, teacherSnap] = await Promise.all([
              getDoc(doc(db, "students", currentUser.uid)),
              getDoc(doc(db, "instructors", teacherId)),
            ]);
            const s = studentSnap.data() || {};
            const t = teacherSnap.data() || {};

            const pdfPath = await generatePrefilledPDF(
              {
                fullName: form.nameClient || s.fullName || s.displayName || "",
                studentNumber: form.studentNumber || s.studentNumber || "",
                course: form.program || s.course || "",
              },
              { fullName: form.consultantName || t.displayName || t.fullName || "" },
              { day: form.date, time: form.time },
              {
                office: form.office,
                date: form.date,
                duration: form.duration,
                yearSection: form.yearSection,
                contactNumber: form.contactNumber,
                methods: form.methods,
                inquiry: form.inquiry,
              },
              `${currentUser.uid}_${teacherId}_${form.date}_${form.time}.pdf`
            );

            const canShare = await Sharing.isAvailableAsync();
            if (canShare) {
              await Sharing.shareAsync(pdfPath, {
                mimeType: "application/pdf",
                dialogTitle: "Your PDF copy",
              });
            } else {
              Alert.alert("Saved", `Saved to: ${pdfPath}`);
            }
          } catch (err) {
            Alert.alert("Error", "Could not create the PDF copy.");
          } finally {
            Alert.alert("Submitted", "Your consultation request is now pending.");
          }
        },
      },
    ]);
  } catch (e) {
    Alert.alert("Error", "Could not submit the consultation request.");
  }
};

  // 🎨 Build a display-only grid that greys out ALL colors on past days (when switch ON)
  const displayGrid = useMemo(() => {
    if (!grid) return null;

    if (!GREY_PAST_DAYS_ENABLED) return grid; // switch OFF → show original colors

    const clone = JSON.parse(JSON.stringify(grid));
    Object.keys(clone || {}).forEach((day) => {
      if (!isPastDayThisWeek(day)) return;
      const daySlots = clone[day] || {};
      Object.keys(daySlots).forEach((time) => {
        const v = daySlots[time];
        if (v != null) daySlots[time] = "#e5e7eb"; // grey, regardless of original color
      });
    });
    return clone;
  }, [grid]);

  if (loading) return <ActivityIndicator style={{ marginTop: 50 }} />;

  return (
    <ScrollView contentContainerStyle={{ padding: 20 }}>
      <Text style={{ fontSize: 20, fontWeight: "bold", marginBottom: 8 }}>
        {grid ? "View Schedule" : "No Schedule Found"}
      </Text>

      {displayGrid && (
        <ScheduleGrid
          grid={displayGrid}          // display grid (may be greyed)
          readonly={true}             // student view only (no teacher editing)
          onRequestBlock={handleRequestBlock} // booking handler
          onOpenTeacherConsultModal={undefined}
        />
      )}

      {/* Student form modal */}
      <Modal visible={showForm} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <View style={{ flex: 1, backgroundColor: "#0006", justifyContent: "center", padding: 16 }}>
            <View style={{ backgroundColor: "white", borderRadius: 12, padding: 16, maxHeight: "85%" }}>
              <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 8 }}>
                Consultation details ({slot.day} • {slot.time})
              </Text>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }}>
                <Text>Name (Client)</Text>
                <TextInput value={form.nameClient} editable={false}
                  style={{ borderWidth: 1, borderRadius: 8, padding: 8, marginBottom: 8, backgroundColor: "#f3f4f6" }} />

                <Text>Type of Client</Text>
                <TextInput value="Student" editable={false}
                  style={{ borderWidth: 1, borderRadius: 8, padding: 8, marginBottom: 8, backgroundColor: "#f3f4f6" }} />

                <Text>Student Number</Text>
                <TextInput value={form.studentNumber} editable={false}
                  style={{ borderWidth: 1, borderRadius: 8, padding: 8, marginBottom: 8, backgroundColor: "#f3f4f6" }} />

                <Text>Curricular Program</Text>
                <TextInput value={form.program} editable={false}
                  style={{ borderWidth: 1, borderRadius: 8, padding: 8, marginBottom: 8, backgroundColor: "#f3f4f6" }} />

                <Text>Office</Text>
                <TextInput value={form.office} editable={false}
                  style={{ borderWidth: 1, borderRadius: 8, padding: 8, marginBottom: 8, backgroundColor: "#f3f4f6" }} />

                <Text>Year Level & Section</Text>
                <TextInput
                  value={form.yearSection}
                  onChangeText={(t) => setForm((s) => ({ ...s, yearSection: t }))}
                  placeholder="e.g., 2-BSIT-A"
                  style={{ borderWidth: 1, borderRadius: 8, padding: 8, marginBottom: 8 }}
                />

                <Text>Contact Number</Text>
                <TextInput
                  value={form.contactNumber}
                  onChangeText={(t) => setForm((s) => ({ ...s, contactNumber: t }))}
                  keyboardType="phone-pad"
                  style={{ borderWidth: 1, borderRadius: 8, padding: 8, marginBottom: 8 }}
                />

                <Text>Name of the Consultant</Text>
                <TextInput value={form.consultantName} editable={false}
                  style={{ borderWidth: 1, borderRadius: 8, padding: 8, marginBottom: 8, backgroundColor: "#f3f4f6" }} />

                <Text>Date of Consultation</Text>
                <TextInput value={form.date} editable={false}
                  style={{ borderWidth: 1, borderRadius: 8, padding: 8, marginBottom: 8, backgroundColor: "#f3f4f6" }} />

                <Text>Time</Text>
                <TextInput value={form.time} editable={false}
                  style={{ borderWidth: 1, borderRadius: 8, padding: 8, marginBottom: 8, backgroundColor: "#f3f4f6" }} />

                <Text>Duration</Text>
                <TextInput value={form.duration} editable={false}
                  style={{ borderWidth: 1, borderRadius: 8, padding: 8, marginBottom: 8, backgroundColor: "#f3f4f6" }} />

                {/* Inquiry */}
                <Text style={{ marginTop: 6, marginBottom: 2 }}>Nature of your inquiry</Text>
                {[
                  ["Class Advising", "classAdvising"],
                  ["Student Organization Advising", "studentOrg"],
                  ["Course/Subject Concerns", "courseConcerns"],
                  ["Thesis", "thesis"],
                  ["Dissertation", "dissertation"],
                ].map(([label, key]) => (
                  <Check
                    key={key}
                    label={label}
                    value={form.inquiry[key]}
                    onToggle={() =>
                      setForm((s) => ({ ...s, inquiry: { ...s.inquiry, [key]: !s.inquiry[key] } }))
                    }
                  />
                ))}
                <View style={{ marginTop: 6 }}>
                  <Check
                    label="Others"
                    value={form.inquiry.others}
                    onToggle={() =>
                      setForm((s) => ({ ...s, inquiry: { ...s.inquiry, others: !s.inquiry.others } }))
                    }
                  />
                  {form.inquiry.others && (
                    <TextInput
                      placeholder="Please specify"
                      value={form.inquiry.othersText}
                      onChangeText={(t) =>
                        setForm((s) => ({ ...s, inquiry: { ...s.inquiry, othersText: t } }))
                      }
                      style={{ borderWidth: 1, borderRadius: 8, padding: 8, marginTop: 6 }}
                    />
                  )}
                </View>

                {/* Methods */}
                <Text style={{ marginTop: 12, marginBottom: 2 }}>Method of Consultation</Text>
                {[
                  ["Video Conferencing", "video"],
                  ["Email", "email"],
                  ["Social Media Platform", "social"],
                  ["Text Messages", "text"],
                ].map(([label, key]) => (
                  <Check
                    key={key}
                    label={label}
                    value={form.methods[key]}
                    onToggle={() =>
                      setForm((s) => ({ ...s, methods: { ...s.methods, [key]: !s.methods[key] } }))
                    }
                  />
                ))}
                <View style={{ marginTop: 6 }}>
                  <Check
                    label="Others"
                    value={form.methods.others}
                    onToggle={() =>
                      setForm((s) => ({ ...s, methods: { ...s.methods, others: !s.methods.others } }))
                    }
                  />
                  {form.methods.others && (
                    <TextInput
                      placeholder="Please specify"
                      value={form.methods.othersText}
                      onChangeText={(t) =>
                        setForm((s) => ({ ...s, methods: { ...s.methods, othersText: t } }))
                      }
                      style={{ borderWidth: 1, borderRadius: 8, padding: 8, marginTop: 6 }}
                    />
                  )}
                </View>
              </ScrollView>

              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity
                  onPress={() => setShowForm(false)}
                  style={{ flex: 1, padding: 12, borderRadius: 8, backgroundColor: "#e5e7eb" }}
                >
                  <Text style={{ textAlign: "center" }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={submitConsultation}
                  style={{ flex: 1, padding: 12, borderRadius: 8, backgroundColor: "#2563eb" }}
                >
                  <Text style={{ textAlign: "center", color: "white", fontWeight: "600" }}>
                    Submit
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}
