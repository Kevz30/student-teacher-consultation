// app/teacher-archive/index.js
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import auth from "../../constants/auth";
import db from "../../constants/firestore";
import { generatePrefilledPDF } from "../../utils/generatePrefilledPdf";

/* ---------- Small helpers ---------- */
const Row = ({ label, value }) => (
  <View style={{ marginBottom: 8 }}>
    <Text style={{ fontSize: 12, color: "#6b7280" }}>{label}</Text>
    <Text style={{ fontSize: 14, fontWeight: "600" }}>{value || "-"}</Text>
  </View>
);

// Generic pill that supports green (good) or grey (muted)
const Pill = ({ label, good = false }) => (
  <View
    style={{
      alignSelf: "flex-start",
      marginTop: 8,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
      backgroundColor: good ? "#e6f7f2" : "#f3f4f6",
      borderColor: good ? "#34d399" : "#e5e7eb",
    }}
  >
    <Text
      style={{
        fontSize: 12,
        fontWeight: "600",
        color: good ? "#047857" : "#374151",
      }}
    >
      {label}
    </Text>
  </View>
);

const safeFile = (s) =>
  String(s || "")
    .replace(/[^\p{L}\p{N}_-]+/gu, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

/** Formatters */
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

const formatDate = (msOrIso) => {
  // Accepts number (ms) or ISO string like "2025-09-17"
  try {
    if (!msOrIso) return "-";
    let d;
    if (typeof msOrIso === "number") d = new Date(msOrIso);
    else d = new Date(msOrIso);
    if (isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return "-";
  }
};

/* ---------- Save to Downloads (Android) or share (iOS) ---------- */
const { StorageAccessFramework } = FileSystem;

const savePdfToDownloads = async (pdfPath, filename) => {
  const base64 = await FileSystem.readAsStringAsync(pdfPath, {
    encoding: FileSystem.EncodingType.Base64,
  });

  if (Platform.OS === "android") {
    try {
      const direct = await StorageAccessFramework.requestDirectoryPermissionsAsync(
        "content://com.android.externalstorage.documents/document/primary:Download"
      );

      let dirUri;
      if (direct.granted) {
        dirUri = direct.directoryUri;
      } else {
        const any = await StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!any.granted) throw new Error("Folder access was not granted.");
        dirUri = any.directoryUri;
      }

      const fileUri = await StorageAccessFramework.createFileAsync(
        dirUri,
        filename,
        "application/pdf"
      );

      await StorageAccessFramework.writeAsStringAsync(fileUri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const inDownloads = String(dirUri).includes("primary:Download");
      return {
        uri: fileUri,
        message: inDownloads
          ? "Saved to Downloads."
          : "Saved to the selected folder.",
      };
    } catch (err) {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(pdfPath, { mimeType: "application/pdf" });
        return { shared: true, message: "Shared using system dialog." };
      }
      throw err;
    }
  }

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(pdfPath, {
      mimeType: "application/pdf",
      UTI: "com.adobe.pdf",
    });
    return { shared: true, message: "Choose a location in Files." };
  }

  return { uri: pdfPath, message: "PDF ready." };
};

/* ---------- timestamp helpers ---------- */
const tsOf = (v) => {
  try {
    if (!v) return 0;
    if (typeof v.toMillis === "function") return v.toMillis();
    if (typeof v.toDate === "function") return v.toDate().getTime();
    if (typeof v === "number") return v;
    if (typeof v === "string") return Date.parse(v) || 0;
  } catch {}
  return 0;
};
const itemTime = (c) =>
  tsOf(c.updatedAt) ||
  tsOf(c.submittedAt) ||
  tsOf(c.signedAt) ||
  tsOf(c.unitHeadSignedAt) ||
  tsOf(c.createdAt);

// NEW: canonical "occurrence" timestamp for the actual scheduled meeting
const occurrTs = (c) => {
  if (typeof c?.startAtMs === "number" && c.startAtMs > 0) return c.startAtMs;
  if (c?.dateISO) {
    const t = Date.parse(c.dateISO);
    if (!Number.isNaN(t)) return t;
  }
  // fallback to previous ordering timestamps
  return itemTime(c);
};

