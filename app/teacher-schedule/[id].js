// app/teacher-schedule/[id].js
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { useLocalSearchParams, useNavigation } from "expo-router";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Signature from "react-native-signature-canvas";
import * as XLSX from "xlsx";
import auth from "../../constants/auth";

import ScheduleGrid from "../../components/ScheduleGrid";
import db from "../../constants/firestore";
import { createDefaultGrid } from "../../utils/scheduleTemplate";

/* ---------- small helpers ---------- */
const HeaderTitle = ({ title, subtitle }) => (
  <View style={{ gap: 2 }}>
    <Text style={{ fontSize: 18, fontWeight: "800" }}>{title}</Text>
    {!!subtitle && (
      <Text style={{ color: "#6b7280", fontSize: 12 }}>{subtitle}</Text>
    )}
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
  if (m.others)
    items.push(m.othersText ? `Others (${m.othersText})` : "Others");
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

/* ---------- robust timestamp extractor for sorting ---------- */
const getMs = (c) => {
  const v =
    c?.createdAtMs ??
    c?.createdAt ??
    c?.form?.createdAt ??
    c?.createdAtMillis ??
    null;
  if (!v) return 0;
  if (typeof v === "number") return v;
  if (v?.seconds) return v.seconds * 1000;
  const p = Date.parse(v);
  return Number.isFinite(p) ? p : 0;
};

/* ---------- modern button ---------- */
function ModernButton({
  icon,
  label,
  variant = "primary",
  onPress,
  disabled,
  fullWidth = false,
}) {
  const palette =
    {
      primary: { bg: "#2563eb", text: "#ffffff", border: "#1d4ed8" },
      danger: { bg: "#fee2e2", text: "#b91c1c", border: "#fecaca" },
      ghost: { bg: "#eef2ff", text: "#3730a3", border: "#c7d2fe" },
    }[variant] || { bg: "#2563eb", text: "#ffffff", border: "#1d4ed8" };

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      android_ripple={{ color: "rgba(0,0,0,0.08)", borderless: false }}
      style={({ pressed }) => [
        {
          paddingVertical: 12,
          borderRadius: 14,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: palette.bg,
          borderWidth: variant === "danger" || variant === "ghost" ? 1 : 0,
          borderColor: palette.border,
          shadowColor: "#000",
          shadowOpacity: 0.08,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 3 },
          elevation: 3,
          opacity: disabled ? 0.6 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
          ...(fullWidth ? { width: "100%", alignSelf: "stretch" } : { flex: 1 }),
        },
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        {icon ? (
          <Ionicons
            name={icon}
            size={18}
            color={palette.text}
            style={{
              marginRight: 8,
              marginTop: Platform.OS === "android" ? 1 : 0,
            }}
          />
        ) : null}
        <Text style={{ color: palette.text, fontWeight: "800" }}>{label}</Text>
      </View>
    </Pressable>
  );
}

/* ---------- Modern notif row ---------- */
function NotifItem({ item, onPress }) {
  const student = item?.form?.nameClient || item?.studentName || "Student";
  const day = item?.form?.date || item?.day || "-";
  const time = item?.form?.time || item?.time || "-";

  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: "rgba(0,0,0,0.06)" }}
      style={({ pressed }) => [
        {
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: 12,
          paddingHorizontal: 6,
          borderBottomWidth: 1,
          borderBottomColor: "#f1f5f9",
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          backgroundColor: "#eef2ff",
          alignItems: "center",
          justifyContent: "center",
          marginRight: 10,
        }}
      >
        <Ionicons name="document-text-outline" size={18} color="#4f46e5" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: "800" }}>Needs Unit Head signature</Text>
        <Text style={{ color: "#374151", marginTop: 2 }} numberOfLines={1}>
          {student} — {day} @ {time}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
    </Pressable>
  );
}

