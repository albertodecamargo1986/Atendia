const MATCH_THRESHOLD = 0.6;

function parseHwid(hwid: string): Set<string> {
  return new Set(
    hwid
      .split(',')
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function hwidSimilarity(hwidA: string, hwidB: string): number {
  const setA = parseHwid(hwidA);
  const setB = parseHwid(hwidB);

  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const component of setA) {
    if (setB.has(component)) {
      intersection++;
    }
  }

  const maxComponents = Math.max(setA.size, setB.size);
  return intersection / maxComponents;
}

export function isSameMachine(hwidA: string, hwidB: string): boolean {
  if (hwidA === hwidB) return true;
  return hwidSimilarity(hwidA, hwidB) >= MATCH_THRESHOLD;
}
