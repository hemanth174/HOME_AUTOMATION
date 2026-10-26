import fs from "node:fs";
import { jsPDF } from "jspdf";

const sourcePath = "docs/VikaTech_Device_Management_Test_Plan.md";
const outputPath = "docs/VikaTech_Device_Management_Test_Plan.pdf";
const markdown = fs.readFileSync(sourcePath, "utf8");
const pdf = new jsPDF({ unit: "pt", format: "a4" });
const pageWidth = pdf.internal.pageSize.getWidth();
const pageHeight = pdf.internal.pageSize.getHeight();
const margin = 42;
const contentWidth = pageWidth - margin * 2;
let y = 48;

function ensureSpace(height) {
  if (y + height <= pageHeight - 42) return;
  pdf.addPage();
  y = 48;
}

function writeLine(text, size, weight = "normal", color = [38, 48, 58], gap = 4) {
  pdf.setFont("helvetica", weight);
  pdf.setFontSize(size);
  pdf.setTextColor(...color);
  const lines = pdf.splitTextToSize(text || " ", contentWidth);
  const lineHeight = size * 1.35;
  ensureSpace(lines.length * lineHeight + gap);
  pdf.text(lines, margin, y);
  y += lines.length * lineHeight + gap;
}

for (const rawLine of markdown.split(/\r?\n/)) {
  const line = rawLine.trimEnd();
  if (!line.trim()) {
    y += 5;
    continue;
  }
  if (line.startsWith("```")) continue;
  if (/^\|\s*-+/.test(line)) continue;

  if (line.startsWith("# ")) {
    writeLine(line.slice(2), 21, "bold", [9, 83, 70], 9);
    continue;
  }
  if (line.startsWith("## ")) {
    ensureSpace(34);
    writeLine(line.slice(3), 14, "bold", [9, 83, 70], 6);
    continue;
  }
  if (line.startsWith("### ")) {
    writeLine(line.slice(4), 11, "bold", [24, 74, 86], 4);
    continue;
  }
  if (line.startsWith("|")) {
    const cells = line.split("|").map((cell) => cell.trim()).filter(Boolean);
    writeLine(cells.join(" | "), 7.5, "normal", [62, 72, 82], 2);
    continue;
  }
  if (/^\d+\.\s/.test(line)) {
    writeLine(line, 8.5, "normal", [38, 48, 58], 2);
    continue;
  }
  if (line.startsWith("- ")) {
    writeLine("- " + line.slice(2), 8.5, "normal", [38, 48, 58], 2);
    continue;
  }
  if (line.startsWith("```")) continue;
  writeLine(line, 8.5, "normal", [38, 48, 58], 3);
}

const pages = pdf.getNumberOfPages();
for (let page = 1; page <= pages; page += 1) {
  pdf.setPage(page);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7);
  pdf.setTextColor(110, 120, 128);
  pdf.text("VikaTech Device Management Test and Deployment Manual", margin, pageHeight - 22);
  pdf.text(`Page ${page} of ${pages}`, pageWidth - margin, pageHeight - 22, { align: "right" });
}

fs.writeFileSync(outputPath, Buffer.from(pdf.output("arraybuffer")));
console.log(`Wrote ${outputPath} (${pages} pages)`);
