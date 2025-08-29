// components/TeacherConsultModal.js
import * as Sharing from "expo-sharing";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Signature from "react-native-signature-canvas";
import { generatePrefilledPDF } from "../app/utils/generatePrefilledPdf";
import db from "../constants/firestore";

export default function TeacherConsultModal({
  visible,
  onClose,              // onClose({shouldReload?: boolean})
  consultationId,
  teacherId,
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [consult, setConsult] = useState(null);
  const [mode, setMode] = useState("view"); // 'view' | 'sign'
  const sigRef = useRef(null);

  // decline reason modal
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState("");

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!visible || !consultationId) return;
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, "consultations", consultationId));
        if (!mounted) return;
        if (snap.exists()) setConsult({ id: snap.id, ...snap.data() });
        else {
          Alert.alert("Not found", "Consultation document missing.");
          onClose?.({ shouldReload: true });
        }
      } catch (e) {
        Alert.alert("Error", String(e?.message || e));
        onClose?.({ shouldReload: true });
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
      setMode("view");
      setConsult(null);
      setDeclineOpen(false);
      setDeclineReason("");
    };
  }, [visible, consultationId]);

  // readable strings from boolean flags
  const methodText = useMemo(() => {
    const m = consult?.form?.methods || {};
    const items = [];
    if (m.video) items.push("Video Conferencing");
    if (m.email) items.push("Email");
    if (m.social) items.push("Social Media Platform");
    if (m.text) items.push("Text Messages");
    if (m.others) items.push(m.othersText ? `Others (${m.othersText})` : "Others");
    return items.length ? items.join(", ") : "-";
  }, [consult?.form?.methods]);

  const inquiryText = useMemo(() => {
    const q = consult?.form?.inquiry || {};
    const items = [];
    if (q.classAdvising) items.push("Class Advising");
    if (q.studentOrg) items.push("Student Organization Advising");
    if (q.courseConcerns) items.push("Course/Subject Concerns");
    if (q.thesis) items.push("Thesis");
    if (q.dissertation) items.push("Dissertation");
    if (q.others) items.push(q.othersText ? `Others (${q.othersText})` : "Others");
    return items.length ? items.join(", ") : "-";
  }, [consult?.form?.inquiry]);

  // helper to write a notification to the student's feed
  const writeNotification = async (payload) => {
    try {
      const targetUserId =
        consult?.studentId || consult?.form?.studentId || payload.userId;
      if (!targetUserId) return;
      await addDoc(collection(db, "notifications"), {
        userId: targetUserId,
        createdAt: serverTimestamp(),
        createdAtMs: Date.now(),
        read: false,
        ...payload,
      });
    } catch (err) {
      console.warn("[notif] add failed:", err?.message || err);
    }
  };

  // DECLINE — now accepts a reason, notifies student, and frees slot (white)
  const handleDecline = async (reasonText) => {
    if (!consult) return;
    setSaving(true);
    try {
      const reason = String(reasonText || "").trim();

      await updateDoc(doc(db, "consultations", consult.id), {
        status: "declined_by_teacher",
        declinedAt: serverTimestamp(),
        declinedReason: reason || null,
        teacherSignature: null,
      });

      // free slot (white) regardless of how modal was opened
      if (teacherId && (consult.day || consult.form?.date) && (consult.time || consult.form?.time)) {
        const day = consult.day || consult.form?.date;
        const time = consult.time || consult.form?.time;
        const schedRef = doc(db, "schedules", teacherId);
        const schedSnap = await getDoc(schedRef);
        const grid = schedSnap.exists() ? (schedSnap.data().grid || {}) : {};
        grid[day] = { ...(grid[day] || {}) };
        grid[day][time] = "white";
        await setDoc(schedRef, { grid }, { merge: true });
      }

      // notify student with reason
      await writeNotification({
        title: "Consultation declined",
        message:
          `Your request for ${consult.form?.date || consult.day} at ` +
          `${consult.form?.time || consult.time} was declined.` +
          (reason ? ` Reason: ${reason}` : ""),
        type: "consultation_declined",
        consultationId: consult.id,
        teacherId: teacherId || consult.teacherId,
        reason: reason || null,
      });

      Alert.alert("Declined", "The request has been declined.");
      onClose?.({ shouldReload: true });
    } catch (e) {
      Alert.alert("Error", String(e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  const handleAccept = () => setMode("sign");

  const handleOK = async (sigPngBase64) => {
    if (!consult) return;
    setSaving(true);
    try {
      // save status + signature
      await updateDoc(doc(db, "consultations", consult.id), {
        status: "signed_by_teacher",
        signedAt: serverTimestamp(),
        teacherSignature: { base64: sigPngBase64, mime: "image/png", ts: serverTimestamp() },
      });

      // notify the student
      await writeNotification({
        title: "Consultation accepted",
        message: `Your request for ${consult.form?.date || consult.day} at ${consult.form?.time || consult.time} with ${consult.form?.consultantName || ""} was accepted.`,
        type: "consultation_accepted",
        consultationId: consult.id,
        teacherId: teacherId || consult.teacherId,
      });

      // build + offer PDF
      const c = consult;
      const pdfPath = await generatePrefilledPDF(
        {
          fullName: c.form?.nameClient || "",
          studentNumber: c.form?.studentNumber || "",
          course: c.form?.program || "",
        },
        { fullName: c.form?.consultantName || "" },
        { day: c.form?.date || c.day, time: c.form?.time || c.time },
        {
          office: c.form?.office,
          date: c.form?.date || c.day,
          duration: c.form?.duration,
          yearSection: c.form?.yearSection,
          contactNumber: c.form?.contactNumber,
          methods: c.form?.methods,
          inquiry: c.form?.inquiry,
        },
        `${c.studentId || "student"}_${c.teacherId || teacherId}_${c.form?.date || c.day}_${c.form?.time || c.time}.pdf`,
        {
          teacherSignature: { base64: sigPngBase64, mime: "image/png" },
          dateSigned: new Date().toLocaleDateString(),
        }
      );

      Alert.alert("PDF copy", "Do you want a PDF copy of this signed form?", [
        { text: "No", style: "cancel" },
        {
          text: "Yes",
          onPress: async () => {
            try {
              const ok = await Sharing.isAvailableAsync();
              if (ok) {
                await Sharing.shareAsync(pdfPath, {
                  mimeType: "application/pdf",
                  dialogTitle: "Signed Consultation Form",
                });
              } else {
                Alert.alert("Saved locally", pdfPath);
              }
            } catch (e) {
              Alert.alert("Sharing error", String(e?.message || e));
            }
          },
        },
      ]);

      Alert.alert("Signed", "Signature saved and consultation approved.");
      onClose?.({ shouldReload: true });
    } catch (e) {
      Alert.alert("Error", String(e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  const handleEmpty = () => Alert.alert("No signature", "Please sign before saving.");
  const closeModal = () => onClose?.({ shouldReload: true });

  return (
    <Modal visible={!!visible} transparent animationType="fade" onRequestClose={closeModal}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 16 }}>
        <View style={{ width: "95%", maxHeight: "90%", backgroundColor: "white", borderRadius: 12, padding: 16 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={{ fontSize: 16, fontWeight: "bold" }}>Consultation Details</Text>
            <TouchableOpacity onPress={closeModal}><Text style={{ fontSize: 14, color: "#2563eb" }}>Close</Text></TouchableOpacity>
          </View>

          {loading ? (
            <View style={{ paddingVertical: 24, alignItems: "center" }}>
              <ActivityIndicator />
            </View>
          ) : mode === "sign" ? (
            <View>
              <Text style={{ marginBottom: 8 }}>Draw your signature below:</Text>
              <View style={{ height: 260, borderWidth: 1, borderColor: "#ddd", borderRadius: 12, overflow: "hidden", backgroundColor: "white" }}>
                <Signature
                  ref={sigRef}
                  onOK={handleOK}
                  onEmpty={handleEmpty}
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
                  disabled={saving}
                  style={{ flex: 1, paddingVertical: 9, backgroundColor: "#e5e7eb", borderRadius: 10, alignItems: "center" }}
                >
                  <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827" }}>Clear</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => sigRef.current?.readSignature?.()}
                  disabled={saving}
                  style={{ flex: 1, paddingVertical: 9, backgroundColor: "#16a34a", borderRadius: 10, alignItems: "center" }}
                >
                  <Text style={{ fontSize: 14, fontWeight: "700", color: "white" }}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 420 }}>
              <Row label="Student" value={consult?.form?.nameClient || consult?.studentName || "-"} />
              <Row label="Student No." value={consult?.form?.studentNumber || consult?.studentId || "-"} />
              <Row label="Program" value={consult?.form?.program || consult?.program || "-"} />
              <Row label="Year & Section" value={consult?.form?.yearSection || "-"} />
              <Row label="Consultant" value={consult?.form?.consultantName || consult?.teacherName || "-"} />
              <Row label="Date" value={consult?.form?.date || consult?.day || "-"} />
              <Row label="Time" value={consult?.form?.time || consult?.time || "-"} />
              <Row label="Duration" value={consult?.form?.duration || "-"} />
              <Row label="Contact No." value={consult?.form?.contactNumber || "-"} />
              <Row label="Method" value={methodText} />
              <Row label="Inquiry" value={inquiryText} />

              <View style={{ flexDirection: "row", marginTop: 12 }}>
                <TouchableOpacity
                  onPress={() => setDeclineOpen(true)}
                  style={{ flex: 1, paddingVertical: 12, marginRight: 8, backgroundColor: "#ef4444", borderRadius: 8, alignItems: "center" }}
                  disabled={saving}
                >
                  <Text style={{ color: "white", fontWeight: "700" }}>Decline</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleAccept}
                  style={{ flex: 1, paddingVertical: 12, backgroundColor: "#3b82f6", borderRadius: 8, alignItems: "center" }}
                  disabled={saving}
                >
                  <Text style={{ color: "white", fontWeight: "700" }}>Accept</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </View>
      </View>

      {/* Decline reason modal */}
      <Modal
        visible={declineOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDeclineOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 16 }}>
          <View style={{ backgroundColor: "white", borderRadius: 12, padding: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", marginBottom: 8 }}>Reason for decline</Text>
            <TextInput
              placeholder="Type your reason…"
              value={declineReason}
              onChangeText={setDeclineReason}
              multiline
              style={{
                minHeight: 80,
                borderWidth: 1,
                borderColor: "#e5e7eb",
                borderRadius: 8,
                padding: 10,
                textAlignVertical: "top",
              }}
            />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <TouchableOpacity
                onPress={() => setDeclineOpen(false)}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: "#e5e7eb", alignItems: "center" }}
              >
                <Text style={{ fontWeight: "600" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  const r = declineReason.trim();
                  if (!r) {
                    Alert.alert("Reason required", "Please enter a short reason for declining.");
                    return;
                  }
                  setDeclineOpen(false);
                  handleDecline(r);
                }}
                disabled={saving}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: "#ef4444", alignItems: "center" }}
              >
                <Text style={{ fontWeight: "700", color: "white" }}>Decline</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

function Row({ label, value, multiline = false }) {
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={{ fontSize: 12, color: "#6b7280" }}>{label}</Text>
      <Text style={{ fontSize: 14, fontWeight: "600" }}>
        {multiline ? String(value || "-") : String(value || "-")}
      </Text>
    </View>
  );
}
