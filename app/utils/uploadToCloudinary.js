export default async function uploadToCloudinary(base64, preset = "student_cor_upload") {
  const apiUrl = "https://api.cloudinary.com/v1_1/dyphnft3g/image/upload";

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
