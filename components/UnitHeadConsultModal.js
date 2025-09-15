// components/UnitHeadConsultModal.js
import { getAuth } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Signature from "react-native-signature-canvas";
import db from "../constants/firestore";

function Row({ label, value }) {
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={{ fontSize: 12, color: "#6b7280" }}>{label}</Text>
      <Text style={{ fontSize: 14, fontWeight: "600" }}>{String(value || "-")}</Text>
    </View>
  );
}

export default function UnitHeadConsultModal({
  visible,
  onClose,              // onClose({shouldReload?: boolean})
  consultationId,
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [consult, setConsult] = useState(null);
  const [mode, setMode] = useState("view"); // 'view' | 'sign'
  const auth = getAuth();
  const unitHeadUid = auth.currentUser?.uid || null;

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
    };
  }, [visible, consultationId]);

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

  const writeNotif = async (userId, payload) => {
    if (!userId) return;
    try {
      await addDoc(collection(db, "notifications"), {
        userId,
        createdAt: serverTimestamp(),
        createdAtMs: Date.now(),
        read: false,
        ...payload,
      });
    } catch {}
  };

  const approveAndSign = () => setMode("sign");
  const handleEmpty = () => Alert.alert("No signature", "Please sign before saving.");

  const saveSignature = async (sigPngBase64) => {
    if (!consult) return;
    if (!unitHeadUid) {
      Alert.alert("Auth", "You must be signed in as a Unit Head.");
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, "consultations", consult.id), {
        unitHeadSignature: { base64: sigPngBase64, mime: "image/png" },
        unitHeadSignedAt: serverTimestamp(),
        unitHeadId: unitHeadUid,
        statusUnitHead: "approved_by_unit_head",
      });

      await Promise.all([
        writeNotif(consult.studentId, {
          title: "Approved by Unit Head",
          message: "Your consultation was approved by the Unit Head.",
          type: "consultation_unithead_approved",
          consultationId: consult.id,
          teacherId: consult.teacherId,
        }),
        writeNotif(consult.teacherId, {
          title: "Unit Head approved",
          message: "Unit Head added signature to this consultation.",
          type: "consultation_unithead_approved",
          consultationId: consult.id,
          teacherId: consult.teacherId,
        }),
      ]);

      Alert.alert("Saved", "Unit Head signature saved.");
      onClose?.({ shouldReload: true });
    } catch (e) {
      Alert.alert("Error", String(e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={!!visible} transparent animationType="fade" onRequestClose={() => onClose?.({})}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 16 }}>
        <View style={{ width: "95%", maxHeight: "90%", backgroundColor: "white", borderRadius: 12, padding: 16 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={{ fontSize: 16, fontWeight: "bold" }}>Consultation (Unit Head)</Text>
            <TouchableOpacity onPress={() => onClose?.({})}><Text style={{ fontSize: 14, color: "#2563eb" }}>Close</Text></TouchableOpacity>
          </View>

          {loading ? (
            <View style={{ paddingVertical: 24, alignItems: "center" }}>
              <ActivityIndicator />
            </View>
          ) : mode === "sign" ? (
            <View>
              <Text style={{ marginBottom: 8 }}>Draw your signature (Unit Head) below:</Text>
              <View style={{ height: 260, borderWidth: 1, borderColor: "#ddd", borderRadius: 12, overflow: "hidden", backgroundColor: "white" }}>
                <Signature
                  onOK={saveSignature}
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
              <Text style={{ textAlign: "center", color: "#6b7280", fontSize: 12, marginTop: 8 }}>
                Unit Head signature
              </Text>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                <TouchableOpacity
                  onPress={() => setMode("view")}
                  disabled={saving}
                  style={{ flex: 1, paddingVertical: 9, backgroundColor: "#e5e7eb", borderRadius: 10, alignItems: "center" }}
                >
                  <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827" }}>Cancel</Text>
                </TouchableOpacity>
                <View style={{ flex: 1, paddingVertical: 9, backgroundColor: "#16a34a", borderRadius: 10, alignItems: "center", opacity: 0.6 }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: "white" }}>
                    Tap ✓ in the canvas
                  </Text>
                </View>
              </View>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 420 }}>
              <Row label="Student" value={consult?.form?.nameClient || consult?.studentName} />
              <Row label="Student No." value={consult?.form?.studentNumber || consult?.studentId} />
              <Row label="Program" value={consult?.form?.program} />
              <Row label="Year & Section" value={consult?.form?.yearSection} />
              <Row label="Consultant" value={consult?.form?.consultantName || consult?.teacherName} />
              <Row label="Date" value={consult?.form?.date || consult?.day} />
              <Row label="Time" value={consult?.form?.time || consult?.time} />
              <Row label="Duration" value={consult?.form?.duration} />
              <Row label="Contact No." value={consult?.form?.contactNumber} />
              <Row label="Method" value={methodText} />
              <Row label="Nature of inquiry" value={inquiryText} />
              {!!consult?.studentOutcome?.notes && (
                <Row label="Outcome (student)" value={consult.studentOutcome.notes} />
              )}

              <TouchableOpacity
                onPress={approveAndSign}
                style={{ marginTop: 12, paddingVertical: 12, backgroundColor: "#3b82f6", borderRadius: 8, alignItems: "center" }}
                disabled={saving}
              >
                <Text style={{ color: "white", fontWeight: "700" }}>Approve & Sign (Unit Head)</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}
