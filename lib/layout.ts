export type FontFamily = "Noto Serif JP" | "Noto Sans JP" | "Yu Mincho" | "Yu Gothic";

export type ScriptSettings = {
  fontFamily: FontFamily;
  baseFontSize: number;
  lineHeight: number;
  marginTopMm: number;
  marginRightMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
};

export type StyleRange = {
  id: string;
  start: number;
  end: number;
  bold?: boolean;
  color?: string;
  fontSize?: number;
  ruby?: string;
};

export type ScriptProject = {
  version: 1;
  title: string;
  text: string;
  settings: ScriptSettings;
  palette: string[];
  styleRanges: StyleRange[];
  styleRuns?: StyleRange[];
  pageOrder?: number[];
  createdAt: string;
  updatedAt: string;
};

export type LaidOutChar = {
  char: string;
  index: number;
  x: number;
  y: number;
  style: ResolvedStyle;
};

export type ResolvedStyle = {
  bold: boolean;
  color: string;
  fontSize: number;
  scale: number;
  ruby?: string;
};

export type LaidOutLine = {
  pageIndex: number;
  number: number;
  x: number;
  y: number;
  chars: LaidOutChar[];
};

export type LaidOutPage = {
  pageIndex: number;
  lines: LaidOutLine[];
  startOffset: number;
  endOffset: number;
  startLineNumber: number;
};

export const APP_VERSION = "1.0.0";
export const MM_TO_PX = 3.7795275591;
export const PRESERVED_BLANK_LINE = "\u200B";

export const PAGE = {
  width: 297 * MM_TO_PX,
  height: 210 * MM_TO_PX,
  widthMm: 297,
  heightMm: 210
};

export const defaultSettings: ScriptSettings = {
  fontFamily: "Noto Serif JP",
  baseFontSize: 18,
  lineHeight: 2.3,
  marginTopMm: 20,
  marginRightMm: 20,
  marginBottomMm: 15,
  marginLeftMm: 20
};

export const defaultPalette = ["#161616", "#e11d48", "#2563eb", "#16a34a", "#7c3aed", "#78716c"];

const OPENING = new Set(["「", "『", "（", "(", "［", "【", "《", "〈"]);
const FORBIDDEN_LINE_START = new Set([
  "、",
  "。",
  "，",
  "．",
  ",",
  ".",
  "」",
  "』",
  "）",
  ")",
  "］",
  "】",
  "》",
  "〉",
  "ー",
  "々",
  "ゝ",
  "ゞ",
  "…",
  "!"
]);

export function createProject(): ScriptProject {
  const now = new Date().toISOString();
  return {
    version: 1,
    title: "無題の台本",
    text: "",
    settings: defaultSettings,
    palette: defaultPalette,
    styleRanges: [],
    createdAt: now,
    updatedAt: now
  };
}

export function normalizeText(input: string) {
  return input
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, "　")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== "")
    .join("\n");
}

export function mmToPx(mm: number) {
  return mm * MM_TO_PX;
}

export function pxToMm(px: number) {
  return Math.round((px / MM_TO_PX) * 10) / 10;
}

export function getMarginPx(settings: ScriptSettings) {
  return {
    top: mmToPx(settings.marginTopMm),
    right: mmToPx(settings.marginRightMm),
    bottom: mmToPx(settings.marginBottomMm),
    left: mmToPx(settings.marginLeftMm)
  };
}

export function verticalGlyph(char: string) {
  if (char === "…") return "︙";
  if (char === "―" || char === "—" || char === "-") return "︱";
  return char;
}

export function sanitizeStyleRanges(ranges: StyleRange[] | undefined, textLength: number): StyleRange[] {
  if (!ranges) return [];
  return ranges
    .map((range) => ({
      id: range.id || crypto.randomUUID(),
      start: Math.max(0, Math.min(textLength, Math.floor(range.start))),
      end: Math.max(0, Math.min(textLength, Math.floor(range.end))),
      bold: range.bold,
      color: range.color,
      fontSize: range.fontSize,
      ruby: range.ruby
    }))
    .filter((range) => {
      const hasStyle = range.bold !== undefined || Boolean(range.color) || Boolean(range.fontSize) || Boolean(range.ruby);
      const validSize = range.fontSize === undefined || (Number.isFinite(range.fontSize) && range.fontSize >= 6 && range.fontSize <= 96);
      return range.start < range.end && hasStyle && validSize;
    });
}

