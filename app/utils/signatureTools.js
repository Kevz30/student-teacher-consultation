// app/utils/signatureTools.js
import * as ImageManipulator from "expo-image-manipulator";

/**
 * Normalize the picked signature to a predictable PNG.
 * Returns { base64, width, height, mime }
 */
export async function processSignatureImage(input) {
  const uri = typeof input === "string" ? input : input?.uri;
  if (!uri) throw new Error("No signature URI");

  // Make it reasonably sized so it fits well in the PDF
  const out = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1200 } }],                             // adjust once if needed
    { compress: 1, format: ImageManipulator.SaveFormat.PNG, base64: true }
  );

  return { base64: out.base64, width: out.width, height: out.height, mime: "image/png" };
}
