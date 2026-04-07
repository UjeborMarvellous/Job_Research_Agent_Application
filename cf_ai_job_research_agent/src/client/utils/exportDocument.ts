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
    const usableHeight = pageHeight - 20;

    const pageCount = Math.ceil(imgHeight / usableHeight);
    for (let i = 0; i < pageCount; i++) {
      if (i > 0) pdf.addPage();
      const yPos = -(i * usableHeight) + 10;
      pdf.addImage(imgData, "PNG", 10, yPos, imgWidth, imgHeight);
    }

    pdf.save(`${sanitiseFilename(title)}.pdf`);
  } finally {
    document.body.removeChild(container);
  }
}

export async function exportAsDocx(title: string, htmlContent: string) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import("docx");

  const parsed = new DOMParser().parseFromString(htmlContent, "text/html");
  const body = parsed.body;

  type TR = InstanceType<typeof TextRun>;
  type P = InstanceType<typeof Paragraph>;

  function getInlineRuns(node: Node): TR[] {
    const runs: TR[] = [];
    function walk(n: Node, bold = false, italics = false) {
      if (n.nodeType === Node.TEXT_NODE) {
        const text = n.textContent ?? "";
        if (text) runs.push(new TextRun({ text, bold, italics, size: 24, font: "Calibri" }));
      } else if (n.nodeType === Node.ELEMENT_NODE) {
        const el = n as Element;
        const tag = el.tagName.toLowerCase();
        const b = bold || tag === "strong" || tag === "b";
        const i = italics || tag === "em" || tag === "i";
        for (const child of Array.from(el.childNodes)) walk(child, b, i);
      }
    }
    walk(node);
    return runs;
  }

  const paragraphs: P[] = [];

  function processNode(node: Node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    if (tag === "h1") {
      paragraphs.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: getInlineRuns(el) }));
    } else if (tag === "h2") {
      paragraphs.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: getInlineRuns(el) }));
    } else if (tag === "h3") {
      paragraphs.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: getInlineRuns(el) }));
    } else if (tag === "p") {
      const runs = getInlineRuns(el);
      if (runs.length > 0) paragraphs.push(new Paragraph({ children: runs }));
    } else if (tag === "ul") {
      for (const li of Array.from(el.querySelectorAll(":scope > li"))) {
        paragraphs.push(new Paragraph({ bullet: { level: 0 }, children: getInlineRuns(li) }));
      }
    } else if (tag === "ol") {
      let idx = 1;
      for (const li of Array.from(el.querySelectorAll(":scope > li"))) {
        const runs = getInlineRuns(li);
        paragraphs.push(new Paragraph({
          children: [new TextRun({ text: `${idx}. `, bold: false, size: 24, font: "Calibri" }), ...runs],
        }));
        idx++;
      }
    } else {
      const runs = getInlineRuns(el);
      if (runs.length > 0) paragraphs.push(new Paragraph({ children: runs }));
    }
  }

  for (const child of Array.from(body.childNodes)) processNode(child);

  if (paragraphs.length === 0) {
    paragraphs.push(new Paragraph({ children: [new TextRun({ text: "", font: "Calibri", size: 24 })] }));
  }

  const doc = new Document({ sections: [{ children: paragraphs }] });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${sanitiseFilename(title)}.docx`);
}

export function exportAsTxt(title: string, plainText: string) {
  const blob = new Blob([plainText], { type: "text/plain;charset=utf-8" });
  saveAs(blob, `${sanitiseFilename(title)}.txt`);
}