export function hydrateProject(input: Partial<ScriptProject>): ScriptProject {
  const base = createProject();
  const imported = input as Partial<ScriptProject> & {
    version?: string | number;
    documentTitle?: string;
    page?: { marginMm?: { top?: number; right?: number; bottom?: number; left?: number } };
    typography?: Partial<Pick<ScriptSettings, "fontFamily" | "baseFontSize" | "lineHeight">>;
    content?: { plainText?: string; styleRuns?: StyleRange[] };
  };
  const legacySettings = input.settings as Partial<ScriptSettings> & {
    marginTop?: number;
    marginRight?: number;
    marginBottom?: number;
    marginLeft?: number;
  } | undefined;
  const settings: ScriptSettings = {
    ...base.settings,
    ...(input.settings ?? {}),
    ...(imported.typography ?? {}),
    marginTopMm: imported.page?.marginMm?.top ?? legacySettings?.marginTopMm ?? (legacySettings?.marginTop !== undefined ? pxToMm(legacySettings.marginTop) : base.settings.marginTopMm),
    marginRightMm: imported.page?.marginMm?.right ?? legacySettings?.marginRightMm ?? (legacySettings?.marginRight !== undefined ? pxToMm(legacySettings.marginRight) : base.settings.marginRightMm),
    marginBottomMm: imported.page?.marginMm?.bottom ?? legacySettings?.marginBottomMm ?? (legacySettings?.marginBottom !== undefined ? pxToMm(legacySettings.marginBottom) : base.settings.marginBottomMm),
    marginLeftMm: imported.page?.marginMm?.left ?? legacySettings?.marginLeftMm ?? (legacySettings?.marginLeft !== undefined ? pxToMm(legacySettings.marginLeft) : base.settings.marginLeftMm)
  };
  const text = normalizeText(imported.content?.plainText ?? input.text ?? base.text);
  const styleRanges = sanitizeStyleRanges(imported.content?.styleRuns ?? input.styleRuns ?? input.styleRanges, text.length);
  return {
    ...base,
    ...input,
    version: 1,
    title: imported.documentTitle ?? input.title ?? base.title,
    text,
    settings,
    palette: input.palette ?? base.palette,
    styleRanges,
    styleRuns: styleRanges,
    pageOrder: input.pageOrder,
    createdAt: input.createdAt ?? base.createdAt,
    updatedAt: input.updatedAt ?? new Date().toISOString()
  };
}

export function serializeProject(project: ScriptProject) {
  const hydrated = hydrateProject(project);
  const styleRuns = sanitizeStyleRanges(hydrated.styleRuns ?? hydrated.styleRanges, hydrated.text.length);
  const pages = layoutProject({ ...hydrated, styleRanges: styleRuns, styleRuns });
  return {
    version: APP_VERSION,
    documentTitle: hydrated.title,
    page: {
      size: "A4",
      orientation: "landscape",
      marginMm: {
        top: hydrated.settings.marginTopMm,
        right: hydrated.settings.marginRightMm,
        bottom: hydrated.settings.marginBottomMm,
        left: hydrated.settings.marginLeftMm
      }
    },
    typography: {
      fontFamily: hydrated.settings.fontFamily,
      baseFontSize: hydrated.settings.baseFontSize,
      lineHeight: hydrated.settings.lineHeight
    },
    content: {
      plainText: hydrated.text,
      styleRuns
    },
    palette: hydrated.palette,
    currentPage: 1,
    lineNumberStart: 1,
    pageOrder: hydrated.pageOrder ?? pages.map((page) => page.pageIndex + 1),
    pages: pages.map((page) => ({
      pageNumber: page.pageIndex + 1,
      startOffset: page.startOffset,
      endOffset: page.endOffset,
      startLineNumber: page.startLineNumber
    }))
  };
}

export function allStyleRanges(project: ScriptProject) {
  return sanitizeStyleRanges(project.styleRuns ?? project.styleRanges, project.text.length);
}

export function resolveStyle(index: number, ranges: StyleRange[], baseFontSize: number): ResolvedStyle {
  const style: ResolvedStyle = { bold: false, color: "#161616", fontSize: baseFontSize, scale: 1 };
  for (const range of ranges) {
    if (index >= range.start && index < range.end) {
      if (range.bold !== undefined) style.bold = range.bold;
      if (range.color) style.color = range.color;
      if (range.fontSize) style.fontSize = range.fontSize;
      if (range.ruby) style.ruby = range.ruby;
    }
  }
  style.scale = style.fontSize / baseFontSize;
  return style;
}

