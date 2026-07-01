// AddressBook normalization. The matchers are how chat.db's E.164
// handles meet the user's contacts; broken normalization = broken names.

import { describe, it, expect } from "vitest";
import { normalizePhone, normalizeEmail } from "../../../src/sources/imessage/contacts.js";

describe("normalizePhone", () => {
  it("returns null on null/undefined/empty input", () => {
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });

  it("drops anything with fewer than 7 digits", () => {
    expect(normalizePhone("123")).toBeNull();
    expect(normalizePhone("abc-de")).toBeNull();
  });

  it("turns a 10-digit US number into +1XXXXXXXXXX", () => {
    expect(normalizePhone("(401) 603-9187")).toBe("+14016039187");
    expect(normalizePhone("401.603.9187")).toBe("+14016039187");
    expect(normalizePhone("4016039187")).toBe("+14016039187");
  });

  it("treats an 11-digit number starting with 1 as already-US E.164", () => {
    expect(normalizePhone("1-401-603-9187")).toBe("+14016039187");
    expect(normalizePhone("+1 401 603 9187")).toBe("+14016039187");
  });

  it("prefixes a + to any other international number", () => {
    expect(normalizePhone("+44 20 7946 0958")).toBe("+442079460958");
    expect(normalizePhone("00 44 20 7946 0958")).toBe("+00442079460958");
  });
});

describe("normalizeEmail", () => {
  it("returns null on null/empty input", () => {
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
    expect(normalizeEmail("")).toBeNull();
  });

  it("lowercases and trims valid emails", () => {
    expect(normalizeEmail("  Alice@Example.COM  ")).toBe("alice@example.com");
  });

  it("returns null on strings without an @", () => {
    expect(normalizeEmail("alice")).toBeNull();
    expect(normalizeEmail("alice example.com")).toBeNull();
  });
});
