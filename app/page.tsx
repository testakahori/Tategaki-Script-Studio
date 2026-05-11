"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  applyRangeStyle,
  createProject,
  getMarginPx,
  hydrateProject,
  layoutProject,
  normalizeText,
  PAGE,
  LaidOutLine,
  PRESERVED_BLANK_LINE,
  ScriptProject,
  sanitizeStyleRanges,
  verticalGlyph
} from "../lib/layout";

const fontOptions = ["Noto Serif JP", "Noto Sans JP", "Yu Mincho", "Yu Gothic"] as const;
const TXT_ONLY_WARNING = "この読み込み欄では .txt ファイルのみ対応しています。DOCXやJSONは専用の読込ボタンを使用してください。";

type HistoryState = {
  past: ScriptProject[];
  future: ScriptProject[];
};

type EditingLine = {
  pageIndex: number;
  lineNumber: number;
  start: number;
  end: number;
  text: string;
  x: number;
  y: number;
};

function clampRange(project: ScriptProject, start: number, end: number) {
  const min = Math.max(0, Math.min(start, end));
  const max = Math.min(project.text.length, Math.max(start, end) + 1);
  return [min, max] as const;
}

function safeJsonFilename(rawName: string) {
  const cleaned = rawName.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_").trim() || "tategaki-script";
  return cleaned.toLowerCase().endsWith(".json") ? cleaned : `${cleaned}.json`;
}

