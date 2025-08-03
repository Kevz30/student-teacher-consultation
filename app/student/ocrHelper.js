import axios from "axios";

export const scanOCR = async (base64) => {
  try {
    const formData = new URLSearchParams();
    formData.append("base64Image", `data:image/jpeg;base64,${base64}`);
    formData.append("language", "eng");

    const response = await axios.post(
      "https://api.ocr.space/parse/image",
      formData.toString(),
      {
        headers: {
          apikey: "K88739073288957",   // your OCR.Space key
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    return (
      response.data?.ParsedResults?.[0]?.ParsedText
      || ""
    );
  } catch (error) {
    console.error("OCR scan failed:", error);
    return "";
  }
};
