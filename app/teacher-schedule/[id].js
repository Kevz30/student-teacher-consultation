// app/teacher-schedule/[id].js
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import * as XLSX from "xlsx";

import Signature from "react-native-signature-canvas";

import { getAuth } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "firebase/firestore";

import ScheduleGrid from "../../components/ScheduleGrid";
import db from "../../constants/firestore";
import { createDefaultGrid } from "../utils/scheduleTemplate";

/* ---------- small helpers ---------- */
const HeaderTitle = ({ title, subtitle }) => (
  <View style={{ gap: 2 }}>
    <Text style={{ fontSize: 18, fontWeight: "800" }}>{title}</Text>
    {!!subtitle && <Text style={{ color: "#6b7280", fontSize: 12 }}>{subtitle}</Text>}
  </View>
);

const Row = ({ label, value }) => (
  <View style={{ marginBottom: 8 }}>
    <Text style={{ fontSize: 12, color: "#6b7280" }}>{label}</Text>
    <Text style={{ fontSize: 14, fontWeight: "600" }}>{value || "-"}</Text>
  </View>
);

const formatMethods = (m = {}) => {
  const items = [];
  if (m.video) items.push("Video Conferencing");
  if (m.email) items.push("Email");
  if (m.social) items.push("Social Media Platform");
  if (m.text) items.push("Text Messages");
  if (m.others) items.push(m.othersText ? `Others (${m.othersText})` : "Others");
  return items.join(", ");
};

const formatInquiry = (q = {}) => {
  const items = [];
  if (q.classAdvising) items.push("Class Advising");
  if (q.studentOrg) items.push("Student Organization Advising");
  if (q.courseConcerns) items.push("Course/Subject Concerns");
  if (q.thesis) items.push("Thesis");
  if (q.dissertation) items.push("Dissertation");
  if (q.others) items.push(q.othersText ? `Others (${q.othersText})` : "Others");
  return items.join(", ");
};

