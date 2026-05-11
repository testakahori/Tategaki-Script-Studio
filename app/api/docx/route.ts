import { NextRequest } from "next/server";
import { Document, Packer, PageTextDirectionType, Paragraph, PageOrientation, SectionType, TextRun } from "docx";
import type { ScriptProject } from "../../../lib/layout";
import { hydrateProject, layoutProject, verticalGlyph } from "../../../lib/layout";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const project = hydrateProject((await request.json()) as ScriptProject);
  const pages = layoutProject(project);
  const children: Paragraph[] = [];

  for (const page of pages) {
    for (const line of page.lines) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${line.number}　`, color: "9A9188", size: 16 }),
            ...line.chars.map(
              (char) =>
                new TextRun({
                  text: verticalGlyph(char.char),
                  bold: char.style.bold,
                  color: char.style.color.replace("#", ""),
                  size: Math.round(char.style.fontSize * 2),
                  font: project.settings.fontFamily
                })
            )
          ]
        })
      );
    }
    children.push(new Paragraph({ children: [new TextRun({ text: "" })], pageBreakBefore: true }));
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          type: SectionType.CONTINUOUS,
          page: {
            size: { orientation: PageOrientation.LANDSCAPE },
            textDirection: PageTextDirectionType.TOP_TO_BOTTOM_RIGHT_TO_LEFT,
            margin: {
              top: Math.round(project.settings.marginTopMm * 56.692913386),
              right: Math.round(project.settings.marginRightMm * 56.692913386),
              bottom: Math.round(project.settings.marginBottomMm * 56.692913386),
              left: Math.round(project.settings.marginLeftMm * 56.692913386)
            }
          }
        },
        children
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(project.title || "tategaki-script")}.docx"`
    }
  });
}
