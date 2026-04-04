import { saveAs } from "file-saver";

function sanitiseFilename(title: string): string {
  return title.replace(/[^a-zA-Z0-9_ -]/g, "").trim() || "document";
}

export async function exportAsPdf(title: string, htmlContent: string) {
  const { default: jsPDF } = await import("jspdf");
  const { default: html2canvas } = await import("html2canvas");

  const container = document.createElement("div");
  Object.assign(container.style, {
    position: "absolute",
    left: "-9999px",
    top: "0",
    width: "700px",
    padding: "40px",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif",
    fontSize: "14px",
    lineHeight: "1.7",
    color: "#222",
    background: "#fff",
  });
  container.innerHTML = htmlContent;
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, { scale: 2, useCORS: true });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth - 20;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let yOffset = 10;
    let remainingHeight = imgHeight;

    while (remainingHeight > 0) {
      pdf.addImage(imgData, "PNG", 10, yOffset, imgWidth, imgHeight);
      remainingHeight -= pageHeight - 20;
      if (remainingHeight > 0) {
        pdf.addPage();
        yOffset = -(imgHeight - remainingHeight) + 10;
      }
    }

    pdf.save(`${sanitiseFilename(title)}.pdf`);
  } finally {
    document.body.removeChild(container);
  }
}

export async function exportAsDocx(title: string, htmlContent: string) {
  const { Document, Packer, Paragraph, TextRun } = await import("docx");

  const lines = htmlContent
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/h[1-3]>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const paragraphs = lines.map(
    (line) =>
      new Paragraph({
        children: [new TextRun({ text: line, size: 24, font: "Calibri" })],
      }),
  );

  const doc = new Document({
    sections: [{ children: paragraphs }],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${sanitiseFilename(title)}.docx`);
}

export function exportAsTxt(title: string, plainText: string) {
  const blob = new Blob([plainText], { type: "text/plain;charset=utf-8" });
  saveAs(blob, `${sanitiseFilename(title)}.txt`);
}
