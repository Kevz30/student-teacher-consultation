// app/student-schedule/[id].js
console.log("MOUNT → student-schedule (with debug logs)");

import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams } from "expo-router";
import * as Sharing from "expo-sharing";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
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
import auth from "../../constants/auth";
import db from "../../constants/firestore";
import { generatePrefilledPDF } from "../../utils/generatePrefilledPdf";
import uploadIdPhoto from "../../utils/uploadIdPhoto"; // ← NEW

/** ==== SWITCH: grey out past days/times ==== */
const GREY_PAST_DAYS_ENABLED = true;
/** ========================================================================== */

const WEEK = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

/* NEW: greying is active only Mon–Fri (Sat/Sun show default grid) */
const isGreyingActiveToday = () => {
  const d = new Date().getDay(); // 0=Sun ... 6=Sat
  return d >= 1 && d <= 5;
};

const isPastDayThisWeek = (dayName) => {
  if (!isGreyingActiveToday()) return false; // weekend → no greying
  const idx = WEEK.indexOf(dayName);
  if (idx === -1) return false;
  const todayIdx = new Date().getDay();
  return idx < todayIdx; // strictly before today
};
const isToday = (dayName) => WEEK.indexOf(dayName) === new Date().getDay();

/* --- parse slot start time (supports "11:00 AM - 11:30 AM" or "3:30-4:00") --- */
/* IMPORTANT: your labels have no AM/PM. We assume school hours ~7:00–17:00.
   If no AM/PM is present, hours < 7 are treated as PM (add 12). */
const getStartMinutes = (label = "") => {
  const s = String(label).toLowerCase().replace(/–/g, "-");
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (!m) return 0;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const hasMeridiem = /(am|pm)/.test(s);
  const isPM = /pm/.test(s);
  const isAM = /am/.test(s);

  if (hasMeridiem) {
    if (isPM && h < 12) h += 12;
    if (isAM && h === 12) h = 0;
  } else {
    // heuristic for schedules like 7:00-5:00 (no AM/PM shown)
    if (h < 7) h += 12; // 1–5 → 13–17
  }
  return h * 60 + min;
};
const hasTimePassedToday = (timeLabel) => {
  if (!isGreyingActiveToday()) return false; // weekend → no greying
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return getStartMinutes(timeLabel) < nowMin;
};

