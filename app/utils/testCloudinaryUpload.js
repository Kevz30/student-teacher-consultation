import axios from "axios";

export const testCloudinaryUpload = async (imageUri) => {
  const data = new FormData();
  data.append("file", {
    uri: imageUri,
    type: "image/jpeg",
    name: "cor.jpg",
  });
  data.append("upload_preset", "student_cor_upload");

  try {
    const res = await axios.post(
      "https://api.cloudinary.com/v1_1/dyphnft3g/image/upload",
      data,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      }
    );
    console.log("✅ Uploaded:", res.data.secure_url);
    return res.data.secure_url;
  } catch (err) {
    console.log("❌ Upload error:", err.message || err);
    throw err;
  }
};
