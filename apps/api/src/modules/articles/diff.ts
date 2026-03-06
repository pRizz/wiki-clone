type DiffLineType = "added" | "removed" | "unchanged";

export type DiffLine = {
  type: DiffLineType;
  text: string;
};

const splitLines = (text: string): string[] => text.split("\n");

export const buildLineDiff = (fromText: string, toText: string): DiffLine[] => {
  const fromLines = splitLines(fromText);
  const toLines = splitLines(toText);

  const m = fromLines.length;
  const n = toLines.length;
  const lcs: number[][] = Array.from({ length: m + 1 }, () =>
    Array.from({ length: n + 1 }, () => 0),
  );

  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      if (fromLines[i] === toLines[j]) {
        lcs[i][j] = lcs[i + 1][j + 1] + 1;
        continue;
      }

      lcs[i][j] = Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const diff: DiffLine[] = [];
  let i = 0;
  let j = 0;

  while (i < m && j < n) {
    if (fromLines[i] === toLines[j]) {
      diff.push({ type: "unchanged", text: fromLines[i] });
      i += 1;
      j += 1;
      continue;
    }

    if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      diff.push({ type: "removed", text: fromLines[i] });
      i += 1;
      continue;
    }

    diff.push({ type: "added", text: toLines[j] });
    j += 1;
  }

  while (i < m) {
    diff.push({ type: "removed", text: fromLines[i] });
    i += 1;
  }

  while (j < n) {
    diff.push({ type: "added", text: toLines[j] });
    j += 1;
  }

  return diff;
};
