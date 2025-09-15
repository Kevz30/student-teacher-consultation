// utils/generatePrefilledPdf.js
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";


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

  // existing notes field in the template (we clear it and draw ourselves)
  outcomeNotes: "Paragraph-UoqXWMgD4W",
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
  // 👇 use string literal to avoid deprecated enum
  await FileSystem.writeAsStringAsync(uri, raw, { encoding: "base64" });
  const buf = await (await fetch(uri)).arrayBuffer();
  return new Uint8Array(buf);
}

/* ---------- Underlined paragraph drawer ---------- */
function drawUnderlinedParagraph(page, text, {
  x, y, width, height,
  font, fontSize = 10,
  lineGap = 3,
  underlineOffset = 1.5,
  underlineThickness = 0.5,
  color = rgb(0,0,0),
  debug = false,
}) {
  if (debug) {
    page.drawRectangle({
      x, y: y - height + fontSize, width, height,
      borderColor: rgb(0, 0.6, 1), borderWidth: 1,
    });
  }

  const words = String(text || "").replace(/\r/g, "").split(/\s+/);
  const lineH = fontSize + lineGap;
  let cursorY = y; // baseline of first line
  const minY = y - (height - lineH);
  let line = "";

  const flushLine = (l) => {
    if (!l) return;
    page.drawText(l, { x, y: cursorY, size: fontSize, font, color });
    const w = font.widthOfTextAtSize(l, fontSize);
    page.drawLine({
      start: { x, y: cursorY - underlineOffset },
      end:   { x: x + Math.min(w, width), y: cursorY - underlineOffset },
      thickness: underlineThickness,
      color,
    });
    cursorY -= lineH;
  };

  for (let i = 0; i < words.length; i++) {
    const candidate = line ? `${line} ${words[i]}` : words[i];
    const w = font.widthOfTextAtSize(candidate, fontSize);
    if (w <= width) {
      line = candidate;
    } else {
      flushLine(line);
      if (cursorY <= minY) return;
      if (font.widthOfTextAtSize(words[i], fontSize) > width) {
        let chunk = "";
        for (const ch of words[i]) {
          const next = chunk + ch;
          if (font.widthOfTextAtSize(next, fontSize) <= width) chunk = next;
          else {
            flushLine(chunk);
            if (cursorY <= minY) return;
            chunk = ch;
          }
        }
        line = chunk;
      } else {
        line = words[i];
      }
    }
  }
  if (line && cursorY > minY) flushLine(line);
}

/* ---------- Shared signature drawer (teacher + unit head) ---------- */
async function drawSigInBox({
  pdfDoc,
  pageIndex = 0,
  base64,
  mime = "image/png",
  box,
  debug = false,
  tmp = "sig.bin",
}) {
  const page = pdfDoc.getPage(pageIndex);
  const imgBytes = await base64ToBytesRN(base64, tmp);
  const isJpg = (mime || "").toLowerCase().includes("jpg") || (mime || "").toLowerCase().includes("jpeg");
  const img = isJpg ? await pdfDoc.embedJpg(imgBytes) : await pdfDoc.embedPng(imgBytes);

  const { width: iw, height: ih } = img.size ? img.size() : { width: img.width, height: img.height };
  const scale = Math.min(box.width / iw, box.height / ih);
  const drawW = iw * scale;
  const drawH = ih * scale;
  const dx = box.x + (box.width - drawW) / 2;
  const dy = box.y + (box.height - drawH) / 2;

  if (debug) {
    page.drawRectangle({
      x: box.x, y: box.y, width: box.width, height: box.height,
      borderColor: rgb(1, 0, 0), borderWidth: 1,
    });
  }
  page.drawImage(img, { x: dx, y: dy, width: drawW, height: drawH });
}

