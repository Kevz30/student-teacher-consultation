// utils/generatePrefilledPdf.js
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system";
import { PDFDocument, rgb } from "pdf-lib";

const IDS = {
  // top section
  name: "Text-iMEhEGgZ6D",
  studentNumber: "Text-MxGQJmMKqM",
  typeStudent: "CheckBox-cAUSTQbFe2",

  // main fields
  program: "Text-0m3ZvgK4HY",
  office: "Text-BCbIWlQ7Jm",
  consultant: "Text-E90hCUFHEb",
  time: "Text-JN51Z4_HEo",
  duration: "Text-yS1RDZuzzH",

  // others
  contactNumber: "Text-vsjllGri5V",
  yearSection: "Text-RZjyE8a38m",
  date: "Text-soJRbHl-14",

  // nature of inquiry
  nqClassAdvising:  "CheckBox-FWgAFnIT1u",
  nqThesis:         "CheckBox-Murqt1h0_7",
  nqStudentOrg:     "CheckBox-44toIS0mLI",
  nqDissertation:   "CheckBox-xgPMLuSjL0",
  nqCourseConcerns: "CheckBox-DvYi4BFzyK",
  nqOthers:         "CheckBox-FSlxWCvo_K",
  nqOthersText:     "Text-r3mLLKu9z7",

  // method of consultation
  mVideo:      "CheckBox-z5qhcScQot",
  mSocial:     "CheckBox-9MAB9yaiQ8",
  mEmail:      "CheckBox-fX1Wi-Qnux",
  mText:       "CheckBox-BP7etZSiSh",
  mOthers:     "CheckBox-jh2pw0OOcv",
  mOthersText: "Text-d12qtC5XKV",

  // Date Signed fields
  dateSignedConsultant: "Text-T18rTe8Iig",
  dateSignedUnitHead:   "Text-Gs7fPXiEey",
};

function setText(form, id, value) {
  if (!id) return;
  try { form.getTextField(id).setText(value ?? ""); } catch {}
}
function setCheck(form, id, on) {
  if (!id) return;
  try { const cb = form.getCheckBox(id); on ? cb.check() : cb.uncheck(); } catch {}
}

function stripDataUrl(b64 = "") {
  const i = b64.indexOf(";base64,");
  return i !== -1 ? b64.slice(i + 8) : b64;
}

async function base64ToBytesRN(base64, tmpName = "tmp_sig.bin") {
  const raw = stripDataUrl(base64);
  try {
    // eslint-disable-next-line no-undef
    if (typeof atob === "function") {
      // eslint-disable-next-line no-undef
      const bin = atob(raw);
      const len = bin.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
      return bytes;
    }
  } catch {}
  const uri = `${FileSystem.cacheDirectory || FileSystem.documentDirectory}${tmpName}`;
  await FileSystem.writeAsStringAsync(uri, raw, { encoding: FileSystem.EncodingType.Base64 });
  const buf = await (await fetch(uri)).arrayBuffer();
  return new Uint8Array(buf);
}

/**
 * generatePrefilledPDF
 */