export default function Home() {
  const [project, setProject] = useState<ScriptProject>(() => hydrateProject(createProject()));
  const [history, setHistory] = useState<HistoryState>({ past: [], future: [] });
  const [selectedRange, setSelectedRange] = useState<[number, number] | null>(null);
  const [draftColor, setDraftColor] = useState("#111111");
  const [fontSizeDraft, setFontSizeDraft] = useState(32);
  const [writingMode, setWritingMode] = useState(false);
  const [draftText, setDraftText] = useState(project.text);
  const [editingLine, setEditingLine] = useState<EditingLine | null>(null);
  const [hasUnappliedEdits, setHasUnappliedEdits] = useState(false);
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const [newScriptConfirmOpen, setNewScriptConfirmOpen] = useState(false);
  const [backupJson, setBackupJson] = useState("");
  const [backupFilename, setBackupFilename] = useState("tategaki-script.json");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const dragStart = useRef<number | null>(null);
  const backupTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const displayProject = project;
  const pages = useMemo(() => layoutProject(displayProject), [displayProject]);
  const orderedPages = useMemo(() => {
    const byNumber = new Map(pages.map((page) => [page.pageIndex + 1, page]));
    const rawOrder = project.pageOrder?.filter((pageNumber) => byNumber.has(pageNumber)) ?? [];
    const missing = pages.map((page) => page.pageIndex + 1).filter((pageNumber) => !rawOrder.includes(pageNumber));
    return [...rawOrder, ...missing].map((pageNumber) => byNumber.get(pageNumber)!);
  }, [pages, project.pageOrder]);
  const marginPx = useMemo(() => getMarginPx(displayProject.settings), [displayProject.settings]);
  const pageRanges = useMemo(
    () =>
      pages.map((page) => ({
        start: page.startOffset,
        end: page.endOffset,
        text: displayProject.text.slice(page.startOffset, page.endOffset)
      })),
    [displayProject.text, pages]
  );
  const totalChars = Array.from(displayProject.text).filter((char) => char !== "\n" && char !== "\f" && char !== PRESERVED_BLANK_LINE).length;
  const activePageIndex = useMemo(() => {
    if (!selectedRange) return orderedPages[0]?.pageIndex ?? 0;
    const selectedStart = Math.min(selectedRange[0], selectedRange[1]);
    return pages.find((page) => selectedStart >= page.startOffset && selectedStart < Math.max(page.endOffset, page.startOffset + 1))?.pageIndex ?? 0;
  }, [orderedPages, pages, selectedRange]);
  const activePage = pages[activePageIndex] ?? pages[0];
  const activePageChars = activePage ? Math.max(0, activePage.endOffset - activePage.startOffset) : 0;
  const selectedChars = selectedRange ? Math.max(0, Math.abs(selectedRange[1] - selectedRange[0]) + 1) : 0;

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 2400);
    return () => window.clearTimeout(id);
  }, [notice]);

  const commit = (next: ScriptProject) => {
    setHistory((current) => ({ past: [...current.past.slice(-40), project], future: [] }));
    setProject(hydrateProject({ ...next, updatedAt: new Date().toISOString() }));
    setHasUnsavedChanges(true);
  };

  const updateProject = (patch: Partial<ScriptProject>) => commit({ ...project, ...patch });

  const updateSettings = (key: keyof ScriptProject["settings"], value: number | string | boolean) => {
    commit({ ...project, settings: { ...project.settings, [key]: value } });
  };

  const undo = () => {
    const previous = history.past.at(-1);
    if (!previous) return;
    setHistory({ past: history.past.slice(0, -1), future: [project, ...history.future] });
    setProject(previous);
    setHasUnsavedChanges(true);
  };

  const redo = () => {
    const next = history.future[0];
    if (!next) return;
    setHistory({ past: [...history.past, project], future: history.future.slice(1) });
    setProject(next);
    setHasUnsavedChanges(true);
  };

  const applySelection = (patch: Parameters<typeof applyRangeStyle>[3]) => {
    if (!selectedRange) return;
    const [start, end] = clampRange(displayProject, selectedRange[0], selectedRange[1]);
    commit(applyRangeStyle(project, start, end, patch));
  };

  const readTextFileUtf8 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(reader.error ?? new Error("TXT読み込みに失敗しました"));
      reader.readAsText(file, "UTF-8");
    });

  const isSuspiciousNonTxtContent = (text: string) => {
    const head = text.slice(0, 4096);
    return (
      head.startsWith("PK") ||
      head.includes("<?xml") ||
      head.includes("[Content_Types].xml") ||
      head.includes("word/document.xml") ||
      head.includes("application/vnd.openxmlformats-officedocument")
    );
  };

  const loadTxt = async (file: File) => {
    const name = file.name.toLowerCase();
    if (!name.endsWith(".txt") || (file.type && file.type !== "text/plain")) {
      setNotice({ type: "error", text: TXT_ONLY_WARNING });
      return;
    }

    try {
      const rawText = await readTextFileUtf8(file);
      if (isSuspiciousNonTxtContent(rawText)) {
        setNotice({ type: "error", text: TXT_ONLY_WARNING });
        return;
      }
      const text = normalizeText(rawText);
      commit({ ...project, title: file.name.replace(/\.[^.]+$/, ""), text, styleRanges: [], styleRuns: [], pageOrder: undefined });
    } catch (error) {
      console.error(error);
      setNotice({ type: "error", text: "TXT読み込みに失敗しました" });
    }
  };

  const handleDrop = async (event: React.DragEvent) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) await loadTxt(file);
  };

  const addPage = () => updateProject({ text: `${project.text}\f` });

  const deletePage = (pageIndex: number) => {
    const page = pages[pageIndex];
    const start = page.startOffset;
    const end = page.endOffset;
    if (start === end) return;
    replaceTextRange(start, end, "");
  };

  const movePage = (visualIndex: number, direction: -1 | 1) => {
    const targetIndex = visualIndex + direction;
    if (targetIndex < 0 || targetIndex >= orderedPages.length) return;
    const order = orderedPages.map((page) => page.pageIndex + 1);
    const [item] = order.splice(visualIndex, 1);
    order.splice(targetIndex, 0, item);
    updateProject({ pageOrder: order });
  };

  const startWritingMode = () => {
    setDraftText("");
    setEditingLine(null);
    setHasUnappliedEdits(false);
    setSelectedRange(null);
    setWritingMode(true);
  };

  const openLineEditor = (line: LaidOutLine) => {
    if (!writingMode || line.chars.length === 0) return;
    const indexes = line.chars.map((char) => char.index);
    const start = Math.min(...indexes);
    const end = Math.max(...indexes) + 1;
    const text = project.text.slice(start, end);

    setEditingLine({
      pageIndex: line.pageIndex,
      lineNumber: line.number,
      start,
      end,
      text,
      x: line.x,
      y: line.y
    });
    setDraftText(text);
    setSelectedRange([start, end - 1]);
    setHasUnappliedEdits(false);
  };

  const applyLineEdit = (exitAfter = false) => {
    if (!editingLine) return;
    replaceTextRange(editingLine.start, editingLine.end, draftText);
    const nextEnd = editingLine.start + Math.max(0, draftText.length - 1);
    setSelectedRange(draftText.length > 0 ? [editingLine.start, nextEnd] : null);
    setEditingLine(null);
    setHasUnappliedEdits(false);
    setNotice({ type: "success", text: "行の編集を反映しました" });
    if (exitAfter) setWritingMode(false);
  };

  const insertPreservedLineBreak = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = event.currentTarget;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const insertion = `\n${PRESERVED_BLANK_LINE}\n`;
    const nextText = `${draftText.slice(0, start)}${insertion}${draftText.slice(end)}`;
    const nextCaret = start + insertion.length;

    event.preventDefault();
    setDraftText(nextText);
    setHasUnappliedEdits(editingLine ? nextText !== editingLine.text : true);
    window.requestAnimationFrame(() => {
      textarea.selectionStart = nextCaret;
      textarea.selectionEnd = nextCaret;
    });
  };

  const handleLineEditorKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = event.currentTarget;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    if (event.ctrlKey && event.key === "Enter") {
      insertPreservedLineBreak(event);
      return;
    }

    if (event.key !== "Tab") return;

    event.preventDefault();
    if (event.shiftKey) {
      const beforeSelection = draftText.slice(Math.max(0, start - 2), start);
      if (start === end && beforeSelection === "　　") {
        const nextText = `${draftText.slice(0, start - 2)}${draftText.slice(end)}`;
        const nextCaret = start - 2;
        setDraftText(nextText);
        setHasUnappliedEdits(editingLine ? nextText !== editingLine.text : true);
        window.requestAnimationFrame(() => {
          textarea.selectionStart = nextCaret;
          textarea.selectionEnd = nextCaret;
        });
      }
      return;
    }

    const insertion = "　　";
    const nextText = `${draftText.slice(0, start)}${insertion}${draftText.slice(end)}`;
    const nextCaret = start + insertion.length;
    setDraftText(nextText);
    setHasUnappliedEdits(editingLine ? nextText !== editingLine.text : true);
    window.requestAnimationFrame(() => {
      textarea.selectionStart = nextCaret;
      textarea.selectionEnd = nextCaret;
    });
  };

  const toggleWritingMode = () => {
    if (!writingMode) {
      startWritingMode();
      return;
    }
    if (hasUnappliedEdits) {
      setExitConfirmOpen(true);
      return;
    }
    setWritingMode(false);
    setEditingLine(null);
    setDraftText("");
    setSelectedRange(null);
  };

  const buildExportData = () => {
    const styleRuns = sanitizeStyleRanges(project.styleRuns ?? project.styleRanges, project.text.length);
    const exportPages = pages.map((page) => ({
      pageNumber: page.pageIndex + 1,
      startOffset: page.startOffset,
      endOffset: page.endOffset,
      startLineNumber: page.startLineNumber
    }));

    return {
      version: "1.0.0",
      documentTitle: project.title || "無題の台本",
      plainText: project.text || "",
      styleRuns,
      pages: exportPages,
      marginMm: {
        top: Number(project.settings?.marginTopMm ?? 20),
        right: Number(project.settings?.marginRightMm ?? 20),
        bottom: Number(project.settings?.marginBottomMm ?? 15),
        left: Number(project.settings?.marginLeftMm ?? 20)
      },
      fontFamily: project.settings?.fontFamily || "Noto Serif JP",
      baseFontSize: Number(project.settings?.baseFontSize || 18),
      lineHeight: Number(project.settings?.lineHeight || 2.3),
      palette: Array.isArray(project.palette) ? project.palette : [],
      currentPage: (activePage?.pageIndex ?? 0) + 1,
      pageOrder: project.pageOrder ?? pages.map((page) => page.pageIndex + 1),
      savedAt: new Date().toISOString()
    };
  };

  const exportJsonBackup = () => {
    try {
      const exportData = buildExportData();
      const json = JSON.stringify(exportData, null, 2);

      console.log("JSON backup export data:", exportData);
      console.log("JSON backup export length:", json?.length ?? 0);

      if (!json || json.trim().length === 0) {
        setNotice({ type: "error", text: "JSONデータが空のため書き出せません" });
        return;
      }

      const filename = safeJsonFilename(project.title || "tategaki-script");
      setBackupJson(json);
      setBackupFilename(filename);
      setHasUnsavedChanges(false);
      setLastSavedAt(new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }));
      setNotice({ type: "success", text: "JSONバックアップを作成しました" });
    } catch (error) {
      console.error("JSON backup export failed:", error);
      setNotice({ type: "error", text: `JSONの書き出しに失敗しました：${error instanceof Error ? error.message : String(error)}` });
    }
  };

  const restoreJsonData = (data: unknown) => {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      setNotice({ type: "error", text: "JSONの形式が正しくありません" });
      return false;
    }

    const saved = data as {
      documentTitle?: string;
      plainText?: string;
      styleRuns?: ScriptProject["styleRanges"];
      marginMm?: { top?: number; right?: number; bottom?: number; left?: number };
      fontFamily?: ScriptProject["settings"]["fontFamily"];
      baseFontSize?: number;
      lineHeight?: number;
      palette?: string[];
      pageOrder?: number[];
    };
    const styleRuns = Array.isArray(saved.styleRuns) ? saved.styleRuns : [];
    commit(hydrateProject({
      title: saved.documentTitle || "無題の台本",
      text: saved.plainText || "",
      styleRanges: styleRuns,
      styleRuns,
      settings: {
        fontFamily: saved.fontFamily || "Noto Serif JP",
        baseFontSize: Number(saved.baseFontSize || 18),
        lineHeight: Number(saved.lineHeight || 2.3),
        marginTopMm: Number(saved.marginMm?.top ?? 20),
        marginRightMm: Number(saved.marginMm?.right ?? 20),
        marginBottomMm: Number(saved.marginMm?.bottom ?? 15),
        marginLeftMm: Number(saved.marginMm?.left ?? 20)
      },
      palette: Array.isArray(saved.palette) ? saved.palette : [],
      pageOrder: saved.pageOrder
    }));
    setSelectedRange(null);
    setWritingMode(false);
    setDraftText("");
    setEditingLine(null);
    setHasUnappliedEdits(false);
    setBackupJson("");
    setHasUnsavedChanges(false);
    setLastSavedAt(null);
    return true;
  };

  const loadJsonBackup = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".json")) {
      setNotice({ type: "error", text: "JSON読込は .json ファイルのみ対応しています" });
      return;
    }

    try {
      const raw = await file.text();
      if (!raw || raw.trim().length === 0) {
        setNotice({ type: "error", text: "JSONファイルが空です" });
        return;
      }

      let data: unknown;
      try {
        data = JSON.parse(raw);
      } catch (error) {
        console.error("JSON backup parse failed:", error);
        setNotice({ type: "error", text: "JSONの読み込みに失敗しました。ファイルが壊れている可能性があります。" });
        return;
      }

      if (restoreJsonData(data)) {
        setNotice({ type: "success", text: "JSONを読み込みました" });
      }
    } catch (error) {
      console.error("JSON backup load failed:", error);
      setNotice({ type: "error", text: `JSON読込に失敗しました：${error instanceof Error ? error.message : String(error)}` });
    }
  };

  const selectBackupJson = () => {
    if (!backupJson) return;
    backupTextareaRef.current?.focus();
    backupTextareaRef.current?.select();
    setNotice({ type: "success", text: "JSON全文を選択しました。Ctrl+Cでコピーしてください。" });
  };

  const resetToEmptyDocument = () => {
    const now = new Date().toISOString();
    const emptyProject = hydrateProject({
      ...createProject(),
      title: "無題の台本",
      text: "",
      settings: project.settings,
      palette: project.palette,
      styleRanges: [],
      styleRuns: [],
      pageOrder: undefined,
      createdAt: now,
      updatedAt: now
    });

    setProject(emptyProject);
    setHistory({ past: [], future: [] });
    setSelectedRange(null);
    setDraftColor("#111111");
    setFontSizeDraft(32);
    setWritingMode(false);
    setDraftText("");
    setEditingLine(null);
    setHasUnappliedEdits(false);
    setExitConfirmOpen(false);
    setNewScriptConfirmOpen(false);
    setHasUnsavedChanges(false);
    setLastSavedAt(null);
    dragStart.current = null;
    setNotice({ type: "success", text: "新規原稿を作成しました" });
  };

  const handleNewScript = () => {
    const hasContent = project.text.trim().length > 0 || (writingMode && hasUnappliedEdits);
    if (hasContent) {
      setNewScriptConfirmOpen(true);
      return;
    }

    resetToEmptyDocument();
  };

  const printPdf = () => window.print();

  const onPaperPointerDown = (index: number, line: LaidOutLine) => {
    if (writingMode) {
      openLineEditor(line);
      return;
    }
    dragStart.current = index;
    setSelectedRange([index, index]);
  };

  const onPaperPointerEnter = (index: number) => {
    if (writingMode) return;
    if (dragStart.current === null) return;
    setSelectedRange([dragStart.current, index]);
  };

  const onPointerUp = () => {
    dragStart.current = null;
  };

  const transformStyleRangesForEdit = (ranges: ScriptProject["styleRanges"], start: number, end: number, replacementLength: number) => {
    const delta = replacementLength - (end - start);
    const next = ranges.flatMap((range) => {
      if (range.end <= start) return range;
      if (range.start >= end) return { ...range, start: Math.max(start, range.start + delta), end: Math.max(start, range.end + delta) };
      const pieces = [];
      if (range.start < start) pieces.push({ ...range, end: start });
      if (range.end > end) {
        pieces.push({
          ...range,
          id: crypto.randomUUID(),
          start: start + replacementLength,
          end: range.end + delta
        });
      }
      return pieces;
    });
    return next;
  };

  const replaceTextRange = (start: number, end: number, replacement: string) => {
    const styleRanges = transformStyleRangesForEdit(project.styleRuns ?? project.styleRanges ?? [], start, end, replacement.length);
    commit({
      ...project,
      text: project.text.slice(0, start) + replacement + project.text.slice(end),
      styleRanges,
      styleRuns: styleRanges
    });
  };

  return (
    <main className="app" onPointerUp={onPointerUp}>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">T</div>
          <div>
            <div className="brand-title">TATEGAKI STUDIO</div>
            <input className="title-input" value={project.title} onChange={(event) => updateProject({ title: event.target.value })} />
          </div>
        </div>

        <div className="tools">
          <div className={`save-status ${hasUnsavedChanges ? "dirty" : "saved"}`}>
            {hasUnsavedChanges ? "未保存の編集があります" : lastSavedAt ? `保存済み ${lastSavedAt}` : "保存済み"}
          </div>
          <span className="tools-label">TOOLS:</span>
          <button title="Undo" onMouseDown={(event) => event.preventDefault()} onClick={undo} disabled={!history.past.length}>↶</button>
          <button title="Redo" onMouseDown={(event) => event.preventDefault()} onClick={redo} disabled={!history.future.length}>↷</button>
          <button className={writingMode ? "active-tool" : ""} onClick={toggleWritingMode}>執筆モード</button>
          {writingMode && editingLine && <button className="active-tool" onClick={() => applyLineEdit(false)}>行を反映</button>}
          <button title="太字" onMouseDown={(event) => event.preventDefault()} onClick={() => applySelection({ bold: true })}>B</button>
          <div className="palette">
            {project.palette.map((color) => (
              <button key={color} className="swatch" title={color} style={{ background: color }} onMouseDown={(event) => event.preventDefault()} onClick={() => applySelection({ color })} />
            ))}
            <input title="文字色" type="color" value={draftColor} onChange={(event) => setDraftColor(event.target.value)} />
            <button onClick={() => updateProject({ palette: [...project.palette, draftColor] })}>追加</button>
          </div>
          <label className="compact-field">
            T
            <input type="number" min="8" max="48" value={fontSizeDraft} onChange={(event) => setFontSizeDraft(Number(event.target.value))} />
            <button onMouseDown={(event) => event.preventDefault()} onClick={() => applySelection({ fontSize: fontSizeDraft })}>適用</button>
          </label>
          <button className="primary" onClick={printPdf}>PDF書き出し</button>
        </div>
      </header>
      {notice && <div className={`notice ${notice.type}`}>{notice.text}</div>}

      <aside className="left-panel">
        <section>
          <h2>APPEARANCE</h2>
          <label>
            FONT FAMILY
            <select value={project.settings.fontFamily} onChange={(event) => updateSettings("fontFamily", event.target.value)}>
              {fontOptions.map((font) => <option key={font}>{font}</option>)}
            </select>
          </label>
          <label>
            BASE FONT SIZE (PX)
            <input type="number" min="10" max="36" value={project.settings.baseFontSize} onChange={(event) => updateSettings("baseFontSize", Number(event.target.value))} />
          </label>
          <label>
            LINE HEIGHT <b>{project.settings.lineHeight.toFixed(1)}</b>
            <input type="range" min="1.4" max="3.2" step="0.1" value={project.settings.lineHeight} onChange={(event) => updateSettings("lineHeight", Number(event.target.value))} />
          </label>
          <div className="margin-grid">
            {(["marginTopMm", "marginRightMm", "marginBottomMm", "marginLeftMm"] as const).map((key) => (
              <label key={key}>
                {key.replace("margin", "").replace("Mm", "").toUpperCase()} (mm)
                <input type="number" min="0" max="80" step="0.5" value={project.settings[key]} onChange={(event) => updateSettings(key, Number(event.target.value))} />
              </label>
            ))}
          </div>
        </section>

        <section>
          <h2>IMPORT</h2>
          <label className="dropzone" onDrop={handleDrop} onDragOver={(event) => event.preventDefault()}>
            <input type="file" accept=".txt,text/plain" onChange={(event) => event.target.files?.[0] && loadTxt(event.target.files[0])} />
            <span>ここにtxtをドロップ</span>
          </label>
          <p className="import-note">TXT読み込みは上の枠へドロップしてください。</p>
          <p className="import-note">編集データを保存したい場合は、ファイル保存を押してください。</p>
          <div className="file-row">
            <button onClick={exportJsonBackup}>ファイル保存</button>
            <label className="file-button">
              ファイル読込
              <input
                type="file"
                accept=".json,application/json"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void loadJsonBackup(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
          </div>
        </section>

        <section>
          <h2>DOCUMENT INFO</h2>
          <div className="document-info">
            <div><span>タイトル</span><b>{displayProject.title || "無題の台本"}</b></div>
            <div><span>ページ</span><b>{(activePage?.pageIndex ?? 0) + 1} / {pages.length}</b></div>
            <div><span>文字数</span><b>{activePageChars} / {totalChars}</b></div>
            <div><span>選択範囲</span><b>{selectedChars}文字</b></div>
          </div>
        </section>
      </aside>

      <section className="workspace">
        <button className="add-page" onClick={addPage}>＋</button>
        {writingMode && (
          <div className="writing-guide">
            <div className="guide-line">
              <b>執筆モード</b>
              <span>直したい縦行の文字、または行番号をクリックしてください。</span>
            </div>
            <div className="guide-line guide-shortcuts">
              <span>Ctrl+Enter：空行を保持して改行、Tab：2文字下げ、Shift+Tab：2文字下げ解除</span>
            </div>
          </div>
        )}
        <div className="page-strip">
          {orderedPages.map((page) => (
            <article
              className="paper"
              key={page.pageIndex}
              style={{
                width: PAGE.width,
                height: PAGE.height,
                fontFamily: `"${displayProject.settings.fontFamily}", "Noto Serif JP", serif`
              }}
            >
              {page.lines.map((line) => (
                <div key={`${page.pageIndex}-${line.number}`}>
                  <div
                    className="line-number"
                    data-editing={editingLine?.lineNumber === line.number && editingLine?.pageIndex === line.pageIndex}
                    style={{ left: line.x - 4, top: Math.max(10, marginPx.top - 24) }}
                    onPointerDown={() => openLineEditor(line)}
                  >
                    {line.number}
                  </div>
                  {line.chars.map((char) => (
                    <span
                      key={char.index}
                      className="glyph"
                      data-selected={selectedRange ? char.index >= Math.min(...selectedRange) && char.index <= Math.max(...selectedRange) : false}
                      data-editing={editingLine?.lineNumber === line.number && editingLine?.pageIndex === line.pageIndex}
                      style={{
                        left: char.x,
                        top: char.y,
                        width: displayProject.settings.baseFontSize,
                        height: Math.max(displayProject.settings.baseFontSize, char.style.fontSize * 1.15),
                        fontSize: char.style.fontSize,
                        fontWeight: char.style.bold ? 700 : 400,
                        color: char.style.color
                      }}
                      onPointerDown={() => onPaperPointerDown(char.index, line)}
                      onPointerEnter={() => onPaperPointerEnter(char.index)}
                    >
                      {char.style.ruby ? <ruby>{verticalGlyph(char.char)}<rt>{char.style.ruby}</rt></ruby> : verticalGlyph(char.char)}
                    </span>
                  ))}
                  {writingMode && editingLine?.lineNumber === line.number && editingLine?.pageIndex === line.pageIndex && (
                    <div
                      className="line-edit-panel"
                      style={{
                        left: Math.max(18, Math.min(PAGE.width - 342, line.x - 320)),
                        top: Math.max(18, Math.min(PAGE.height - 176, line.y + 34))
                      }}
                    >
                      <b>{line.number}行目を編集</b>
                      <textarea
                        value={draftText}
                        onKeyDown={handleLineEditorKeyDown}
                        onChange={(event) => {
                          setDraftText(event.target.value);
                          setHasUnappliedEdits(event.target.value !== editingLine.text);
                        }}
                        spellCheck={false}
                      />
                      <div>
                        <button className="primary" onClick={() => applyLineEdit(false)}>反映</button>
                        <button onClick={() => {
                          setDraftText("");
                          setEditingLine(null);
                          setHasUnappliedEdits(false);
                          setSelectedRange(null);
                        }}>
                          キャンセル
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </article>
          ))}
        </div>
      </section>

      <aside className="right-panel">
        <h2>COLLECTION</h2>
        <button className="new-collection" onClick={handleNewScript}>新規作成</button>
        <h2>CURRENT SEGMENTS</h2>
        <div className="page-list">
          {orderedPages.map((page, visualIndex) => (
            <div key={page.pageIndex} className="page-card">
              <button>P.{page.pageIndex + 1}</button>
              <div>
                <button onClick={() => movePage(visualIndex, -1)} disabled={visualIndex === 0}>↑</button>
                <button onClick={() => movePage(visualIndex, 1)} disabled={visualIndex === orderedPages.length - 1}>↓</button>
                <button onClick={() => deletePage(page.pageIndex)} disabled={pages.length === 1}>削除</button>
              </div>
              <small>{page.lines.length} lines</small>
            </div>
          ))}
        </div>
      </aside>
      {exitConfirmOpen && (
        <div className="confirm-modal">
          <div className="confirm-box">
            <b>未反映の編集があります。反映せずに執筆モードを終了しますか？</b>
            <div>
              <button className="primary" onClick={() => { setExitConfirmOpen(false); applyLineEdit(true); }}>反映して終了</button>
              <button onClick={() => { setExitConfirmOpen(false); setHasUnappliedEdits(false); setWritingMode(false); }}>破棄して終了</button>
              <button onClick={() => setExitConfirmOpen(false)}>キャンセル</button>
            </div>
          </div>
        </div>
      )}
      {newScriptConfirmOpen && (
        <div className="confirm-modal">
          <div className="confirm-box">
            <b>現在の原稿を破棄して、新規作成しますか？この操作は元に戻せません。</b>
            <div>
              <button className="primary" onClick={resetToEmptyDocument}>新規作成する</button>
              <button onClick={() => setNewScriptConfirmOpen(false)}>キャンセル</button>
            </div>
          </div>
        </div>
      )}
      {backupJson && (
        <div className="confirm-modal">
          <div className="backup-box">
            <b>JSONバックアップ</b>
            <div className="backup-instructions">
              <p>①全選択を押す</p>
              <p>②Ctrl+C（コピー）</p>
              <p>③メモ帳に貼り付けて名前をつけて保存</p>
              <p>④右クリックで名前を変更するを押し、拡張子を「txt」から「json」に書き換えて保存</p>
            </div>
            <textarea ref={backupTextareaRef} readOnly value={backupJson} />
            <div>
              <button onClick={selectBackupJson}>全選択</button>
              <button className="primary" onClick={() => setBackupJson("")}>閉じる</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
