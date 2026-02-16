import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseWorkbook, applyAllocationsToSheet } from "../app_core.js";

function buildWorkbook() {
  const rows = [
    [null, null, "Courses offered"],
    [],
    ["Code", "Name", "Credits", "Teacher 1", "% av kursen för lärare 1", "WH lärare 1", "Teacher 2", "% av kursen för lärare 2", "WH lärare 2"],
    ["TST100", "Test Course", 7.5, "Alice", 60, 120, "Bob", 40, 80],
    ["TST200", "Second Course", 15, "Alice", 100, 200, null, null, null],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Sheet1");
  return wb;
}

describe("parseWorkbook", () => {
  it("extracts courses and people", () => {
    const wb = buildWorkbook();
    const parsed = parseWorkbook(wb, XLSX);

    expect(parsed.courses.length).toBe(2);
    expect(parsed.people.length).toBe(2);

    const course = parsed.courses[0];
    expect(course.code).toBe("TST100");
    expect(course.allocations.length).toBe(2);

    const alice = parsed.people.find((p) => p.name === "Alice");
    expect(alice.allocations.length).toBe(2);
  });
});

describe("applyAllocationsToSheet", () => {
  it("writes updated allocations back into the sheet", () => {
    const wb = buildWorkbook();
    const parsed = parseWorkbook(wb, XLSX);
    const state = {
      workbook: wb,
      sheetName: parsed.sheetName,
      rows: parsed.rows,
      headerRow: parsed.headerRow,
      columns: parsed.columns,
      courses: parsed.courses,
    };

    state.courses[0].allocations[0].person = "Carol";
    state.courses[0].allocations[0].percent = 70;
    state.courses[0].allocations[0].hours = 140;

    applyAllocationsToSheet(state, XLSX);

    const sheet = wb.Sheets[parsed.sheetName];
    const cellName = sheet[XLSX.utils.encode_cell({ r: 3, c: 3 })];
    const cellPercent = sheet[XLSX.utils.encode_cell({ r: 3, c: 4 })];
    const cellHours = sheet[XLSX.utils.encode_cell({ r: 3, c: 5 })];

    expect(cellName.v).toBe("Carol");
    expect(cellPercent.v).toBe(70);
    expect(cellHours.v).toBe(140);
  });
});
