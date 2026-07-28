/** Token-aware content chunking. */

export interface FileContent {
  path: string;
  content: string;
  tokens: number;
  is_changed: boolean;
}

export interface Chunk {
  index: number;        // 1-based
  total: number;        // total chunks (filled in after all chunks created)
  files: FileContent[];
  excluded_files: string[];
}

export function chunkTokens(chunk: Chunk): number {
  return chunk.files.reduce((sum, f) => sum + f.tokens, 0);
}

type Counter = (text: string) => number;

function splitFileByFunctions(content: string, budget: number, counter: Counter): string[] {
  // Match Python/JS/TS function or class definitions
  const boundaryRe = /^(?:def |class |function |async def |export (?:default )?(?:class|function))/gm;
  const positions: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = boundaryRe.exec(content)) !== null) {
    positions.push(m.index);
  }

  if (positions.length === 0) {
    return splitByLines(content, budget, counter);
  }

  const parts: [number, number, string][] = [];
  let currentStart = 0;
  for (const pos of positions.slice(1)) {
    parts.push([currentStart, pos, content.slice(currentStart, pos)]);
    currentStart = pos;
  }
  parts.push([currentStart, content.length, content.slice(currentStart)]);

  // Group parts until budget is exceeded
  const segments: string[] = [];
  let current = "";
  for (const [, , text] of parts) {
    const candidate = current + text;
    if (counter(candidate) <= budget) {
      current = candidate;
    } else {
      if (current) segments.push(current);
      current = text;
    }
  }
  if (current) segments.push(current);

  return segments;
}

function splitByHeadings(content: string, budget: number, counter: Counter): string[] {
  const headingRe = /^#{1,3} .+$/gm;
  const positions: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(content)) !== null) {
    positions.push(m.index);
  }

  if (positions.length === 0) {
    return splitByLines(content, budget, counter);
  }

  const segments: string[] = [];
  let current = positions[0] > 0 ? content.slice(0, positions[0]) : "";
  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    const end = i + 1 < positions.length ? positions[i + 1] : content.length;
    const section = content.slice(pos, end);
    const candidate = current + section;
    if (counter(candidate) <= budget) {
      current = candidate;
    } else {
      if (current) segments.push(current);
      current = section;
    }
  }
  if (current) segments.push(current);

  return segments.filter(s => s.trim().length > 0);
}

function splitByLines(content: string, budget: number, counter: Counter): string[] {
  // Preserve line endings (keepends=True equivalent)
  const lines = content.split(/(?<=\n)/);
  const segments: string[] = [];
  let currentLines: string[] = [];

  for (const line of lines) {
    currentLines.push(line);
    if (counter(currentLines.join("")) > budget) {
      if (currentLines.length > 1) {
        segments.push(currentLines.slice(0, -1).join(""));
        currentLines = [line];
      } else {
        // Single line exceeds budget — force include it
        segments.push(line);
        currentLines = [];
      }
    }
  }

  if (currentLines.length > 0) {
    segments.push(currentLines.join(""));
  }

  return segments;
}

function isMarkdown(path: string): boolean {
  return path.endsWith(".md") || path.endsWith(".rst") || path.endsWith(".txt");
}

const CODE_EXTENSIONS = new Set([
  ".py", ".js", ".ts", ".jsx", ".tsx", ".go", ".java", ".cpp", ".c", ".cs", ".rb", ".rs",
]);

function getExtension(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot >= 0 ? path.slice(dot).toLowerCase() : "";
}

function getPathParts(path: string): string[] {
  return path.split(/[/\\]/).filter(p => p.length > 0);
}

function splitLargeFile(fc: FileContent, budget: number, counter: Counter): FileContent[] {
  const content = fc.content;
  const ext = getExtension(fc.path);

  let segments: string[];
  if (CODE_EXTENSIONS.has(ext)) {
    segments = splitFileByFunctions(content, budget, counter);
  } else if (isMarkdown(fc.path)) {
    segments = splitByHeadings(content, budget, counter);
  } else {
    segments = splitByLines(content, budget, counter);
  }

  return segments.map((seg, i) => ({
    path: `${fc.path}[part ${i + 1}/${segments.length}]`,
    content: seg,
    tokens: counter(seg),
    is_changed: fc.is_changed,
  }));
}

export function chunkFiles(
  files: FileContent[],
  budget: number,
  counter: Counter,
  prioritize_changed = true,
): Chunk[] {
  if (files.length === 0) return [];

  if (budget <= 0) {
    // No budget — single chunk with all files
    return [{ index: 1, total: 1, files, excluded_files: [] }];
  }

  // Sort: changed files first, then by directory grouping
  const sortKey = (fc: FileContent): [number, string[], string] => {
    const priority = prioritize_changed && fc.is_changed ? 0 : 1;
    const parts = getPathParts(fc.path);
    const dir = parts.slice(0, -1);
    const name = parts[parts.length - 1] ?? "";
    return [priority, dir, name];
  };

  const sortedFiles = [...files].sort((a, b) => {
    const [ap, ad, an] = sortKey(a);
    const [bp, bd, bn] = sortKey(b);
    if (ap !== bp) return ap - bp;
    // Compare directory arrays lexicographically
    const minLen = Math.min(ad.length, bd.length);
    for (let i = 0; i < minLen; i++) {
      if (ad[i] < bd[i]) return -1;
      if (ad[i] > bd[i]) return 1;
    }
    if (ad.length !== bd.length) return ad.length - bd.length;
    if (an < bn) return -1;
    if (an > bn) return 1;
    return 0;
  });

  const chunks: Chunk[] = [];
  let currentChunk: Chunk = { index: 1, total: 0, files: [], excluded_files: [] };
  let currentTokens = 0;

  for (const fc of sortedFiles) {
    const subFiles = fc.tokens > budget ? splitLargeFile(fc, budget, counter) : [fc];

    for (const sub of subFiles) {
      if (currentTokens + sub.tokens > budget && currentChunk.files.length > 0) {
        chunks.push(currentChunk);
        currentChunk = { index: chunks.length + 1, total: 0, files: [], excluded_files: [] };
        currentTokens = 0;
      }
      currentChunk.files.push(sub);
      currentTokens += sub.tokens;
    }
  }

  if (currentChunk.files.length > 0) {
    chunks.push(currentChunk);
  }

  // Set total on all chunks
  const total = chunks.length;
  for (const chunk of chunks) {
    chunk.total = total;
  }

  return chunks;
}