export default function TeacherScheduleScreen() {
  const { id: routeId, fromUH } = useLocalSearchParams();
  const teacherId = String(routeId || "").trim();

  const navigation = useNavigation();
  const viewerUid = auth.currentUser?.uid || null;

  const [teacher, setTeacher] = useState(null);
  const [grid, setGrid] = useState(null);
  const [loading, setLoading] = useState(true);

  // Roles
  const [isUH, setIsUH] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const canManageSchedule =
    (isUH || isAdmin) && (teacher?.status?.toLowerCase() === "approved");

  // 🔔 UH notifications
  const [uhNotifs, setUhNotifs] = useState([]);
  const [showNotifs, setShowNotifs] = useState(false);

  // Details + sign modal
  const [showConsultModal, setShowConsultModal] = useState(false);
  const [selected, setSelected] = useState(null);
  const [signMode, setSignMode] = useState(false);
  const [savingSig, setSavingSig] = useState(false);
  const sigRef = useRef(null);

  // detect Unit Head/Admin via param or /users/{uid}
  useEffect(() => {
    (async () => {
      if (!viewerUid) return;
      try {
        const snap = await getDoc(doc(db, "users", viewerUid));
        const u = snap.exists() ? snap.data() : {};
        const uh =
          fromUH === "1" ||
          u.role === "unit_head" ||
          u.roles?.unitHead ||
          u.roles?.unit_head;
        const admin = u.role === "admin" || u.roles?.admin === true;

        setIsUH(!!uh);
        setIsAdmin(!!admin);
      } catch {}
    })();
  }, [fromUH, viewerUid]);

  // 🔔 listen to consultations for THIS teacher that need UH signature (newest first)
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
        const needsUH = all
          .filter((c) => {
            const status = String(c.status || "").toLowerCase();
            const notDeclined =
              status !== "declined_by_teacher" &&
              status !== "declined" &&
              status !== "cancelled" &&
              status !== "canceled";
            const hasTeacherSig = !!(
              c.teacherSignature && c.teacherSignature.base64
            );
            const noUHsig = !(c.unitHeadSignature && c.unitHeadSignature.base64);
            return hasTeacherSig && noUHsig && notDeclined;
          })
          .sort((a, b) => getMs(b) - getMs(a)); // newest on top
        setUhNotifs(needsUH);
      },
      (err) => console.warn("[UH notif] listener error:", err?.message || err)
    );
    return unsub;
  }, [teacherId]);

  // header (bell + badge for UH)
  useEffect(() => {
    const title = teacher
      ? teacher.displayName || teacher.fullName || "Teacher"
      : "Teacher";
    const subtitle = teacher
      ? [
          teacher.course && `Course: ${teacher.course}`,
          teacher.college && `College: ${teacher.college}`,
        ]
          .filter(Boolean)
          .join("  •  ")
      : "";

    navigation.setOptions({
      headerTitle: () => <HeaderTitle title={title} subtitle={subtitle} />,
      headerRight: () =>
        isUH ? (
          <Pressable
            onPress={() => setShowNotifs(true)}
            hitSlop={10}
            style={{ paddingHorizontal: 8, paddingVertical: 4 }}
          >
            <View style={{ position: "relative" }}>
              <Ionicons name="notifications-outline" size={22} color="#111827" />
              {uhNotifs.length > 0 && (
                <View
                  style={{
                    position: "absolute",
                    right: -6,
                    top: -6,
                    minWidth: 18,
                    height: 18,
                    paddingHorizontal: 4,
                    borderRadius: 999,
                    backgroundColor: "#ef4444",
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 2,
                    borderColor: "#fff",
                  }}
                >
                  <Text style={{ color: "#fff", fontSize: 11, fontWeight: "800" }}>
                    {uhNotifs.length}
                  </Text>
                </View>
              )}
            </View>
          </Pressable>
        ) : null,
    });
  }, [navigation, teacher, isUH, uhNotifs.length]);

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

  // Parse XLSX → grid
  const parseXlsxToGrid = async (fileUri) => {
    const res = await fetch(fileUri);
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

    return newGrid;
  };

  // Upload/Replace schedule (Admin/UH; ONLY if teacher approved)
  const handleUploadReplaceSchedule = async () => {
    if (!canManageSchedule) {
      Alert.alert(
        "Not allowed",
        "Teacher must be approved before managing schedules."
      );
      return;
    }
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
      const newGrid = await parseXlsxToGrid(file.uri);

      const ref = doc(db, "schedules", teacherId);
      const snap = await getDoc(ref);
      const payload = {
        grid: newGrid,
        uploadedAt: serverTimestamp(),
        uploadedBy: viewerUid || null,
      };
      if (!snap.exists() || !snap.data()?.defaultGrid)
        payload.defaultGrid = newGrid;

      await setDoc(ref, payload, { merge: true });
      Alert.alert("Success", grid ? "Schedule replaced." : "Schedule created.");
    } catch (err) {
      Alert.alert("Upload failed", String(err?.message || err));
    }
  };

  // Delete schedule (Admin/UH; ONLY if teacher approved)
  const handleDeleteSchedule = async () => {
    if (!canManageSchedule) {
      Alert.alert(
        "Not allowed",
        "Teacher must be approved before managing schedules."
      );
      return;
    }
    Alert.alert("Delete Schedule", "This will remove the current schedule. Continue?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteDoc(doc(db, "schedules", teacherId));
            Alert.alert("Deleted", "Schedule removed.");
          } catch (e) {
            Alert.alert("Delete failed", String(e?.message || e));
          }
        },
      },
    ]);
  };

  /* ---------- notifications helpers ---------- */
  const openConsultFromNotif = (c) => {
    setShowNotifs(false);
    setSelected(c);
    setSignMode(false);
    setShowConsultModal(true);
  };

  /* ---------- sign flow (UH only) ---------- */
  const handleSaveSignature = async (sigBase64) => {
    if (!isUH) {
      Alert.alert("Not allowed", "Only Unit Heads can sign.");
      return;
    }
    if (!selected?.id) return;

    setSavingSig(true);
    try {
      await updateDoc(doc(db, "consultations", selected.id), {
        unitHeadSignature: {
          base64: sigBase64,
          mime: "image/png",
          uid: viewerUid,
        },
        unitHeadSignedAt: serverTimestamp(),
        unitHeadApproved: true,
      });

      Alert.alert("Signature saved", "Your Unit Head signature has been saved.");
      // realtime listener removes it from list
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
  const onSignatureEmpty = () =>
    Alert.alert("No signature", "Please sign before saving.");

  /* ---------- sorted notifications (safety) ---------- */
  const sortedUhNotifs = useMemo(
    () => [...uhNotifs].sort((a, b) => getMs(b) - getMs(a)),
    [uhNotifs]
  );

  return (
    <View
      style={{
        flex: 1,
        padding: 16,
        paddingTop: Platform.OS === "android" ? 30 : 16,
        backgroundColor: "#fff",
      }}
    >
      {(isAdmin || isUH) &&
        teacher?.status?.toLowerCase() === "approved" &&
        grid && (
          <View style={topBar}>
            <ModernButton
              icon="swap-horizontal-outline"
              label="Replace Schedule"
              variant="primary"
              onPress={handleUploadReplaceSchedule}
            />
            <ModernButton
              icon="trash-outline"
              label="Delete"
              variant="danger"
              onPress={handleDeleteSchedule}
            />
          </View>
        )}

      {(isAdmin || isUH) && teacher?.status?.toLowerCase() !== "approved" && (
        <View style={pendingBox}>
          <Text style={pendingTitle}>Teacher not approved</Text>
          <Text style={pendingText}>
            Schedule management is disabled until this teacher is approved.
          </Text>
        </View>
      )}

      {loading ? (
        <View style={{ marginTop: 24, alignItems: "center" }}>
          <ActivityIndicator />
          <Text style={{ color: "#6b7280", marginTop: 8 }}>Loading…</Text>
        </View>
      ) : !grid ? (
        <View style={{ marginTop: 16 }}>
          <Text style={{ color: "#6b7280", marginBottom: 10 }}>
            No schedule found for this teacher.
          </Text>
          {(isAdmin || isUH) &&
            teacher?.status?.toLowerCase() === "approved" && (
              <ModernButton
                icon="add-circle-outline"
                label="Add Schedule (XLSX)"
                variant="primary"
                fullWidth
                onPress={handleUploadReplaceSchedule}
              />
            )}
        </View>
      ) : (
        <View style={{ flex: 1, paddingVertical: 8 }}>
          <ScheduleGrid
            grid={grid}
            onSelectBlock={() => {}}
            onOpenTeacherConsultModal={() => {}}
            readonly
          />
        </View>
      )}

      {/* 🔔 Notifications modal (UH only) */}
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
              borderRadius: 14,
              maxHeight: "75%",
              paddingHorizontal: 14,
              paddingTop: 12,
              paddingBottom: 6,
              shadowColor: "#000",
              shadowOpacity: 0.12,
              shadowRadius: 16,
              elevation: 12,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ fontSize: 16, fontWeight: "800" }}>Notifications</Text>
                {uhNotifs.length > 0 && (
                  <View
                    style={{
                      backgroundColor: "#e2e8f0",
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      borderRadius: 999,
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "700", color: "#0f172a" }}>
                      {uhNotifs.length}
                    </Text>
                  </View>
                )}
              </View>
              <TouchableOpacity onPress={() => setShowNotifs(false)}>
                <Text style={{ color: "#2563eb", fontWeight: "700" }}>Close</Text>
              </TouchableOpacity>
            </View>

            {sortedUhNotifs.length === 0 ? (
              <Text style={{ color: "#6b7280", paddingVertical: 10 }}>
                No consultations pending Unit Head signature.
              </Text>
            ) : (
              <FlatList
                data={sortedUhNotifs}
                keyExtractor={(it) => it.id}
                renderItem={({ item }) => (
                  <NotifItem item={item} onPress={() => openConsultFromNotif(item)} />
                )}
                showsVerticalScrollIndicator={false}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* 📄 Consultation details + Sign modal (UH only) */}
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
        <View
          style={{
            flex: 1,
            backgroundColor: "#0006",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <View
            style={{
              backgroundColor: "white",
              borderRadius: 12,
              maxHeight: "85%",
              padding: 16,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
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
              <UHSignPanel
                sigRef={sigRef}
                onSignatureOK={onSignatureOK}
                onSignatureEmpty={onSignatureEmpty}
                savingSig={savingSig}
              />
            ) : (
              <DetailsPanel
                selected={selected}
                isUH={isUH}
                setSignMode={setSignMode}
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* ---------- Split out subcomponents ---------- */
function UHSignPanel({ sigRef, onSignatureOK, onSignatureEmpty, savingSig }) {
  const [consent, setConsent] = useState(false);

  const trySave = () => {
    if (!consent) {
      Alert.alert(
        "Consent required",
        "Please confirm your consent to use your signature for this consultation."
      );
      return;
    }
    sigRef.current?.readSignature?.();
  };

  return (
    <>
      {/* Consent checkbox */}
      <Pressable
        onPress={() => setConsent((s) => !s)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          marginBottom: 8,
        }}
      >
        <Ionicons
          name={consent ? "checkbox-outline" : "square-outline"}
          size={22}
          color={consent ? "#16a34a" : "#9ca3af"}
        />
        <Text style={{ color: "#111827", flex: 1 }}>
          I confirm that I am authorized and consent to the use of my signature
          for this consultation.
        </Text>
      </Pressable>

      <View
        style={{
          height: 260,
          borderWidth: 1,
          borderColor: "#ddd",
          borderRadius: 12,
          overflow: "hidden",
          backgroundColor: "white",
        }}
      >
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
      <Text
        style={{
          textAlign: "center",
          color: "#6b7280",
          fontSize: 12,
          marginTop: 8,
        }}
      >
        Sign here
      </Text>

      <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
        <TouchableOpacity
          onPress={() => sigRef.current?.clearSignature?.()}
          disabled={savingSig}
          style={{
            flex: 1,
            paddingVertical: 9,
            backgroundColor: "#e5e7eb",
            borderRadius: 10,
            alignItems: "center",
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827" }}>
            Clear
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={trySave}
          disabled={savingSig || !consent}
          style={{
            flex: 1,
            paddingVertical: 9,
            backgroundColor: consent ? "#16a34a" : "#86efac",
            borderRadius: 10,
            alignItems: "center",
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: "700", color: "white" }}>
            {savingSig ? "Saving…" : "Save"}
          </Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

function DetailsPanel({ selected, isUH, setSignMode }) {
  return (
    <>
      <View>
        <Row
          label="Student"
          value={selected?.form?.nameClient || selected?.studentName}
        />
        <Row
          label="Student No."
          value={selected?.form?.studentNumber || selected?.studentId}
        />
        <Row label="Program" value={selected?.form?.program} />
        <Row label="Year & Section" value={selected?.form?.yearSection} />
        <Row label="Contact No." value={selected?.form?.contactNumber} />
        <Row label="Consultant" value={selected?.form?.consultantName} />
        <Row label="Date" value={selected?.form?.date || selected?.day} />
        <Row label="Time" value={selected?.form?.time || selected?.time} />
        <Row label="Duration" value={selected?.form?.duration} />
        <Row label="Method" value={formatMethods(selected?.form?.methods)} />
        <Row
          label="Nature of Consultation"
          value={formatInquiry(selected?.form?.inquiry)}
        />
        <Row label="Outcome Notes" value={selected?.studentOutcome?.notes} />
      </View>

      {isUH && (
        <TouchableOpacity
          onPress={() => {
            if (!selected?.teacherSignature?.base64) {
              Alert.alert(
                "Teacher signature missing",
                "The teacher must sign first."
              );
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
          <Text style={{ color: "white", fontWeight: "800" }}>
            Sign as Unit Head
          </Text>
        </TouchableOpacity>
      )}
    </>
  );
}

/* ---------- styles ---------- */
const topBar = { flexDirection: "row", gap: 10, marginBottom: 12 };

const pendingBox = {
  padding: 12,
  borderRadius: 10,
  backgroundColor: "#fff7ed",
  borderWidth: 1,
  borderColor: "#fed7aa",
  marginBottom: 12,
};
const pendingTitle = { color: "#9a3412", fontWeight: "700" };
const pendingText = { color: "#9a3412", marginTop: 4 };
