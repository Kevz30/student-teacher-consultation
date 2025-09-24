// app/utils/uploadIdPhoto.js
/**
 * Cloudinary unsigned upload (image) for React Native / Expo.
 * - No base64 conversion
 * - Uses multipart/form-data with { uri, name, type }
 */

const CLOUD_NAME = "dyphnft3g";              // ← your Cloudinary cloud name
const UPLOAD_PRESET = "id_photos_unsigned";  // ← your unsigned preset

export default async function uploadIdPhoto(localUri) {
  if (!localUri) throw new Error("No local file URI provided.");

  console.log("[CLOUDINARY] uploading via FormData:", localUri);

  const form = new FormData();
  form.append("file", {
    uri: localUri,
    // Use .jpg as a safe default. If you track the extension, you can swap it.
    name: `id-${Date.now()}.jpg`,
    type: "image/jpeg",
  });
  form.append("upload_preset", UPLOAD_PRESET);
  // If you want to force a folder via API in addition to the preset’s folder:
  // form.append("folder", "consultation-id-photos");

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
    method: "POST",
    // DO NOT set Content-Type header — let fetch set the proper boundary.
    body: form,
  });

  const json = await res.json();
  console.log("[CLOUDINARY] response:", json);

  if (!res.ok || !json.secure_url) {
    const msg = json?.error?.message || `HTTP ${res.status}`;
    throw new Error(`Cloudinary upload failed: ${msg}`);
  }

  return json.secure_url; // ← Save this in Firestore
}