export async function generatePrefilledPDF(
  student = {},
  teacher = {},
  slot = {},
  extra = {},
  outName = "prefilled_form.pdf",
  opts = {}
) {
  // Load template
  const asset = Asset.fromModule(require("../../assets/consultation-form.pdf"));
  await asset.downloadAsync();
  const res = await fetch(asset.localUri || asset.uri);
  const bytes = await res.arrayBuffer();

  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const form = pdfDoc.getForm();

  // Core fields
  setText(form, IDS.name, student.fullName);
  setText(form, IDS.studentNumber, student.studentNumber);
  setText(form, IDS.program, student.course);
  setText(form, IDS.consultant, teacher.fullName);
  setText(form, IDS.time, slot.time);
  setText(form, IDS.duration, extra.duration || "30 minutes");
  setCheck(form, IDS.typeStudent, true);

  // Extras
  setText(form, IDS.office, extra.office);
  setText(form, IDS.yearSection, extra.yearSection);
  setText(form, IDS.contactNumber, extra.contactNumber);
  setText(form, IDS.date, extra.date || slot.day || "");

  // Nature of inquiry (booleans)
  const q = extra.inquiry || {};
  setCheck(form, IDS.nqClassAdvising, !!q.classAdvising);
  setCheck(form, IDS.nqStudentOrg, !!q.studentOrg);
  setCheck(form, IDS.nqCourseConcerns, !!q.courseConcerns);
  setCheck(form, IDS.nqThesis, !!q.thesis);
  setCheck(form, IDS.nqDissertation, !!q.dissertation);
  setCheck(form, IDS.nqOthers, !!q.others);
  setText(form, IDS.nqOthersText, q.othersText);

  // Methods (booleans)
  const m = extra.methods || {};
  setCheck(form, IDS.mVideo, !!m.video);
  setCheck(form, IDS.mEmail, !!m.email);
  setCheck(form, IDS.mSocial, !!m.social);
  setCheck(form, IDS.mText, !!m.text);
  setCheck(form, IDS.mOthers, !!m.others);
  setText(form, IDS.mOthersText, m.othersText);

  // Dates signed
  if (opts.dateSigned) setText(form, IDS.dateSignedConsultant, opts.dateSigned);
  if (opts.dateSignedUnitHead) setText(form, IDS.dateSignedUnitHead, opts.dateSignedUnitHead);

  // Signature embed (Consultant) — locked default position
  try {
    if (opts.teacherSignature?.base64) {
      const imgBytes = await base64ToBytesRN(opts.teacherSignature.base64, "sig_img.bin");
      const mime = (opts.teacherSignature.mime || "").toLowerCase();

      const img = mime.includes("jpg") || mime.includes("jpeg")
        ? await pdfDoc.embedJpg(imgBytes)
        : await pdfDoc.embedPng(imgBytes);

      const pageIndex = opts.sigBox?.pageIndex ?? 0;
      const page = pdfDoc.getPage(pageIndex);

      const box = {
        x: opts.sigBox?.x ?? 12,
        y: opts.sigBox?.y ?? 176,
        width:  opts.sigBox?.width  ?? 300,
        height: opts.sigBox?.height ?? 96,
      };

      if (opts.debugDrawBox) {
        page.drawRectangle({
          x: box.x, y: box.y, width: box.width, height: box.height,
          borderColor: rgb(1, 0, 0), borderWidth: 1,
        });
      }

      // Fit & center image inside box (preserve aspect ratio)
      const { width: iw, height: ih } = img.size ? img.size() : { width: img.width, height: img.height };
      const scale = Math.min(box.width / iw, box.height / ih);
      const drawW = iw * scale;
      const drawH = ih * scale;
      const dx = box.x + (box.width - drawW) / 2;
      const dy = box.y + (box.height - drawH) / 2;

      page.drawImage(img, { x: dx, y: dy, width: drawW, height: drawH });
    }
  } catch (e) {
    console.log("Signature embed error:", e?.message || e);
  }

  // Lock filled fields (optional)
  const lock = new Set(Object.values(IDS));
  form.getFields().forEach(f => {
    if (lock.has(f.getName())) {
      try { f.enableReadOnly(); } catch {}
    }
  });

  const base64Pdf = await pdfDoc.saveAsBase64({ dataUri: false });
  const pdfPath = `${FileSystem.documentDirectory}${outName}`;
  await FileSystem.writeAsStringAsync(pdfPath, base64Pdf, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return pdfPath;
}

export async function debugListFormFieldNames() {
  const asset = Asset.fromModule(require("../../assets/consultation-form.pdf"));
  await asset.downloadAsync();
  const res = await fetch(asset.localUri || asset.uri);
  const bytes = await res.arrayBuffer();
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const form = pdfDoc.getForm();
  form.getFields().forEach(f => console.log("FIELD:", f.getName()));
}