export function layoutProject(project: ScriptProject): LaidOutPage[] {
  const projectWithDefaults = hydrateProject(project);
  const { settings } = projectWithDefaults;
  const styleRanges = allStyleRanges(projectWithDefaults);
  const margin = getMarginPx(settings);
  const contentWidth = Math.max(1, PAGE.width - margin.left - margin.right);
  const contentHeight = Math.max(1, PAGE.height - margin.top - margin.bottom);
  const lineAdvance = settings.baseFontSize * settings.lineHeight;
  const linesPerPage = Math.max(1, Math.floor(contentWidth / lineAdvance));
  const charAdvance = settings.baseFontSize * 1.12;
  const chars = Array.from(normalizeText(projectWithDefaults.text));
  const pages: LaidOutPage[] = [{ pageIndex: 0, lines: [], startOffset: 0, endOffset: 0, startLineNumber: 1 }];
  let globalIndex = 0;
  let lineNumber = 1;
  let pageIndex = 0;
  let lineInPage = 0;

  const advanceForIndex = (index: number) => {
    const style = resolveStyle(index, styleRanges, settings.baseFontSize);
    return Math.max(charAdvance, style.fontSize * 1.15);
  };

  const createPage = (startOffset: number) => {
    pageIndex += 1;
    lineInPage = 0;
    pages.push({ pageIndex, lines: [], startOffset, endOffset: startOffset, startLineNumber: lineNumber });
  };

  const pushLine = (lineItems: Array<{ char: string; index: number }>, startIndex: number, endIndex: number) => {
    if (lineInPage >= linesPerPage) {
      createPage(startIndex);
    }
    const x = PAGE.width - margin.right - lineInPage * lineAdvance - settings.baseFontSize;
    const y = margin.top;
    let cursorY = margin.top;
    const laidOutChars = lineItems.map(({ char, index }) => {
      const style = resolveStyle(index, styleRanges, settings.baseFontSize);
      const laidOut = {
        char,
        index,
        x,
        y: cursorY,
        style
      };
      cursorY += advanceForIndex(index);
      return laidOut;
    });
    pages[pageIndex].lines.push({ pageIndex, number: lineNumber, x, y, chars: laidOutChars });
    pages[pageIndex].endOffset = Math.max(pages[pageIndex].endOffset, endIndex);
    lineNumber += 1;
    lineInPage += 1;
  };

  if (chars.length === 0) {
    pushLine([], 0, 0);
    return pages;
  }

  while (globalIndex < chars.length) {
    if (chars[globalIndex] === "\f") {
      if (pages[pageIndex].lines.length > 0) {
        createPage(globalIndex + 1);
      }
      lineInPage = 0;
      globalIndex += 1;
      continue;
    }

    if (chars[globalIndex] === "\n") {
      globalIndex += 1;
      continue;
    }

    const lineStart = globalIndex;
    const lineItems: Array<{ char: string; index: number }> = [];
    let consumedHeight = 0;
    while (globalIndex < chars.length && chars[globalIndex] !== "\n" && chars[globalIndex] !== "\f") {
      const nextAdvance = advanceForIndex(globalIndex);
      if (lineItems.length > 0 && consumedHeight + nextAdvance > contentHeight) break;
      lineItems.push({ char: chars[globalIndex], index: globalIndex });
      consumedHeight += nextAdvance;
      globalIndex += 1;
    }

    if (
      globalIndex < chars.length &&
      chars[globalIndex] !== "\n" &&
      chars[globalIndex] !== "\f" &&
      FORBIDDEN_LINE_START.has(chars[globalIndex]) &&
      lineItems.length > 1
    ) {
      const nextAdvance = advanceForIndex(globalIndex);
      if (!OPENING.has(lineItems[lineItems.length - 1].char) && consumedHeight + nextAdvance <= contentHeight) {
        lineItems.push({ char: chars[globalIndex], index: globalIndex });
        globalIndex += 1;
      } else {
        globalIndex -= 1;
        lineItems.pop();
      }
    }

    pushLine(lineItems, lineStart, globalIndex);
  }

  if (!pages.length || pages[pages.length - 1].lines.length === 0) return pages;
  return pages;
}

export function applyRangeStyle(project: ScriptProject, start: number, end: number, patch: Omit<StyleRange, "id" | "start" | "end">) {
  if (start === end) return project;
  const range = { id: crypto.randomUUID(), start: Math.min(start, end), end: Math.max(start, end), ...patch };
  const styleRanges = sanitizeStyleRanges([...(project.styleRuns ?? project.styleRanges ?? []), range], project.text.length);
  return { ...project, styleRanges, styleRuns: styleRanges, updatedAt: new Date().toISOString() };
}
