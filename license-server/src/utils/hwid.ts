/**
 * HWID comparison utility with fuzzy matching for minor hardware changes.
 *
 * HWID format: comma-separated component identifiers
 * Example: "cpu-ABC123,board-XYZ789,disk-DEF456,gpu-GHI012"
 *
 * Fuzzy match: if the HWIDs share enough components (>= 60%), we consider
 * them the same machine. This accounts for minor upgrades or driver
 * reinstallation without requiring a full license transfer.
 */

const MATCH_THRESHOLD = 0.6;

/**
 * Parse an HWID string into a Set of component identifiers.
 */
function parseHwid(hwid: string): Set<string> {
  return new Set(
    hwid
      .split(',')
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Calculate the similarity ratio between two HWIDs.
 * Returns a value between 0 (no match) and 1 (exact match).
 */
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

/**
 * Check whether two HWIDs refer to the same physical machine.
 * Uses fuzzy matching with a configurable threshold.
 */
export function isSameMachine(hwidA: string, hwidB: string): boolean {
  if (hwidA === hwidB) return true;
  return hwidSimilarity(hwidA, hwidB) >= MATCH_THRESHOLD;
}
