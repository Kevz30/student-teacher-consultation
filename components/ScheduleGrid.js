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

export default function ScheduleGrid({ grid, onSelectBlock }) {
  const [selected, setSelected] = useState(null);
  const isEditable = typeof onSelectBlock === "function";

  const handlePress = (day, slot) => {
    if (isEditable) {
      setSelected({ day, slot });
    }
  };

  const handleChange = (color) => {
    if (selected && isEditable) {
      onSelectBlock(selected.day, selected.slot, color);
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
            {TIMESLOTS.map((slot, i) => (
              <View
                key={i}
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
          {WEEKDAYS.map((day, dIndex) => (
            <View key={dIndex} style={{ marginRight: 2 }}>
              <View
                style={{
                  height: 30,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Text style={{ fontWeight: "bold", fontSize: 12 }}>{day}</Text>
              </View>
              {TIMESLOTS.map((slot, sIndex) => {
                const color = grid?.[day]?.[slot] || "white";
                return (
                  <TouchableOpacity
                    key={sIndex}
                    disabled={!isEditable}
                    onPress={() => handlePress(day, slot)}
                    style={{
                      height: 30,
                      width: 48,
                      backgroundColor: color,
                      borderColor: "#ccc",
                      borderWidth: 1,
                      justifyContent: "center",
                      alignItems: "center",
                      opacity: isEditable ? 1 : 0.6,
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

      {/* Modal */}
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
              {["white", "red", "yellow", "blue"].map((color) => (
                <Pressable
                  key={color}
                  onPress={() => handleChange(color)}
                  style={{
                    backgroundColor: color,
                    padding: 10,
                    marginVertical: 5,
                    borderRadius: 5,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: color === "white" ? "black" : "white" }}>
                    {color.toUpperCase()}
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
