import { NextRequest } from "next/server";
import { chromium } from "@playwright/test";
import { renderExportHtml } from "../../../lib/exportHtml";
import type { ScriptProject } from "../../../lib/layout";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const project = (await request.json()) as ScriptProject;
  const html = renderExportHtml(project);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1123, height: 794 }, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.emulateMedia({ media: "print" });
    const pdf = await page.pdf({
      format: "A4",
      landscape: true,
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
      preferCSSPageSize: true
    });
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(project.title || "tategaki-script")}.pdf"`
      }
    });
  } finally {
    await browser.close();
  }
}