/**
 * generatePrefilledPDF
 * opts:
 * - teacherSignature { base64, mime }
 * - unitHeadSignature { base64, mime }      // NEW
 * - dateSigned (teacher), dateSignedUnitHead
 * - outcomeBox / notesBox { pageIndex, x, y, width, height, lineHeight, debug }
 * - sigBox (teacher) { pageIndex, x, y, width, height, debug }
 * - unitHeadSigBox { pageIndex, x, y, width, height, debug } // NEW
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
  const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);

  /* ---------- form fields ---------- */
  setText(form, IDS.name, student.fullName);
  setText(form, IDS.studentNumber, student.studentNumber);
  setText(form, IDS.program, student.course);
  setText(form, IDS.consultant, teacher.fullName);
  setText(form, IDS.time, slot.time);
  setText(form, IDS.duration, extra.duration || "30 minutes");
  setCheck(form, IDS.typeStudent, true);

  setText(form, IDS.office, extra.office);
  setText(form, IDS.yearSection, extra.yearSection);
  setText(form, IDS.contactNumber, extra.contactNumber);
  setText(form, IDS.date, extra.date || slot.day || "");

  const q = extra.inquiry || {};
  setCheck(form, IDS.nqClassAdvising, !!q.classAdvising);
  setCheck(form, IDS.nqStudentOrg, !!q.studentOrg);
  setCheck(form, IDS.nqCourseConcerns, !!q.courseConcerns);
  setCheck(form, IDS.nqThesis, !!q.thesis);
  setCheck(form, IDS.nqDissertation, !!q.dissertation);
  setCheck(form, IDS.nqOthers, !!q.others);
  setText(form, IDS.nqOthersText, q.othersText);

  const m = extra.methods || {};
  setCheck(form, IDS.mVideo, !!m.video);
  setCheck(form, IDS.mEmail, !!m.email);
  setCheck(form, IDS.mSocial, !!m.social);
  setCheck(form, IDS.mText, !!m.text);
  setCheck(form, IDS.mOthers, !!m.others);
  setText(form, IDS.mOthersText, m.othersText);

  /* ---------- underlined outcome notes ---------- */
  const boxOpt = opts.outcomeBox || opts.notesBox || {};
  if (extra.outcomeNotes) {
    try { form.getTextField(IDS.outcomeNotes).setText(""); } catch {}
    const page = pdfDoc.getPage(boxOpt.pageIndex ?? 0);
    drawUnderlinedParagraph(page, extra.outcomeNotes, {
      x:      boxOpt.x      ?? 80,
      y:      boxOpt.y      ?? 340, // baseline of first line
      width:  boxOpt.width  ?? 480,
      height: boxOpt.height ?? 70,
      font: helv,
      fontSize: 10,
      lineGap: boxOpt.lineHeight ? Math.max(0, boxOpt.lineHeight - 10) : 2.5,
      underlineOffset: 1.2,
      underlineThickness: 0.5,
      debug: !!boxOpt.debug,
    });
  }

  /* ---------- dates ---------- */
  if (opts.dateSigned) setText(form, IDS.dateSignedConsultant, opts.dateSigned);
  if (opts.dateSignedUnitHead) setText(form, IDS.dateSignedUnitHead, opts.dateSignedUnitHead);

  /* ---------- signatures (teacher + unit head) ---------- */
  try {
    if (opts.teacherSignature?.base64) {
      await drawSigInBox({
        pdfDoc,
        pageIndex: opts.sigBox?.pageIndex ?? 0,
        base64: opts.teacherSignature.base64,
        mime: opts.teacherSignature.mime || "image/png",
        box: {
          x: opts.sigBox?.x ?? 12,
          y: opts.sigBox?.y ?? 176,
          width:  opts.sigBox?.width  ?? 300,
          height: opts.sigBox?.height ?? 96,
        },
        debug: !!opts.sigBox?.debug,
        tmp: "sig_teacher.bin",
      });
    }

    if (opts.unitHeadSignature?.base64) {
      await drawSigInBox({
        pdfDoc,
        pageIndex: opts.unitHeadSigBox?.pageIndex ?? 0,
        base64: opts.unitHeadSignature.base64,
        mime: opts.unitHeadSignature.mime || "image/png",
        box: {
          x: opts.unitHeadSigBox?.x ?? 12,
          y: opts.unitHeadSigBox?.y ?? 98,
          width:  opts.unitHeadSigBox?.width  ?? 300,
          height: opts.unitHeadSigBox?.height ?? 80,
        },
        debug: !!opts.unitHeadSigBox?.debug,
        tmp: "sig_unithead.bin",
      });
    }
  } catch (e) {
    console.log("Signature embed error:", e?.message || e);
  }

  /* ---------- lock filled fields (optional) ---------- */
  const lock = new Set(Object.values(IDS));
  form.getFields().forEach(f => {
    if (lock.has(f.getName())) {
      try { f.enableReadOnly(); } catch {}
    }
  });

  const base64Pdf = await pdfDoc.saveAsBase64({ dataUri: false });
  const pdfPath = `${FileSystem.documentDirectory}${outName}`;
  // 👇 use string literal to avoid deprecated enum
  await FileSystem.writeAsStringAsync(pdfPath, base64Pdf, { encoding: "base64" });
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
