// app/utils/buildSignedConsultationPdf.js
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

/**
 * Build a signed consultation PDF using a *button field* appearance for the signature.
 * This is more reliable than drawing directly into a form widget.
 */
export async function buildSignedConsultationPdf({
  template = require("../../assets/consultation-form.pdf"),

  student = { fullName: "", studentNumber: "", course: "" },
  teacher = { fullName: "" },
  slot = { day: "", time: "" },
  extra = {},

  // processed signature object from processSignatureImage()
  signature,                  // { base64, mime }
  dateSigned,                 // string, e.g. new Date().toLocaleDateString()

  // where to place the teacher signature (origin = bottom-left)
  sigBox = { x: 95, y: 152, width: 240, height: 80 },

  // draw the “Date Signed” text here (so it’s always visible even if the field name changes)
  dateTextPos = { x: 290, y: 155 },

  outName = "signed_consultation.pdf",
}) {
  // 1) load template
  const asset = Asset.fromModule(template);
  await asset.downloadAsync();
  const res = await fetch(asset.localUri || asset.uri);
  const bytes = await res.arrayBuffer();

  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const form = pdfDoc.getForm();
  const page = pdfDoc.getPage(0);

  // 2) fill text fields you already know
  const IDS = {
    name: "Text-iMEhEGgZ6D",
    studentNumber: "Text-MxGQJmMKqM",
    typeStudent: "CheckBox-cAUSTQbFe2",
    program: "Text-0m3ZvgK4HY",
    office: "Text-BCbIWlQ7Jm",
    consultant: "Text-E90hCUFHEb",
    time: "Text-JN51Z4_HEo",
    duration: "Text-yS1RDZuzzH",
    contactNumber: "Text-vsjllGri5V",
    yearSection: "Text-RZjyE8a38m",
    date: "Text-soJRbHl-14",

    // this may or may not exist in your template, so we also draw date text
    dateSignedConsultant: "Text-T18rTe8Iig",
  };

  const setText = (id, v) => { try { form.getTextField(id).setText(v ?? ""); } catch {} };
  const setCheck = (id, on) => { try { const cb = form.getCheckBox(id); on ? cb.check() : cb.uncheck(); } catch {} };

  setText(IDS.name, student.fullName);
  setText(IDS.studentNumber, student.studentNumber);
  setText(IDS.program, student.course);
  setText(IDS.consultant, teacher.fullName);
  setText(IDS.time, slot.time);
  setText(IDS.duration, extra.duration || "30 minutes");
  setCheck(IDS.typeStudent, true);
  setText(IDS.office, extra.office);
  setText(IDS.yearSection, extra.yearSection);
  setText(IDS.contactNumber, extra.contactNumber);
  setText(IDS.date, extra.date || slot.day || "");

  // try to write into the form's date field (if present)
  try { if (dateSigned) form.getTextField(IDS.dateSignedConsultant).setText(dateSigned); } catch {}

  // and *also* draw visible date text directly on the page (always works)
  if (dateSigned) {
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    page.drawText(dateSigned, { x: dateTextPos.x, y: dateTextPos.y, size: 10, font, color: rgb(0,0,0) });
  }

  // 3) place the signature via a Button field appearance
  if (signature?.base64) {
    // convert base64 → bytes *reliably* in Expo by writing to a file first
    const sigUri = `${FileSystem.cacheDirectory}__teacher_sig.png`;
    await FileSystem.writeAsStringAsync(sigUri, signature.base64, { encoding: FileSystem.EncodingType.Base64 });
    const sigBytes = await (await fetch(sigUri)).arrayBuffer();

    const img = await pdfDoc.embedPng(sigBytes);
    const btn = form.createButton("teacherSignatureButton");
    btn.addToPage(page, sigBox);
    btn.setImage(img);

    // while calibrating the box, you can draw a guide:
    // page.drawRectangle({ ...sigBox, borderWidth: 0.7, borderColor: rgb(1, 0, 0) });

    // flatten to bake the form + image into the page contents
    form.flatten();
  }

  // 4) save
  const base64Pdf = await pdfDoc.saveAsBase64({ dataUri: false });
  const pdfPath = `${FileSystem.documentDirectory}${outName}`;
  await FileSystem.writeAsStringAsync(pdfPath, base64Pdf, { encoding: FileSystem.EncodingType.Base64 });
  return pdfPath;
}
