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
    Image, // ⬅️ NEW
    Linking,
    Modal,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import Signature from "react-native-signature-canvas";
import db from "../constants/firestore";
import { generatePrefilledPDF } from "../utils/generatePrefilledPdf";

/* ===================== helpers ===================== */
const DAY_INDEX = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
  Thursday: 4, Friday: 5, Saturday: 6,
};

const normalize = (str = "") =>
  String(str).replace(/–/g, "-").replace(/\s+/g, "").toLowerCase();

/** Robustly parse a "HH:MM-HH:MM" range */
function parseRange(range = "") {
  const [s, e] = String(range).split("-").map((t) => t.trim());
  const [shRaw, smRaw] = (s || "").split(":");
  const [ehRaw, emRaw] = (e || "").split(":");

  const sh = Number(shRaw);
  const sm = Number(smRaw ?? 0);
  const eh = Number(ehRaw);
  const em = Number(emRaw ?? 0);

  return { sh: Number.isFinite(sh) ? sh : 0, sm: Number.isFinite(sm) ? sm : 0, eh: Number.isFinite(eh) ? eh : 0, em: Number.isFinite(em) ? em : 0 };
}

/** Convert bare 1..5 hours to PM for your daytime grid (7:00–17:00). */
function to24h(h, m) {
  let H = h;
  if (H >= 1 && H <= 5) H += 12;
  return { H, M: m || 0 };
}

/** Build start/end milliseconds using the LEFT part of the range for start */
function computeSlotMs(dayLabel, timeRange) {
  const { sh, sm, eh, em } = parseRange(timeRange);
  const s = to24h(sh, sm);
  const e = to24h(eh, em);

  const now = new Date();
  const target = new Date(now);
  const want = DAY_INDEX[dayLabel] ?? now.getDay();
  const diffDays = (want - now.getDay() + 7) % 7;
  target.setHours(0, 0, 0, 0);
  target.setDate(target.getDate() + diffDays);

  const start = new Date(target);
  start.setHours(s.H, s.M, 0, 0);

  const end = new Date(target);
  end.setHours(e.H, e.M, 0, 0);

  if (diffDays === 0 && end.getTime() <= now.getTime()) {
    start.setDate(start.getDate() + 7);
    end.setDate(end.getDate() + 7);
  }

  const yyyy = start.getFullYear();
  const mm = String(start.getMonth() + 1).padStart(2, "0");
  const dd = String(start.getDate()).padStart(2, "0");

  return { startAtMs: start.getTime(), endAtMs: end.getTime(), dateISO: `${yyyy}-${mm}-${dd}` };
}

/** Resolve actual keys in the schedule grid even if labels differ by spaces/dashes/case */
function resolveGridKeys(gridObj, dayLabel, timeLabel) {
  const grid = gridObj || {};
  const dayKeys = Object.keys(grid);
  const dayKey = dayKeys.find((k) => normalize(k) === normalize(dayLabel)) || dayLabel;

  const slots = grid[dayKey] || {};
  const slotKeys = Object.keys(slots);
  const slotKey = slotKeys.find((k) => normalize(k) === normalize(timeLabel)) || timeLabel;

  return { dayKey, slotKey };
}
/* =================================================== */