export default function TeacherArchiveScreen() {
  const [uid, setUid] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [selected, setSelected] = useState(null);

  // Wait for Firebase Auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid || null);
      setAuthReady(true);
    });
    return unsub;
  }, []);

  // Subscribe once we have a UID
  useEffect(() => {
    if (!authReady) return;
    if (!uid) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(collection(db, "consultations"), where("teacherId", "==", uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setItems(arr); // we'll sort client-side for robustness
        setLoading(false);
      },
      (err) => {
        console.warn("archive onSnapshot error:", err?.message || err);
        setLoading(false);
      }
    );
    return unsub;
  }, [authReady, uid]);

  // Only show consultations WITH outcome notes, then sort by actual occurrence date (newest → oldest)
  const withOutcomeSorted = useMemo(() => {
    const filtered = items.filter(
      (c) => c?.studentOutcome?.notes && String(c.studentOutcome.notes).trim().length > 0
    );
    return filtered.sort((a, b) => occurrTs(b) - occurrTs(a));
  }, [items]);

  const openRow = (c) => {
    setSelected(c);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelected(null);
  };

  /** Generate + save PDF, includes Unit Head signature/date if present */
  const downloadPdfFor = async (c) => {
    try {
      const snap = await getDoc(doc(db, "consultations", c.id));
      if (!snap.exists()) throw new Error("Consultation not found.");
      const d = snap.data();

      const student = {
        fullName: d?.form?.nameClient || "",
        studentNumber: d?.form?.studentNumber || "",
        course: d?.form?.program || "",
      };
      const teacher = { fullName: d?.form?.consultantName || "" };
      const slot = { day: d?.form?.date || d?.day, time: d?.form?.time || d?.time };

      const extra = {
        office: d?.form?.office,
        date: d?.form?.date || d?.day,
        duration: d?.form?.duration || "30 minutes",
        yearSection: d?.form?.yearSection,
        contactNumber: d?.form?.contactNumber,
        methods: d?.form?.methods || {},
        inquiry: d?.form?.inquiry || {},
        outcomeNotes: d?.studentOutcome?.notes || "",
      };

      const options = {
        teacherSignature: d?.teacherSignature
          ? { base64: d.teacherSignature.base64, mime: d.teacherSignature.mime || "image/png" }
          : null,
        dateSigned: d?.signedAt?.toDate
          ? d.signedAt.toDate().toLocaleDateString()
          : new Date().toLocaleDateString(),

        unitHeadSignature: d?.unitHeadSignature
          ? { base64: d.unitHeadSignature.base64, mime: d.unitHeadSignature.mime || "image/png" }
          : null,
        dateSignedUnitHead: d?.unitHeadSignedAt?.toDate
          ? d.unitHeadSignedAt.toDate().toLocaleDateString()
          : d?.unitHeadDateSigned || null,

        outcomeBox: {
          pageIndex: 0,
          x: 80,
          y: 340,
          width: 480,
          height: 55,
          lineHeight: 10,
        },
        unitHeadSigBox: {
          pageIndex: 0,
          x: 12,
          y: 110,
          width: 300,
          height: 80,
        },
      };

      const filename = `${safeFile(
        d?.form?.nameClient || d.studentId || "student"
      )}_${safeFile(slot.day)}_${safeFile(slot.time)}.pdf`;

      const pdfPath = await generatePrefilledPDF(
        student,
        teacher,
        slot,
        extra,
        filename,
        options
      );

      const result = await savePdfToDownloads(pdfPath, filename);
      Alert.alert("PDF", result.message);
    } catch (e) {
      Alert.alert("PDF generation failed", String(e?.message || e));
    }
  };

  const renderItem = ({ item: c }) => {
    const day = c?.form?.date || c?.day;
    const time = c?.form?.time || c?.time;
    const student = c?.form?.nameClient || c?.studentName || "Student";

    const uhSigned = !!(c?.unitHeadSignature || c?.unitHeadSignedAt || c?.unitHeadDateSigned);

    // NEW: show the actual consultation date (from dateISO or startAtMs)
    const occurDateLabel = c?.dateISO ? formatDate(c.dateISO) : formatDate(c?.startAtMs);

    return (
      <TouchableOpacity
        onPress={() => openRow(c)}
        activeOpacity={0.8}
        style={{
          borderWidth: 1,
          borderColor: "#e5e7eb",
          backgroundColor: "white",
          borderRadius: 12,
          padding: 14,
          marginBottom: 12,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
          <Text style={{ fontSize: 16, fontWeight: "700" }}>{student}</Text>
          <Text style={{ color: "#6b7280" }}>
            {String(c?.status || "").replace(/_/g, " ")}
          </Text>
        </View>

        {/* NEW: Consultation occurrence date */}
        <Text style={{ fontSize: 12, color: "#374151", marginBottom: 4 }}>
          Consultation Date: {occurDateLabel}
        </Text>

        <View style={{ flexDirection: "row", gap: 16 }}>
          <Row label="Date (form)" value={day} />
          <Row label="Time" value={time} />
        </View>

        {/* Pills row */}
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <Pill label="Outcome added" good />
          <Pill label={uhSigned ? "Unit head signed" : "Unit head pending"} good={uhSigned} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View
      style={{
        flex: 1,
        padding: 16,
        paddingTop: Platform.OS === "android" ? 30 : 16,
        backgroundColor: "#f8fafc",
      }}
    >
      <Text style={{ fontSize: 22, fontWeight: "800", marginBottom: 6 }}>Archive</Text>
      <Text style={{ color: "#6b7280", marginBottom: 12 }}>
        {withOutcomeSorted.length} consultations with outcome
      </Text>

      {loading ? (
        <View style={{ marginTop: 20, alignItems: "center" }}>
          <ActivityIndicator />
          <Text style={{ marginTop: 8, color: "#6b7280" }}>Loading…</Text>
        </View>
      ) : authReady && !uid ? (
        <Text style={{ color: "#6b7280" }}>You are not signed in.</Text>
      ) : withOutcomeSorted.length === 0 ? (
        <Text>No consultations with outcome yet.</Text>
      ) : (
        <FlatList
          data={withOutcomeSorted}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      )}

      {/* Details + Download modal */}
      <Modal visible={showModal} transparent animationType="fade" onRequestClose={closeModal}>
        <View style={{ flex: 1, backgroundColor: "#0006", justifyContent: "center", padding: 16 }}>
          <View style={{ backgroundColor: "white", borderRadius: 12, maxHeight: "85%", padding: 16 }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <Text style={{ fontSize: 18, fontWeight: "800" }}>Consultation Details</Text>
              <TouchableOpacity onPress={closeModal}>
                <Text style={{ color: "#2563eb", fontWeight: "700" }}>Close</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Row label="Student" value={selected?.form?.nameClient || selected?.studentName} />
              <Row label="Student No." value={selected?.form?.studentNumber || selected?.studentId} />
              <Row label="Program" value={selected?.form?.program} />
              <Row label="Year & Section" value={selected?.form?.yearSection} />
              <Row label="Contact No." value={selected?.form?.contactNumber} />
              <Row label="Consultant" value={selected?.form?.consultantName} />

              {/* NEW: Occurrence date */}
              <Row
                label="Consultation Date"
                value={selected?.dateISO ? formatDate(selected.dateISO) : formatDate(selected?.startAtMs)}
              />

              <Row label="Date (form)" value={selected?.form?.date || selected?.day} />
              <Row label="Time" value={selected?.form?.time || selected?.time} />
              <Row label="Duration" value={selected?.form?.duration} />
              <Row label="Method" value={formatMethods(selected?.form?.methods)} />
              <Row label="Nature of Consultation" value={formatInquiry(selected?.form?.inquiry)} />
              <Row label="Outcome Notes" value={selected?.studentOutcome?.notes} />
              <Row
                label="Unit Head"
                value={
                  selected?.unitHeadSignature || selected?.unitHeadSignedAt || selected?.unitHeadDateSigned
                    ? "Signed"
                    : "Pending"
                }
              />
            </ScrollView>

            <TouchableOpacity
              onPress={() => downloadPdfFor(selected)}
              style={{
                marginTop: 12,
                paddingVertical: 12,
                borderRadius: 8,
                alignItems: "center",
                backgroundColor: "#2563eb",
              }}
            >
              <Text style={{ color: "white", fontWeight: "800" }}>Download PDF</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
