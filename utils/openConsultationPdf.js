import { Asset } from "expo-asset";
import * as Sharing from "expo-sharing";

export async function openConsultationPdf() {
  try {
    const a = Asset.fromModule(require("../../assets/consultation-form.pdf")); // utils → ../../assets
    await a.downloadAsync();
    const uri = a.localUri || a.uri;

    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) {
      alert("No PDF app found. Install a PDF viewer (e.g., Google Drive) and try again.");
      return;
    }
    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      dialogTitle: "Open Consultation Form",
    });
  } catch (e) {
    console.warn("Open PDF failed:", e);
    alert("Could not open the PDF. Try `expo start -c` and retry.");
  }
}