export default function TeacherConsultModal({
  visible,
  onClose, // onClose({ shouldReload?: boolean })
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

  const writeNotification = async (payload) => {
    try {
      const targetUserId = consult?.studentId || consult?.form?.studentId || payload.userId;
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

      const dayLabel = consult.day || consult.form?.date;
      const timeLabel = consult.time || consult.form?.time;

      if (teacherId && dayLabel && timeLabel) {
        const schedRef = doc(db, "schedules", teacherId);
        const schedSnap = await getDoc(schedRef);

        const existing = schedSnap.exists() ? (schedSnap.data()?.grid || {}) : {};
        const grid = { ...existing };

        const { dayKey, slotKey } = resolveGridKeys(grid, dayLabel, timeLabel);
        const currentDay = grid[dayKey] || {};
        grid[dayKey] = { ...currentDay, [slotKey]: "white" };

        await setDoc(schedRef, { grid }, { merge: true });
      }

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

      Alert.alert("Declined", "The request has been declined and the slot is now open.");
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
      const theDay = consult?.form?.date || consult?.day || "";
      const theTime = consult?.form?.time || consult?.time || "";
      const { startAtMs, endAtMs, dateISO } = computeSlotMs(theDay, theTime);

      await updateDoc(doc(db, "consultations", consult.id), {
        status: "signed_by_teacher",
        signedAt: serverTimestamp(),
        teacherSignature: { base64: sigPngBase64, mime: "image/png", ts: serverTimestamp() },
        startAtMs,
        endAtMs,
        dateISO,
        outcomeDispatched: false,
      });

      await writeNotification({
        title: "Consultation accepted",
        message: `Your request for ${consult.form?.date || consult.day} at ${consult.form?.time || consult.time} with ${consult.form?.consultantName || ""} was accepted.`,
        type: "consultation_accepted",
        consultationId: consult.id,
        teacherId: teacherId || consult.teacherId,
      });

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

  const handleGenerateFinalPdf = async () => {
    try {
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
          outcomeNotes: c.studentOutcome?.notes || "",
        },
        `${c.studentId || "student"}_${c.teacherId || teacherId}_${c.form?.date || c.day}_${c.form?.time || c.time}_final.pdf`,
        {
          teacherSignature: c.teacherSignature
            ? { base64: c.teacherSignature.base64, mime: "image/png" }
            : null,
          dateSigned: new Date().toLocaleDateString(),
        }
      );

      const ok = await Sharing.isAvailableAsync();
      if (ok) {
        await Sharing.shareAsync(pdfPath, {
          mimeType: "application/pdf",
          dialogTitle: "Final Consultation PDF",
        });
      } else {
        Alert.alert("Saved locally", pdfPath);
      }
    } catch (e) {
      Alert.alert("PDF error", String(e?.message || e));
    }
  };

  const statusStr = String(consult?.status || "").toLowerCase();
  const isSigned = statusStr === "signed_by_teacher";
  const canGenerateFinal = isSigned && !!consult?.studentOutcome?.notes;

  const studentFormReady =
    !!(consult?.studentForm?.submittedAt) ||
    !!(consult?.form?.inquiry && Object.values(consult.form.inquiry || {}).some(Boolean)) ||
    !!consult?.form?.contactNumber ||
    !!consult?.form?.duration;

  const isAwaitingStudentForm =
    statusStr === "scheduled_by_teacher" && !studentFormReady;

  return (
    <Modal visible={!!visible} transparent animationType="fade" onRequestClose={closeModal}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 16 }}>
        <View style={{ width: "95%", maxHeight: "90%", backgroundColor: "white", borderRadius: 12, padding: 16 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={{ fontSize: 16, fontWeight: "bold" }}>Consultation Details</Text>
            <TouchableOpacity onPress={closeModal}>
              <Text style={{ fontSize: 14, color: "#2563eb" }}>Close</Text>
            </TouchableOpacity>
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
            <ScrollView style={{ maxHeight: 460 }}>
              {isAwaitingStudentForm && (
                <View style={{ padding: 10, borderRadius: 10, backgroundColor: "#ecfeff", borderWidth: 1, borderColor: "#a5f3fc", marginBottom: 10 }}>
                  <Text style={{ color: "#0e7490", fontWeight: "700" }}>Awaiting student form submission</Text>
                  <Text style={{ color: "#0e7490" }}>
                    The student has been scheduled by the teacher. Once the student completes the form, this slot will proceed to the usual approval flow.
                  </Text>
                </View>
              )}

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

              {/* 🔎 NEW — Student ID photo preview (when student is not in teacher's class) */}
              {consult?.studentIdPhotoURL ? (
                <View style={{ marginTop: 12, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: "#e5e7eb" }}>
                  <Text style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>Student ID</Text>
                  <Image
                    source={{ uri: consult.studentIdPhotoURL }}
                    style={{ width: "100%", height: 180, borderRadius: 8, backgroundColor: "#f3f4f6" }}
                    resizeMode="cover"
                  />
                  <TouchableOpacity
                    onPress={() => Linking.openURL(consult.studentIdPhotoURL)}
                    style={{ marginTop: 8, paddingVertical: 10, backgroundColor: "#111827", borderRadius: 8, alignItems: "center" }}
                  >
                    <Text style={{ color: "white", fontWeight: "700" }}>Open full image</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {!!consult?.studentOutcome?.notes && (
                <View style={{ marginTop: 10, padding: 10, borderRadius: 8, backgroundColor: "#f3f4f6" }}>
                  <Text style={{ fontSize: 12, color: "#6b7280" }}>Student Outcome</Text>
                  <Text style={{ fontSize: 14, fontWeight: "600" }}>{consult.studentOutcome.notes}</Text>
                </View>
              )}

              {!isSigned && (
                <View style={{ marginTop: 12 }}>
                  <View style={{ flexDirection: "row" }}>
                    <TouchableOpacity
                      onPress={() => setDeclineOpen(true)}
                      style={{ flex: 1, paddingVertical: 12, marginRight: 8, backgroundColor: "#ef4444", borderRadius: 8, alignItems: "center" }}
                      disabled={saving}
                    >
                      <Text style={{ color: "white", fontWeight: "700" }}>Decline</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleAccept}
                      style={{
                        flex: 1,
                        paddingVertical: 12,
                        backgroundColor: isAwaitingStudentForm ? "#9ca3af" : "#3b82f6",
                        borderRadius: 8,
                        alignItems: "center",
                        opacity: saving ? 0.7 : 1,
                      }}
                      disabled={saving || isAwaitingStudentForm}
                    >
                      <Text style={{ color: "white", fontWeight: "700" }}>
                        {isAwaitingStudentForm ? "Waiting for student" : "Accept"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {canGenerateFinal && (
                <TouchableOpacity
                  onPress={handleGenerateFinalPdf}
                  style={{ marginTop: 12, paddingVertical: 12, backgroundColor: "#16a34a", borderRadius: 8, alignItems: "center" }}
                >
                  <Text style={{ color: "white", fontWeight: "800" }}>Generate PDF</Text>
                </TouchableOpacity>
              )}
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
              style={{ minHeight: 80, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 10, textAlignVertical: "top" }}
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
