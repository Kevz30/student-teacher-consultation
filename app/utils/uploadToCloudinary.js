// app/utils/uploadToCloudinary.js

// ---- Cloudinary config ----
// Use your own cloud name (taken from your current image endpoint)
const CLOUDINARY_CLOUD_NAME = "dyphnft3g";

// Default presets/folder names (change if you renamed them)
const DEFAULT_IMAGE_PRESET = "student_cor_upload";   // existing
const DEFAULT_PDF_PRESET   = "consultation_pdfs";    // the preset you created
const DEFAULT_PDF_FOLDER   = "consultations";        // optional

/**
 * Default IMAGE uploader (base64) — kept exactly like your current behavior.
 * Returns secure_url (string)
 */
export default async function uploadToCloudinary(
  base64,
  preset = DEFAULT_IMAGE_PRESET
) {
  const apiUrl = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

  const formData = new FormData();
  formData.append("file", `data:image/jpeg;base64,${base64}`);
  formData.append("upload_preset", preset);

  const response = await fetch(apiUrl, {
    method: "POST",
    body: formData,
  });

  const json = await response.json();

  if (!json.secure_url) {
    console.error("Cloudinary upload error:", json);
    throw new Error("Upload failed");
  }

  return json.secure_url;
}

/**
 * NEW: PDF uploader.
 * Accepts either a file URI (e.g. result from generatePrefilledPDF) OR a base64 string.
 * Returns { secureUrl, publicId }.
 */
export async function uploadPdfToCloudinary(
  input,                                    // file URI OR base64 string
  {
    preset = DEFAULT_PDF_PRESET,
    folder = DEFAULT_PDF_FOLDER,
    filename = "consultation.pdf",
  } = {}
) {
  const apiUrl = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/raw/upload`;

  const form = new FormData();

  if (typeof input === "string" && input.startsWith("file")) {
    // React Native file URI
    form.append("file", {
      uri: input,
      name: filename,
      type: "application/pdf",
    });
  } else if (typeof input === "string" && input.startsWith("data:application/pdf")) {
    // Data URI already
    form.append("file", input);
  } else if (typeof input === "string") {
    // Assume base64 string
    form.append("file", `data:application/pdf;base64,${input}`);
  } else {
    throw new Error("uploadPdfToCloudinary: expected file URI or base64 string");
  }

  form.append("upload_preset", preset);
  if (folder) form.append("folder", folder);

  const res = await fetch(apiUrl, { method: "POST", body: form });
  const json = await res.json();

  if (!res.ok || !json.secure_url) {
    console.error("Cloudinary upload error:", json);
    throw new Error(json?.error?.message || "Upload failed");
  }

  return { secureUrl: json.secure_url, publicId: json.public_id, raw: json };
}
