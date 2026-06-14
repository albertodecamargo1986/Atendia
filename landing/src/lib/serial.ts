import crypto from "crypto";

const SERIAL_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const SERIAL_SEGMENT_LENGTH = 4;
const SERIAL_SEGMENTS = 4;

/**
 * Generates a unique serial key in the format ATND-XXXX-XXXX-XXXX-XXXX
 * Uses crypto.randomInt for cryptographically secure random generation.
 * Characters exclude ambiguous ones: I, L, O, 0, 1
 */
export function generateSerial(): string {
  const segments: string[] = [];

  for (let s = 0; s < SERIAL_SEGMENTS; s++) {
    let segment = "";
    for (let i = 0; i < SERIAL_SEGMENT_LENGTH; i++) {
      const randomIndex = crypto.randomInt(0, SERIAL_CHARS.length);
      segment += SERIAL_CHARS[randomIndex];
    }
    segments.push(segment);
  }

  return `ATND-${segments.join("-")}`;
}

/**
 * Validates a serial key format
 */
export function isValidSerialFormat(serial: string): boolean {
  const pattern = /^ATND-[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{4}$/;
  return pattern.test(serial);
}