export default function TeacherScheduleScreen() {
  const { id: routeId, fromUH } = useLocalSearchParams();
  const teacherId = String(routeId || "").trim();

  const navigation = useNavigation();
  const auth = getAuth();
  const unitHeadUid = auth.currentUser?.uid || null;

  const [teacher, setTeacher] = useState(null);
  const [grid, setGrid] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showUHControls, setShowUHControls] = useState(false);

  // 🔔 consultations that need UH signature (teacher signed, UH not yet)
  const [uhNotifs, setUhNotifs] = useState([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const pendingCount = useMemo(() => uhNotifs.length, [uhNotifs]);

  // Details + sign modal
  const [showConsultModal, setShowConsultModal] = useState(false);
  const [selected, setSelected] = useState(null);
  const [signMode, setSignMode] = useState(false);
  const [savingSig, setSavingSig] = useState(false);
  const sigRef = useRef(null);

  // detect Unit Head (via param or role on /users/{uid})
  useEffect(() => {
    (async () => {
      if (fromUH === "1") {
        setShowUHControls(true);
        return;
      }
      if (!unitHeadUid) return;
      try {
        const snap = await getDoc(doc(db, "users", unitHeadUid));
        const u = snap.exists() ? snap.data() : {};
        if (u.role === "unit_head" || u.roles?.unitHead) setShowUHControls(true);
      } catch {}
    })();
  }, [fromUH, unitHeadUid]);

  // 🔔 listen to consultations for THIS teacher that need UH signature
  useEffect(() => {
    if (!teacherId) return;
    const qy = query(
      collection(db, "consultations"),
      where("teacherId", "==", String(teacherId))
    );
    const unsub = onSnapshot(
      qy,
      (snap) => {
        const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const needsUH = all.filter((c) => {
          const status = String(c.status || "").toLowerCase();
          const notDeclined =
            status !== "declined_by_teacher" &&
            status !== "declined" &&
            status !== "cancelled" &&
            status !== "canceled";

          const hasTeacherSig = !!(c.teacherSignature && c.teacherSignature.base64);
          const noUHsig = !(c.unitHeadSignature && c.unitHeadSignature.base64);

          return hasTeacherSig && noUHsig && notDeclined;
        });
        needsUH.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
        setUhNotifs(needsUH);
      },
      (err) => console.warn("[UH notif] listener error:", err?.message || err)
    );
    return unsub;
  }, [teacherId]);

  // header with bell
  useEffect(() => {
    const title = teacher
      ? teacher.displayName || teacher.fullName || "Teacher"
      : "Teacher";
    const subtitle = teacher
      ? [teacher.course && `Course: ${teacher.course}`, teacher.college && `College: ${teacher.college}`]
          .filter(Boolean)
          .join("  •  ")
      : "";

    navigation.setOptions({
      headerTitle: () => <HeaderTitle title={title} subtitle={subtitle} />,
      headerRight: () => (
        <TouchableOpacity
          onPress={() => setShowNotifs(true)}
          style={{ paddingHorizontal: 8, paddingVertical: 4 }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <View style={{ position: "relative" }}>
            <Ionicons name="notifications-outline" size={24} />
            {!!pendingCount && (
              <View
                style={{
                  position: "absolute",
                  right: -1,
                  top: -1,
                  width: 9,
                  height: 9,
                  backgroundColor: "#ef4444",
                  borderRadius: 5,
                }}
              />
            )}
          </View>
        </TouchableOpacity>
      ),
    });
  }, [navigation, teacher, pendingCount]);

  // load teacher profile
  useEffect(() => {
    if (!teacherId) return;
    (async () => {
      try {
        const tSnap = await getDoc(doc(db, "instructors", teacherId));
        if (tSnap.exists()) setTeacher({ id: tSnap.id, ...tSnap.data() });
      } catch (e) {
        Alert.alert("Error", String(e?.message || e));
      }
    })();
  }, [teacherId]);

  // subscribe to schedule
  useEffect(() => {
    if (!teacherId) return;
    setLoading(true);
    const unsub = onSnapshot(
      doc(db, "schedules", teacherId),
      (snap) => {
        setGrid(snap.exists() ? snap.data().grid : null);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [teacherId]);

  // upload/replace schedule (unit head)
  const handleUploadReplaceSchedule = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-excel",
        ],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;

      const file = result.assets[0];
      const res = await fetch(file.uri);
      const data = await res.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array", cellStyles: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      const headerRow = json[0];
      const merged = sheet["!merges"] || [];
      const newGrid = createDefaultGrid();

      merged.forEach(({ s, e }) => {
        const startRow = s.r;
        const endRow = e.r;
        const col = s.c;
        const day = headerRow[col];
        const rows = json.slice(startRow, endRow + 1);
        rows.forEach((_, i) => {
          const time = json[startRow + i][0];
          if (newGrid[day] && newGrid[day][time]) newGrid[day][time] = "red";
        });
      });

      const ref = doc(db, "schedules", teacherId);
      const snap = await getDoc(ref);
      const payload = {
        grid: newGrid,
        uploadedAt: serverTimestamp(),
        uploadedBy: unitHeadUid || null,
      };
      if (!snap.exists() || !snap.data()?.defaultGrid) payload.defaultGrid = newGrid;

      await setDoc(ref, payload, { merge: true });
      Alert.alert("Success", "Schedule uploaded.");
    } catch (err) {
      Alert.alert("Upload failed", String(err?.message || err));
    }
  };

  /* ---------- notifications modal ---------- */
  const openConsultFromNotif = (c) => {
    setShowNotifs(false);
    setSelected(c);
    setSignMode(false);
    setShowConsultModal(true);
  };

  const NotifRow = ({ c }) => {
    const student = c?.form?.nameClient || c?.studentName || "Student";
    const day = c?.form?.date || c?.day || "-";
    const time = c?.form?.time || c?.time || "-";
    return (
      <TouchableOpacity
        onPress={() => openConsultFromNotif(c)}
        style={{
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: "#f3f4f6",
        }}
      >
        <Text style={{ fontWeight: "700" }}>Needs Unit Head signature</Text>
        <Text style={{ color: "#374151", marginTop: 2 }}>
          {student} — {day} @ {time}
        </Text>
      </TouchableOpacity>
    );
  };

  /* ---------- sign flow ---------- */
  const handleSaveSignature = async (sigBase64) => {
    if (!showUHControls) {
      Alert.alert("Not allowed", "Only Unit Heads can sign.");
      return;
    }
    if (!selected?.id) return;

    setSavingSig(true);
    try {
      await updateDoc(doc(db, "consultations", selected.id), {
        unitHeadSignature: { base64: sigBase64, mime: "image/png", uid: unitHeadUid },
        unitHeadSignedAt: serverTimestamp(),
        unitHeadApproved: true,
      });

      Alert.alert("Signed", "Unit Head signature saved.");
      setShowConsultModal(false);
      setSelected(null);
      setSignMode(false);
    } catch (e) {
      Alert.alert("Error", String(e?.message || e));
    } finally {
      setSavingSig(false);
    }
  };

  const onSignatureOK = (dataUrl) => handleSaveSignature(dataUrl);
  const onSignatureEmpty = () => Alert.alert("No signature", "Please sign before saving.");

  return (
    <View
      style={{
        flex: 1,
        padding: 16,
        paddingTop: Platform.OS === "android" ? 30 : 16,
        backgroundColor: "#fff",
      }}
    >
      {showUHControls && (
        <TouchableOpacity
          onPress={handleUploadReplaceSchedule}
          style={{
            backgroundColor: "#2563eb",
            paddingVertical: 10,
            borderRadius: 8,
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <Text style={{ color: "white", fontWeight: "700" }}>
            Upload / Replace Schedule
          </Text>
        </TouchableOpacity>
      )}

      {loading ? (
        <View style={{ marginTop: 24, alignItems: "center" }}>
          <ActivityIndicator />
          <Text style={{ color: "#6b7280", marginTop: 8 }}>Loading…</Text>
        </View>
      ) : !grid ? (
        <View style={{ marginTop: 16 }}>
          <Text style={{ color: "#6b7280" }}>
            No schedule found for this teacher.
          </Text>
        </View>
      ) : (
        // vertical + horizontal scroll for the grid
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
        >
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <ScheduleGrid
              grid={grid}
              onSelectBlock={() => {}}
              onOpenTeacherConsultModal={() => {}}
            />
          </ScrollView>
        </ScrollView>
      )}

      {/* 🔔 Notifications modal */}
      <Modal
        visible={showNotifs}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNotifs(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.45)",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <View
            style={{
              backgroundColor: "white",
              borderRadius: 12,
              maxHeight: "80%",
              padding: 14,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 10,
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: "700" }}>
                Notifications
              </Text>
              <TouchableOpacity onPress={() => setShowNotifs(false)}>
                <Text style={{ color: "#2563eb", fontWeight: "600" }}>
                  Close
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView>
              {uhNotifs.length === 0 ? (
                <Text style={{ color: "#6b7280" }}>
                  No consultations pending Unit Head signature.
                </Text>
              ) : (
                uhNotifs.map((c) => <NotifRow key={c.id} c={c} />)
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 📄 Consultation details + Sign modal */}
      <Modal
        visible={showConsultModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowConsultModal(false);
          setSignMode(false);
          setSelected(null);
        }}
      >
        <View style={{ flex: 1, backgroundColor: "#0006", justifyContent: "center", padding: 16 }}>
          <View style={{ backgroundColor: "white", borderRadius: 12, maxHeight: "85%", padding: 16 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <Text style={{ fontSize: 18, fontWeight: "800" }}>
                {signMode ? "Sign as Unit Head" : "Consultation Details"}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setShowConsultModal(false);
                  setSignMode(false);
                  setSelected(null);
                }}
              >
                <Text style={{ color: "#2563eb", fontWeight: "700" }}>Close</Text>
              </TouchableOpacity>
            </View>

            {signMode ? (
              <>
                <View style={{ height: 260, borderWidth: 1, borderColor: "#ddd", borderRadius: 12, overflow: "hidden", backgroundColor: "white" }}>
                  <Signature
                    ref={sigRef}
                    onOK={onSignatureOK}
                    onEmpty={onSignatureEmpty}
                    penColor="black"
                    minStrokeWidth={1}
                    maxStrokeWidth={3}
                    descriptionText=""
                    clearText=""
                    confirmText=""
                    webStyle={`
                      .m-signature-pad{ box-shadow:none; border:0; height:100%; }
                      .m-signature-pad--foot, .m-signature-pad--footer{ display:none !important; }
                      .m-signature-pad--body{ height:100%; border:0; margin:0; }
                      canvas{ width:100% !important; height:100% !important; }
                    `}
                    autoClear={false}
                  />
                </View>
                <Text style={{ textAlign: "center", color: "#6b7280", fontSize: 12, marginTop: 8 }}>Sign here</Text>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                  <TouchableOpacity
                    onPress={() => sigRef.current?.clearSignature?.()}
                    disabled={savingSig}
                    style={{ flex: 1, paddingVertical: 9, backgroundColor: "#e5e7eb", borderRadius: 10, alignItems: "center" }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827" }}>Clear</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => sigRef.current?.readSignature?.()}
                    disabled={savingSig}
                    style={{ flex: 1, paddingVertical: 9, backgroundColor: "#16a34a", borderRadius: 10, alignItems: "center" }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: "700", color: "white" }}>
                      {savingSig ? "Saving…" : "Save"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <ScrollView showsVerticalScrollIndicator={false}>
                  <Row label="Student" value={selected?.form?.nameClient || selected?.studentName} />
                  <Row label="Student No." value={selected?.form?.studentNumber || selected?.studentId} />
                  <Row label="Program" value={selected?.form?.program} />
                  <Row label="Year & Section" value={selected?.form?.yearSection} />
                  <Row label="Contact No." value={selected?.form?.contactNumber} />
                  <Row label="Consultant" value={selected?.form?.consultantName} />
                  <Row label="Date" value={selected?.form?.date || selected?.day} />
                  <Row label="Time" value={selected?.form?.time || selected?.time} />
                  <Row label="Duration" value={selected?.form?.duration} />
                  <Row label="Method" value={formatMethods(selected?.form?.methods)} />
                  <Row label="Nature of Consultation" value={formatInquiry(selected?.form?.inquiry)} />
                  <Row label="Outcome Notes" value={selected?.studentOutcome?.notes} />
                </ScrollView>

                <TouchableOpacity
                  onPress={() => {
                    if (!showUHControls) {
                      Alert.alert("Not allowed", "Only Unit Heads can sign.");
                      return;
                    }
                    if (!selected?.teacherSignature?.base64) {
                      Alert.alert("Teacher signature missing", "The teacher must sign first.");
                      return;
                    }
                    setSignMode(true);
                  }}
                  style={{
                    marginTop: 12,
                    paddingVertical: 12,
                    borderRadius: 8,
                    alignItems: "center",
                    backgroundColor: "#2563eb",
                  }}
                >
                  <Text style={{ color: "white", fontWeight: "800" }}>Sign as Unit Head</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}
