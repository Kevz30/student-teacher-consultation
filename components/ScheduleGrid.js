// components/ScheduleGrid.js
import { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { TIMESLOTS, WEEKDAYS } from "../app/utils/scheduleTemplate";

const normalize = (str = "") =>
  String(str).replace(/–/g, "-").replace(/\s+/g, "").toLowerCase();

export default function ScheduleGrid({
  grid,
  onSelectBlock,                 // optional (teacher color editor)
  readonly = false,               // true for student
  onRequestBlock,                 // student: white tap -> details form
  consultationMap,                // { [day]: { [slot]: consultationId } } (can be raw)
  onOpenTeacherConsultModal,      // teacher: yellow tap -> open modal
}) {
  const [selected, setSelected] = useState(null);
  const isEditable = !readonly && typeof onSelectBlock === "function";

  const handlePressTeacher = (day, slot, color) => {
    if (color === "yellow") {
      const dayKey = normalize(day);
      const timeKey = normalize(slot);
      const cid =
        consultationMap?.[dayKey]?.[timeKey] ??
        consultationMap?.[day]?.[slot] ??
        null;

      if (typeof onOpenTeacherConsultModal === "function") {
        onOpenTeacherConsultModal({ day, slot, consultationId: cid });
      }
      return;
    }
    if (isEditable) setSelected({ day, slot });
  };

  const handleChange = (newColor) => {
    if (selected && isEditable) {
      onSelectBlock(selected.day, selected.slot, newColor);
      setSelected(null);
    }
  };

  return (
    <>
      <ScrollView horizontal>
        <View style={{ flexDirection: "row" }}>
          {/* Time column */}
          <View style={{ marginRight: 2 }}>
            <View style={{ height: 30 }} />
            {TIMESLOTS.map((slot) => (
              <View
                key={slot}
                style={{
                  height: 30,
                  justifyContent: "center",
                  alignItems: "center",
                  paddingHorizontal: 4,
                }}
              >
                <Text style={{ fontSize: 10 }}>{slot}</Text>
              </View>
            ))}
          </View>

          {/* Day columns */}
          {WEEKDAYS.map((day) => (
            <View key={day} style={{ marginRight: 2 }}>
              <View
                style={{
                  height: 30,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Text style={{ fontWeight: "bold", fontSize: 12 }}>{day}</Text>
              </View>

              {TIMESLOTS.map((slot) => {
                const color = grid?.[day]?.[slot] || "white";
                const disableStudent = readonly && color !== "white";

                return (
                  <TouchableOpacity
                    key={`${day}-${slot}`}
                    disabled={disableStudent}
                    onPress={() => {
                      if (readonly) {
                        if (color === "white" && typeof onRequestBlock === "function") {
                          onRequestBlock(day, slot);
                        }
                        return;
                      }
                      handlePressTeacher(day, slot, color);
                    }}
                    style={{
                      height: 30,
                      width: 48,
                      backgroundColor: color,
                      borderColor: "#ccc",
                      borderWidth: 1,
                      justifyContent: "center",
                      alignItems: "center",
                      opacity: readonly ? 0.9 : 1,
                    }}
                  >
                    <Text style={{ fontSize: 8 }}>
                      {color === "white" ? "" : color}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Teacher edit modal (optional) */}
      {isEditable && (
        <Modal
          transparent
          animationType="fade"
          visible={!!selected}
          onRequestClose={() => setSelected(null)}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.5)",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <View
              style={{
                backgroundColor: "white",
                padding: 20,
                borderRadius: 10,
                width: "80%",
              }}
            >
              <Text style={{ fontWeight: "bold", marginBottom: 10 }}>
                Change block status:
              </Text>

              {["white", "red", "yellow", "blue"].map((c) => (
                <Pressable
                  key={c}
                  onPress={() => handleChange(c)}
                  style={{
                    backgroundColor: c,
                    padding: 10,
                    marginVertical: 5,
                    borderRadius: 5,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: c === "white" ? "black" : "white" }}>
                    {c.toUpperCase()}
                  </Text>
                </Pressable>
              ))}

              <Pressable
                onPress={() => setSelected(null)}
                style={{
                  padding: 10,
                  marginTop: 10,
                  alignItems: "center",
                  backgroundColor: "#aaa",
                  borderRadius: 5,
                }}
              >
                <Text>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}
