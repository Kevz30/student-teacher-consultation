// components/StudentOutcomeModal.js
import { addDoc, collection, doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
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
import { generatePrefilledPDF } from "../app/utils/generatePrefilledPdf";
import db from "../constants/firestore";

export default function StudentOutcomeModal({ visible, consultationId, onClose }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [consult, setConsult] = useState(null);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!visible || !consultationId) return;
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, "consultations", consultationId));
        if (!mounted) return;
        if (!snap.exists()) {
          Alert.alert("Not found", "Consultation document no longer exists.");
          onClose?.();
          return;
        }
        const data = { id: snap.id, ...snap.data() };
        setConsult(data);

        // if student already uploaded notes, pre-fill (allows edits/re-uploads if you want later)
        setNotes(data.outcomeNotes || "");
      } catch (e) {
        Alert.alert("Error", String(e?.message || e));
        onClose?.();
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
      setConsult(null);
      setNotes("");
    };
  }, [visible, consultationId]);

  const submit = async () => {
    if (!consult) return;
    const trimmed = (notes || "").trim();
    if (!trimmed) {
      Alert.alert("Add notes", "Please enter your outcome notes first.");
      return;
    }

    setSaving(true);
    try {
      // 1) Rebuild a PDF with the student’s outcome notes.
      //    generatePrefilledPDF already used in teacher flow; we pass the same data plus outcomeNotes.
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
          // 🔹 NEW: we send the student outcome to the PDF template.
          // If your template uses a different field name, you can rename this.
          outcomeNotes: trimmed,
        },
        `outcome_${c.studentId || "student"}_${c.teacherId || "teacher"}_${c.form?.date || c.day}_${c.form?.time || c.time}.pdf`,
        {
          // keep teacher signature/date if already present (the util will ignore if not provided)
          teacherSignature: c.teacherSignature ? { base64: c.teacherSignature.base64, mime: "image/png" } : undefined,
          dateSigned: c.signedAt ? new Date(c.signedAt.toDate?.() || c.signedAt).toLocaleDateString() : undefined,
        }
      );;

      // 3) Save metadata on the consultation
      await updateDoc(doc(db, "consultations", consultationId), {
        outcomeNotes: trimmed,
        outcomePdfUrl: secureUrl,
        outcomePdfPublicId: publicId,
        outcomeUploadedAt: serverTimestamp(),
      });

      // 4) Notify the teacher
      if (c.teacherId) {
        await addDoc(collection(db, "notifications"), {
          userId: c.teacherId,
          type: "consultation_outcome_uploaded",
          title: "Outcome notes uploaded",
          message: `Student uploaded outcome notes for ${c.form?.date || c.day} at ${c.form?.time || c.time}.`,
          consultationId,
          createdAt: serverTimestamp(),
          createdAtMs: Date.now(),
          read: false,
        });
      }

      Alert.alert("Uploaded", "Your outcome notes were saved and sent to your teacher.");
      onClose?.({ refreshed: true });
    } catch (e) {
      console.error(e);
      Alert.alert(
        "Upload failed",
        "We saved your notes to the database, but PDF upload failed. You can try again later."
      );
      // Save the text anyway so it isn't lost.
      try {
        await updateDoc(doc(db, "consultations", consultationId), {
          outcomeNotes: notes,
          outcomeUploadedAt: serverTimestamp(),
        });
      } catch {}
      onClose?.({ refreshed: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={!!visible} transparent animationType="fade" onRequestClose={() => onClose?.()}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 16 }}>
        <View style={{ backgroundColor: "white", borderRadius: 12, maxHeight: "80%", padding: 16 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontSize: 16, fontWeight: "800" }}>Outcome notes</Text>
            <TouchableOpacity onPress={() => onClose?.()}>
              <Text style={{ color: "#2563eb", fontWeight: "600" }}>Close</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={{ alignItems: "center", paddingVertical: 18 }}>
              <ActivityIndicator />
              <Text style={{ marginTop: 8, color: "#6b7280" }}>Loading…</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ paddingVertical: 12 }}>
              <Text style={{ color: "#374151", marginBottom: 6 }}>
                Add details of what happened during the consultation. These will be embedded into the PDF under
                “Other Notes / Proceedings / Outcome”.
              </Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Type your notes here…"
                multiline
                style={{
                  minHeight: 140,
                  borderWidth: 1,
                  borderColor: "#e5e7eb",
                  borderRadius: 10,
                  padding: 12,
                  textAlignVertical: "top",
                  backgroundColor: "white",
                }}
              />

              <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                <TouchableOpacity
                  onPress={() => onClose?.()}
                  style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: "#e5e7eb", alignItems: "center" }}
                  disabled={saving}
                >
                  <Text style={{ fontWeight: "600" }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={submit}
                  style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: "#2563eb", alignItems: "center" }}
                  disabled={saving}
                >
                  <Text style={{ fontWeight: "700", color: "white" }}>{saving ? "Uploading…" : "Submit"}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}
