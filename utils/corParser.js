import { scanOCR } from "../app/student/ocrHelper";

export default async function parseCOR(base64) {
  const rawText = await scanOCR(base64);
  if (!rawText) return null;

  const studentNumberRegex = /(C20\d{7})/;
  const match = rawText.match(studentNumberRegex);
  return { studentNumber: match ? match[1] : null };
}