export default function StudentScheduleScreen() {
  const { id: teacherIdParam } = useLocalSearchParams();
  const teacherId = Array.isArray(teacherIdParam) ? teacherIdParam[0] : teacherIdParam;

  const [grid, setGrid] = useState(null);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [slot, setSlot] = useState({ day: "", time: "" });

  // ID requirement + picker
  const [requireIdPhoto, setRequireIdPhoto] = useState(false);
  const [idPhoto, setIdPhoto] = useState(null); // { uri }
  const [uploading, setUploading] = useState(false);

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
    methods: { video: false, email: false, social: false, text: false, others: false, othersText: "" },
    inquiry: { classAdvising: false, studentOrg: false, courseConcerns: false, thesis: false, dissertation: false, others: false, othersText: "" },
  });

  const fetchSchedule = async () => {
    console.log("[SCHEDULE] fetchSchedule for teacher:", teacherId);
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, "schedules", teacherId));
      const data = snap.exists() ? snap.data().grid : null;
      console.log("[SCHEDULE] initial grid loaded:", !!data);
      setGrid(data);
    } catch (err) {
      console.error("[SCHEDULE] fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!teacherId) return;
    fetchSchedule();
    const unsub = onSnapshot(
      doc(db, "schedules", teacherId),
      (snap) => {
        const data = snap.exists() ? snap.data().grid || null : null;
        console.log("[SCHEDULE] onSnapshot update. hasGrid:", !!data);
        setGrid(data);
        setLoading(false);
      },
      (err) => {
        console.error("[SCHEDULE] onSnapshot error:", err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [teacherId]);

  const Check = ({ label, value, onToggle }) => (
    <TouchableOpacity onPress={onToggle} style={{ flexDirection: "row", alignItems: "center", marginVertical: 6 }}>
      <View style={{ width: 18, height: 18, borderWidth: 1, borderColor: "#374151", marginRight: 8, alignItems: "center", justifyContent: "center", backgroundColor: value ? "#2563eb" : "white" }}>
        {value ? <Text style={{ color: "white", fontSize: 12 }}>✓</Text> : null}
      </View>
      <Text>{label}</Text>
    </TouchableOpacity>
  );

  const handleRequestBlock = async (day, time) => {
    const currentUser = auth.currentUser;
    console.log("[BOOK] request block:", { day, time, uid: currentUser?.uid });
    if (!currentUser?.uid) return Alert.alert("Sign in required", "Please log in first.");

    if (GREY_PAST_DAYS_ENABLED && isGreyingActiveToday()) {
      if (isPastDayThisWeek(day)) {
        console.log("[BOOK] blocked: past day");
        return Alert.alert("Past day", "You can only request current or future days.");
      }
      if (isToday(day) && hasTimePassedToday(time)) {
        console.log("[BOOK] blocked: past time today");
        return Alert.alert("Past time", "You can only request upcoming time slots today.");
      }
    }

    if (grid?.[day]?.[time] !== "white") {
      console.log("[BOOK] blocked: slot not white. value:", grid?.[day]?.[time]);
      return Alert.alert("Unavailable", "Pick an available (white) slot.");
    }

    try {
      const [studentSnap, teacherSnap] = await Promise.all([
        getDoc(doc(db, "students", currentUser.uid)),
        getDoc(doc(db, "instructors", teacherId)),
      ]);
      const s = studentSnap.data() || {};
      const t = teacherSnap.data() || {};
      console.log("[BOOK] student doc exists:", studentSnap.exists());
      console.log("[BOOK] instructor doc exists:", teacherSnap.exists());

      // is this student matched with the teacher?
      const matched = Array.isArray(s.matchedClasses)
        ? s.matchedClasses.some((c) => c?.teacherId === teacherId)
        : false;
      console.log("[BOOK] matchedWithTeacher? ->", matched);
      setRequireIdPhoto(!matched);
      setIdPhoto(null);

      const officeFromInstructor = t?.college ?? t?.College ?? t?.office ?? t?.department ?? "";

      setSlot({ day, time });
      setForm((prev) => ({
        ...prev,
        nameClient: s.fullName || s.displayName || "",
        studentNumber: s.studentNumber || "",
        program: s.course || "",
        office: String(officeFromInstructor),
        consultantName: t.displayName || t.fullName || "",
        date: day,
        time,
        duration: "30 minutes",
        contactNumber: "",
        yearSection: "",
        methods: { video: false, email: false, social: false, text: false, others: false, othersText: "" },
        inquiry: { classAdvising: false, studentOrg: false, courseConcerns: false, thesis: false, dissertation: false, others: false, othersText: "" },
      }));
      setShowForm(true);
    } catch (err) {
      console.error("[BOOK] prefill error:", err);
      Alert.alert("Error", "Could not prepare the consultation form.");
    }
  };

  const pickIdPhoto = async () => {
    console.log("[ID] pickIdPhoto start");
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    console.log("[ID] media permission:", status);
    if (status !== "granted") {
      return Alert.alert("Permission needed", "Please allow photo library access.");
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });
    console.log("[ID] picker result:", { canceled: res.canceled, assets: res.assets?.length });
    if (!res.canceled && res.assets?.[0]?.uri) {
      console.log("[ID] selected uri:", res.assets[0].uri);
      setIdPhoto({ uri: res.assets[0].uri });
    }
  };

  // Replaces Firebase Storage upload: uploads to Cloudinary instead
  const uploadIdIfNeeded = async () => {
    if (!requireIdPhoto) {
      console.log("[UPLOAD] not required → skip");
      return null;
    }
    if (!idPhoto?.uri) {
      console.log("[UPLOAD] required but no photo selected");
      return null;
    }
    try {
      setUploading(true);
      const url = await uploadIdPhoto(idPhoto.uri);
      console.log("[UPLOAD] success URL:", url);
      return url;
    } catch (err) {
      console.error("[UPLOAD] FAILED:", err);
      throw err;
    } finally {
      setUploading(false);
    }
  };

  const submitConsultation = async () => {
    const currentUser = auth.currentUser;
    console.log("[SUBMIT] start. requireIdPhoto =", requireIdPhoto);
    if (!currentUser?.uid) {
      console.log("[SUBMIT] blocked: no user");
      return;
    }

    if (requireIdPhoto && !idPhoto?.uri) {
      console.log("[SUBMIT] blocked: ID required but not selected");
      return Alert.alert("ID photo required", "Please attach a clear photo of your student ID.");
    }

    try {
      // 1) Upload ID first (if needed)
      let idUrl = null;
      try {
        idUrl = await uploadIdIfNeeded();
      } catch (err) {
        console.error("[SUBMIT] uploadIdIfNeeded error:", err);
        Alert.alert("Upload error", String(err?.message || err));
        return;
      }

      // 2) Create the consultation
      console.log("[SUBMIT] creating consultation doc…");
      const ref = await addDoc(collection(db, "consultations"), {
        teacherId,
        studentId: currentUser.uid,
        day: form.date,
        time: form.time,
        status: "pending_teacher",
        createdAt: serverTimestamp(),
        form,
        studentIdPhotoURL: idUrl || null, // <— teacher will read this URL
      });
      console.log("[SUBMIT] doc created:", ref.id);

      // 3) Notify teacher
      try {
        console.log("[SUBMIT] notify teacher…");
        await addDoc(collection(db, "notifications"), {
          userId: teacherId,
          title: "New consultation request",
          message: `${form.nameClient || "A student"} requested ${form.date} at ${form.time}. ${idUrl ? "ID photo attached." : ""}`,
          type: "consultation_request",
          consultationId: ref.id,
          teacherId,
          studentId: currentUser.uid,
          day: form.date,
          time: form.time,
          createdAt: serverTimestamp(),
          createdAtMs: Date.now(),
          read: false,
        });
        console.log("[SUBMIT] teacher notification added");
      } catch (e) {
        console.warn("[SUBMIT] notification failed:", e?.message || e);
      }

      // 4) Paint slot yellow
      try {
        console.log("[SUBMIT] paint slot yellow:", form.date, form.time);
        const newGrid = { ...grid };
        newGrid[form.date][form.time] = "yellow";
        await setDoc(doc(db, "schedules", teacherId), { grid: newGrid }, { merge: true });
        setGrid(newGrid);
      } catch (e) {
        console.warn("[SUBMIT] paint failed:", e?.message || e);
      }

      setShowForm(false);

      // 5) PDF prompt
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
              console.log("[PDF] generating…");
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
                console.log("[PDF] sharing:", pdfPath);
                await Sharing.shareAsync(pdfPath, { mimeType: "application/pdf", dialogTitle: "Your PDF copy" });
              } else {
                console.log("[PDF] saved (no share):", pdfPath);
                Alert.alert("Saved", `Saved to: ${pdfPath}`);
              }
            } catch (err) {
              console.error("[PDF] error:", err);
              Alert.alert("Error", "Could not create the PDF copy.");
            } finally {
              Alert.alert("Submitted", "Your consultation request is now pending.");
            }
          },
        },
      ]);
    } catch (e) {
      console.error("[SUBMIT] FAILED:", e);
      Alert.alert("Error", `Could not submit the consultation request.\n\n${String(e?.message || e)}`);
    }
  };

  const displayGrid = useMemo(() => {
    if (!grid) return null;
    // NEW: Sat/Sun show default grid (no greying)
    if (!GREY_PAST_DAYS_ENABLED || !isGreyingActiveToday()) return grid;

    const clone = JSON.parse(JSON.stringify(grid));
    const todayName = WEEK[new Date().getDay()];

    Object.keys(clone || {}).forEach((day) => {
      const daySlots = clone[day] || {};

      if (isPastDayThisWeek(day)) {
        // grey out entire past days
        Object.keys(daySlots).forEach((time) => {
          if (daySlots[time] != null) daySlots[time] = "#e5e7eb";
        });
        return;
      }

      if (day === todayName) {
        // ONLY grey out passed times of TODAY
        Object.keys(daySlots).forEach((time) => {
          if (hasTimePassedToday(time)) {
            daySlots[time] = "#e5e7eb";
          }
        });
      }
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
          grid={displayGrid}
          readonly={true}
          onRequestBlock={handleRequestBlock}
          onOpenTeacherConsultModal={undefined}
        />
      )}

      {/* Student form modal */}
      <Modal visible={showForm} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <View style={{ flex: 1, backgroundColor: "#0006", justifyContent: "center", padding: 16 }}>
            <View style={{ backgroundColor: "white", borderRadius: 12, padding: 16, maxHeight: "85%" }}>
              <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 8 }}>
                Consultation details ({slot.day} • {slot.time})
              </Text>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }}>
                <Text>Name (Client)</Text>
                <TextInput value={form.nameClient} editable={false} style={{ borderWidth: 1, borderRadius: 8, padding: 8, marginBottom: 8, backgroundColor: "#f3f4f6" }} />

                <Text>Type of Client</Text>
                <TextInput value="Student" editable={false} style={{ borderWidth: 1, borderRadius: 8, padding: 8, marginBottom: 8, backgroundColor: "#f3f4f6" }} />

                <Text>Student Number</Text>
                <TextInput value={form.studentNumber} editable={false} style={{ borderWidth: 1, borderRadius: 8, padding: 8, marginBottom: 8, backgroundColor: "#f3f4f6" }} />

                <Text>Curricular Program</Text>
                <TextInput value={form.program} editable={false} style={{ borderWidth: 1, borderRadius: 8, padding: 8, marginBottom: 8, backgroundColor: "#f3f4f6" }} />

                <Text>Office</Text>
                <TextInput value={form.office} editable={false} style={{ borderWidth: 1, borderRadius: 8, padding: 8, marginBottom: 8, backgroundColor: "#f3f4f6" }} />

                <Text>Year Level & Section</Text>
                <TextInput value={form.yearSection} onChangeText={(t) => setForm((s) => ({ ...s, yearSection: t }))} placeholder="e.g., 2-BSIT-A" style={{ borderWidth: 1, borderRadius: 8, padding: 8, marginBottom: 8 }} />

                <Text>Contact Number</Text>
                <TextInput value={form.contactNumber} onChangeText={(t) => setForm((s) => ({ ...s, contactNumber: t }))} keyboardType="phone-pad" style={{ borderWidth: 1, borderRadius: 8, padding: 8, marginBottom: 8 }} />

                <Text>Name of the Consultant</Text>
                <TextInput value={form.consultantName} editable={false} style={{ borderWidth: 1, borderRadius: 8, padding: 8, marginBottom: 8, backgroundColor: "#f3f4f6" }} />

                <Text>Date of Consultation</Text>
                <TextInput value={form.date} editable={false} style={{ borderWidth: 1, borderRadius: 8, padding: 8, marginBottom: 8, backgroundColor: "#f3f4f6" }} />

                <Text>Time</Text>
                <TextInput value={form.time} editable={false} style={{ borderWidth: 1, borderRadius: 8, padding: 8, marginBottom: 8, backgroundColor: "#f3f4f6" }} />

                <Text>Duration</Text>
                <TextInput value={form.duration} editable={false} style={{ borderWidth: 1, borderRadius: 8, padding: 8, marginBottom: 8, backgroundColor: "#f3f4f6" }} />

                {/* Inquiry */}
                <Text style={{ marginTop: 6, marginBottom: 2 }}>Nature of your inquiry</Text>
                {[
                  ["Class Advising", "classAdvising"],
                  ["Student Organization Advising", "studentOrg"],
                  ["Course/Subject Concerns", "courseConcerns"],
                  ["Thesis", "thesis"],
                  ["Dissertation", "dissertation"],
                ].map(([label, key]) => (
                  <Check key={key} label={label} value={form.inquiry[key]} onToggle={() => setForm((s) => ({ ...s, inquiry: { ...s.inquiry, [key]: !s.inquiry[key] } }))} />
                ))}
                <View style={{ marginTop: 6 }}>
                  <Check label="Others" value={form.inquiry.others} onToggle={() => setForm((s) => ({ ...s, inquiry: { ...s.inquiry, others: !s.inquiry.others } }))} />
                  {form.inquiry.others && (
                    <TextInput placeholder="Please specify" value={form.inquiry.othersText} onChangeText={(t) => setForm((s) => ({ ...s, inquiry: { ...s.inquiry, othersText: t } }))} style={{ borderWidth: 1, borderRadius: 8, padding: 8, marginTop: 6 }} />
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
                  <Check key={key} label={label} value={form.methods[key]} onToggle={() => setForm((s) => ({ ...s, methods: { ...s.methods, [key]: !s.methods[key] } }))} />
                ))}
                <View style={{ marginTop: 6 }}>
                  <Check label="Others" value={form.methods.others} onToggle={() => setForm((s) => ({ ...s, methods: { ...s.methods, others: !s.methods.others } }))} />
                  {form.methods.others && (
                    <TextInput placeholder="Please specify" value={form.methods.othersText} onChangeText={(t) => setForm((s) => ({ ...s, methods: { ...s.methods, othersText: t } }))} style={{ borderWidth: 1, borderRadius: 8, padding: 8, marginTop: 6 }} />
                  )}
                </View>

                {/* ID photo requirement section */}
                {requireIdPhoto && (
                  <View style={{ marginTop: 14, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: "#fde68a", backgroundColor: "#fffbeb" }}>
                    <Text style={{ fontWeight: "700", color: "#92400e", marginBottom: 6 }}>
                      Student ID required (you are not in this teacher’s class)
                    </Text>

                    {idPhoto?.uri ? (
                      <Image source={{ uri: idPhoto.uri }} style={{ height: 160, borderRadius: 8, marginBottom: 8 }} resizeMode="cover" />
                    ) : null}

                    <TouchableOpacity onPress={pickIdPhoto} style={{ paddingVertical: 10, borderRadius: 8, backgroundColor: "#2563eb", alignItems: "center" }}>
                      <Text style={{ color: "white", fontWeight: "700" }}>
                        {idPhoto?.uri ? "Change photo" : "Attach ID photo"}
                      </Text>
                    </TouchableOpacity>
                    {uploading && <Text style={{ marginTop: 6, color: "#6b7280" }}>Uploading…</Text>}
                  </View>
                )}
              </ScrollView>

              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity onPress={() => { console.log("[UI] close modal"); setShowForm(false); }} style={{ flex: 1, padding: 12, borderRadius: 8, backgroundColor: "#e5e7eb" }}>
                  <Text style={{ textAlign: "center" }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={submitConsultation} style={{ flex: 1, padding: 12, borderRadius: 8, backgroundColor: "#2563eb" }}>
                  <Text style={{ textAlign: "center", color: "white", fontWeight: "600" }}>
                    {requireIdPhoto ? "Submit with ID" : "Submit"}
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
