"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hwidSimilarity = hwidSimilarity;
exports.isSameMachine = isSameMachine;
const MATCH_THRESHOLD = 0.6;
function parseHwid(hwid) {
    return new Set(hwid
        .split(',')
        .map((c) => c.trim().toLowerCase())
        .filter(Boolean));
}
function hwidSimilarity(hwidA, hwidB) {
    const setA = parseHwid(hwidA);
    const setB = parseHwid(hwidB);
    if (setA.size === 0 && setB.size === 0)
        return 1;
    if (setA.size === 0 || setB.size === 0)
        return 0;
    let intersection = 0;
    for (const component of setA) {
        if (setB.has(component)) {
            intersection++;
        }
    }
    const maxComponents = Math.max(setA.size, setB.size);
    return intersection / maxComponents;
}
function isSameMachine(hwidA, hwidB) {
    if (hwidA === hwidB)
        return true;
    return hwidSimilarity(hwidA, hwidB) >= MATCH_THRESHOLD;
}
//# sourceMappingURL=hwid.js.map