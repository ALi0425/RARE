import path from "path";
import fs from "fs";
import mammoth from "mammoth";

// Dynamic imports for heavy packages (loaded only when needed)
let pdfParse: any = null;
let xlsx: any = null;
let AdmZip: any = null;

async function getPdfParse() {
  if (!pdfParse) pdfParse = await import("pdf-parse");
  return pdfParse;
}

async function getXlsx() {
  if (!xlsx) xlsx = (await import("xlsx")).default ?? (await import("xlsx"));
  return xlsx;
}

async function getAdmZip() {
  if (!AdmZip) AdmZip = (await import("adm-zip")).default ?? (await import("adm-zip"));
  return AdmZip;
}

// ── Public API ──

/**
 * Extract text from a file. Returns null for unsupported formats.
 */
export async function extractText(filePath: string, originalName: string): Promise<string | null> {
  const ext = path.extname(originalName).toLowerCase();
  if (!fs.existsSync(filePath)) return null;

  try {
    switch (ext) {
      case ".docx": return await extractDocx(filePath);
      case ".pptx": return await extractPptx(filePath);
      case ".xlsx":
      case ".xls":  return await extractXlsx(filePath);
      case ".pdf":  return await extractPdf(filePath);
      case ".txt":
      case ".md":
      case ".json":
      case ".csv":
      case ".xml":
      case ".yaml":
      case ".yml":
      case ".toml":
      case ".ini":
      case ".ts":
      case ".js":
      case ".tsx":
      case ".jsx":
      case ".html":
      case ".css":
      case ".sql":
        return fs.readFileSync(filePath, "utf-8");
      default:
        return null;
    }
  } catch (err) {
    console.warn(`[extractText] failed for ${originalName}:`, err);
    return null;
  }
}

/**
 * Extract text from a buffer (for uploaded files not yet saved to disk).
 */
export async function extractTextFromBuffer(buffer: Buffer, ext: string): Promise<string | null> {
  ext = ext.startsWith(".") ? ext.toLowerCase() : "." + ext.toLowerCase();
  try {
    switch (ext) {
      case ".docx": return await extractDocxBuffer(buffer);
      case ".pptx": return await extractPptxBuffer(buffer);
      case ".xlsx":
      case ".xls":  return await extractXlsxBuffer(buffer);
      case ".pdf":  return await extractPdfBuffer(buffer);
      default:
        // Try as UTF-8 text
        const text = buffer.toString("utf-8");
        if (isBinaryGarbage(text)) return null;
        return text;
    }
  } catch (err) {
    console.warn(`[extractTextFromBuffer] failed for ${ext}:`, err);
    return null;
  }
}

// ── Docx ──

async function extractDocx(filePath: string): Promise<string> {
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value || "";
}

async function extractDocxBuffer(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value || "";
}

// ── Pptx ──

async function extractPptx(filePath: string): Promise<string> {
  const Zip = await getAdmZip();
  const zip = new Zip(filePath);
  return extractPptxFromZip(zip);
}

async function extractPptxBuffer(buffer: Buffer): Promise<string> {
  const Zip = await getAdmZip();
  const zip = new Zip(buffer);
  return extractPptxFromZip(zip);
}

function extractPptxFromZip(zip: any): string {
  const entries = zip.getEntries();
  const texts: string[] = [];
  for (const entry of entries) {
    if (entry.entryName?.startsWith("ppt/slides/slide") && entry.entryName?.endsWith(".xml")) {
      const xml = entry.getData().toString("utf-8");
      // Extract text from <a:t> elements
      const matches = xml.match(/<a:t[^>]*>([^<]+)<\/a:t>/g) || [];
      for (const m of matches) {
        const t = m.replace(/<[^>]+>/g, "").trim();
        if (t) texts.push(t);
      }
    }
  }
  return texts.join("\n");
}

// ── Xlsx ──

async function extractXlsx(filePath: string): Promise<string> {
  const X = await getXlsx();
  const wb = X.readFile(filePath, { type: "file", cellDates: false });
  return extractTextFromWorkbook(wb);
}

async function extractXlsxBuffer(buffer: Buffer): Promise<string> {
  const X = await getXlsx();
  const wb = X.read(buffer, { type: "buffer", cellDates: false });
  return extractTextFromWorkbook(wb);
}

function extractTextFromWorkbook(wb: any): string {
  const lines: string[] = [];
  const X = require('xlsx'); // already loaded, safe to require
  for (const name of wb.SheetNames || []) {
    const sheet = wb.Sheets[name];
    const json = X.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
    for (const row of json) {
      const cells = (row || []).filter((c: any) => c != null).map(String);
      if (cells.length > 0) lines.push(cells.join("\t"));
    }
  }
  return lines.join("\n");
}

// ── Pdf ──

async function extractPdf(filePath: string): Promise<string> {
  const buf = fs.readFileSync(filePath);
  return extractPdfBuffer(buf);
}

async function extractPdfBuffer(buffer: Buffer): Promise<string> {
  const { PDFParse } = await getPdfParse();
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  return result.text || "";
}

// ── Binary garbage detection (shared with inference.ts) ──

function isBinaryGarbage(text: string): boolean {
  if (!text) return false;
  if (text.includes("�")) return true;
  if (text.includes("\0")) return true;
  let ctrlCount = 0;
  const len = Math.min(text.length, 2000);
  for (let i = 0; i < len; i++) {
    const code = text.charCodeAt(i);
    if (code === 0 || (code < 32 && code !== 10 && code !== 13 && code !== 9)) {
      ctrlCount++;
    }
  }
  return ctrlCount > Math.max(20, len * 0.1);
}
