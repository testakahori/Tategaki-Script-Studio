import { NextRequest } from "next/server";

function safeFilename(rawName: string) {
  const base = rawName
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .trim() || "tategaki-script";
  return base.toLowerCase().endsWith(".json") ? base : `${base}.json`;
}

function contentDisposition(filename: string) {
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, "_");
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const payload = String(formData.get("payload") ?? "");
    const filename = safeFilename(String(formData.get("filename") ?? "tategaki-script.json"));

    if (!payload || payload.trim().length === 0) {
      return Response.json({ error: "JSON payload is empty" }, { status: 400 });
    }

    let normalizedJson = payload;
    try {
      normalizedJson = JSON.stringify(JSON.parse(payload), null, 2);
    } catch {
      return Response.json({ error: "JSON payload is invalid" }, { status: 400 });
    }

    return new Response(normalizedJson, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": contentDisposition(filename),
        "Content-Length": String(new TextEncoder().encode(normalizedJson).length),
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    console.error("JSON export route failed:", error);
    return Response.json({ error: "JSON export failed" }, { status: 500 });
  }
}
