export function normalize(text) {
  return String(text ?? "")
    .trim()
    .toLowerCase()
    .replace(/\n/g, " ");
}

export function toNumber(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === "number") return Number.isNaN(val) ? null : val;
  const s = String(val).trim();
  if (!s) return null;
  const fixed = s.replace(/\s/g, "").replace(",", ".");
  const num = Number(fixed);
  return Number.isNaN(num) ? null : num;
}

export function findHeaderRow(rows) {
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i].map(normalize);
    if (row.includes("code") && row.includes("name") && row.includes("credits")) {
      return i;
    }
  }
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i].map(normalize);
    if (row.some((cell) => cell.includes("teacher 1"))) {
      return i;
    }
  }
  return null;
}

export function extractColumns(headers) {
  const colIndex = new Map(headers.map((h, i) => [h, i]));
  const base = {};
  const keys = [
    "code",
    "name",
    "credits",
    "period(s)",
    "programme",
    "program",
    "budget 2026 (number of working hours per course)",
    "prognos t1 2026 (number of working hours per course) enl programansvarig/avd chef",
    "the name of the course coordinator (first name initital letter last name)",
  ];
  keys.forEach((k) => {
    if (colIndex.has(k)) base[k] = colIndex.get(k);
  });

  const teacherMap = new Map();
  const studentMap = new Map();

  headers.forEach((h, idx) => {
    if (!h) return;
    const teacherMatch = h.match(/teacher\s*(\d+)/);
    const larareMatch = h.match(/l[aä]rare\s*(\d+)/);
    if (teacherMatch || larareMatch) {
      const num = (teacherMatch || larareMatch)[1];
      if (!teacherMap.has(num)) teacherMap.set(num, {});
      const slot = teacherMap.get(num);
      if (h.includes("wh")) slot.hours = idx;
      else if (h.includes("%") || h.includes("av kursen")) slot.percent = idx;
      else slot.name = idx;
      return;
    }
    if (h.includes("studentassistent")) {
      if (!studentMap.has("student")) studentMap.set("student", {});
      const slot = studentMap.get("student");
      if (h.includes("wh")) slot.hours = idx;
      else if (h.includes("%") || h.includes("av kursen")) slot.percent = idx;
      else slot.name = idx;
    }
  });

  const allocations = [];
  [...teacherMap.entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .forEach(([, cols]) => {
      if (cols.name !== undefined) {
        allocations.push({
          role: "teacher",
          nameCol: cols.name,
          percentCol: cols.percent,
          hoursCol: cols.hours,
        });
      }
    });

  if (studentMap.has("student")) {
    const cols = studentMap.get("student");
    if (cols.name !== undefined) {
      allocations.push({
        role: "student_assistant",
        nameCol: cols.name,
        percentCol: cols.percent,
        hoursCol: cols.hours,
      });
    }
  }

  return { base, allocations };
}

export function parseWorkbook(workbook, XLSXlib) {
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSXlib.utils.sheet_to_json(sheet, { header: 1, defval: null });
  const headerRow = findHeaderRow(rows);
  if (headerRow === null) throw new Error("Header row not found");
  const headers = rows[headerRow].map(normalize);
  const columns = extractColumns(headers);

  const codeCol = columns.base.code;
  const nameCol = columns.base.name;
  const creditsCol = columns.base.credits;
  const periodCol = columns.base["period(s)"];
  const programCol = columns.base.programme ?? columns.base.program;
  const budgetCol = columns.base["budget 2026 (number of working hours per course)"];
  const forecastCol = columns.base["prognos t1 2026 (number of working hours per course) enl programansvarig/avd chef"];
  const coordinatorCol = columns.base["the name of the course coordinator (first name initital letter last name)"];

  const courses = [];
  const peopleMap = new Map();

  for (let r = headerRow + 1; r < rows.length; r += 1) {
    const row = rows[r];
    const code = row[codeCol];
    const name = row[nameCol];

    if ((code === null || code === "") && (name === null || name === "")) {
      continue;
    }

    const course = {
      id: `${code}-${r}`,
      rowIndex: r,
      code: code ? String(code).trim() : null,
      name: name ? String(name).trim() : null,
      credits: toNumber(row[creditsCol]),
      periods: periodCol !== undefined ? row[periodCol] : null,
      program: programCol !== undefined ? (row[programCol] ? String(row[programCol]).trim() : null) : null,
      budgetHours: toNumber(row[budgetCol]),
      forecastHours: toNumber(row[forecastCol]),
      coordinator: coordinatorCol !== undefined ? (row[coordinatorCol] ? String(row[coordinatorCol]).trim() : null) : null,
      allocations: [],
    };

    columns.allocations.forEach((alloc) => {
      const rawName = row[alloc.nameCol];
      if (rawName === null || rawName === "") return;
      const nameStr = String(rawName).trim();
      const percent = alloc.percentCol !== undefined ? toNumber(row[alloc.percentCol]) : null;
      const hours = alloc.hoursCol !== undefined ? toNumber(row[alloc.hoursCol]) : null;
      if ((percent === null || percent === 0) && (hours === null || hours === 0)) return;

      const allocation = {
        person: nameStr,
        role: alloc.role,
        percent,
        hours,
      };
      course.allocations.push(allocation);

      if (!peopleMap.has(nameStr)) {
        peopleMap.set(nameStr, { id: nameStr, name: nameStr, allocations: [] });
      }
      peopleMap.get(nameStr).allocations.push({
        courseId: course.id,
        courseCode: course.code,
        courseName: course.name,
        role: alloc.role,
        percent,
        hours,
      });
    });

    courses.push(course);
  }

  return {
    sheetName,
    rows,
    headerRow,
    columns,
    courses,
    people: [...peopleMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export function updatePersonAllocations(state, personId) {
  const person = state.people.find((p) => p.id === personId);
  if (!person) return;
  person.allocations = [];
  state.courses.forEach((course) => {
    course.allocations.forEach((alloc) => {
      if (alloc.person === person.name) {
        person.allocations.push({
          courseId: course.id,
          courseCode: course.code,
          courseName: course.name,
          role: alloc.role,
          percent: alloc.percent,
          hours: alloc.hours,
        });
      }
    });
  });
}

export function applyAllocationsToSheet(state, XLSXlib) {
  const sheet = state.workbook.Sheets[state.sheetName];
  const allocSlots = state.columns.allocations.filter((a) => a.role === "teacher");
  const studentSlot = state.columns.allocations.find((a) => a.role === "student_assistant");
  const headerLen = state.rows[state.headerRow]?.length ?? 0;
  const base = state.columns.base;

  function setCell(r, c, value) {
    const cellRef = XLSXlib.utils.encode_cell({ r, c });
    if (value === null || value === undefined || value === "") {
      delete sheet[cellRef];
      return;
    }
    sheet[cellRef] = sheet[cellRef] || { t: "s" };
    sheet[cellRef].v = value;
    sheet[cellRef].t = typeof value === "number" ? "n" : "s";
  }

  if (state.removedRows && headerLen) {
    state.removedRows.forEach((rowIndex) => {
      if (!state.rows[rowIndex]) {
        state.rows[rowIndex] = Array.from({ length: headerLen }, () => null);
      }
      for (let c = 0; c < headerLen; c += 1) {
        state.rows[rowIndex][c] = null;
        setCell(rowIndex, c, null);
      }
    });
  }

  state.courses.forEach((course) => {
    if (course.rowIndex === null || course.rowIndex === undefined) {
      course.rowIndex = state.rows.length;
      state.rows.push(Array.from({ length: headerLen }, () => null));
    }
    if (!state.rows[course.rowIndex]) {
      state.rows[course.rowIndex] = Array.from({ length: headerLen }, () => null);
    }
    const row = state.rows[course.rowIndex];

    if (base.code !== undefined) {
      row[base.code] = course.code ?? null;
      setCell(course.rowIndex, base.code, course.code ?? null);
    }
    if (base.name !== undefined) {
      row[base.name] = course.name ?? null;
      setCell(course.rowIndex, base.name, course.name ?? null);
    }
    if (base.credits !== undefined) {
      row[base.credits] = course.credits ?? null;
      setCell(course.rowIndex, base.credits, course.credits ?? null);
    }
    if (base["period(s)"] !== undefined) {
      row[base["period(s)"]] = course.periods ?? null;
      setCell(course.rowIndex, base["period(s)"], course.periods ?? null);
    }
    const progCol = base.programme ?? base.program;
    if (progCol !== undefined) {
      row[progCol] = course.program ?? null;
      setCell(course.rowIndex, progCol, course.program ?? null);
    }

    allocSlots.forEach((slot) => {
      row[slot.nameCol] = null;
      setCell(course.rowIndex, slot.nameCol, null);
      if (slot.percentCol !== undefined) {
        row[slot.percentCol] = null;
        setCell(course.rowIndex, slot.percentCol, null);
      }
      if (slot.hoursCol !== undefined) {
        row[slot.hoursCol] = null;
        setCell(course.rowIndex, slot.hoursCol, null);
      }
    });
    if (studentSlot) {
      row[studentSlot.nameCol] = null;
      setCell(course.rowIndex, studentSlot.nameCol, null);
      if (studentSlot.percentCol !== undefined) {
        row[studentSlot.percentCol] = null;
        setCell(course.rowIndex, studentSlot.percentCol, null);
      }
      if (studentSlot.hoursCol !== undefined) {
        row[studentSlot.hoursCol] = null;
        setCell(course.rowIndex, studentSlot.hoursCol, null);
      }
    }

    const teacherAllocations = course.allocations.filter((a) => a.role === "teacher");
    teacherAllocations.slice(0, allocSlots.length).forEach((alloc, idx) => {
      const slot = allocSlots[idx];
      row[slot.nameCol] = alloc.person;
      setCell(course.rowIndex, slot.nameCol, alloc.person);
      if (slot.percentCol !== undefined) {
        row[slot.percentCol] = alloc.percent ?? null;
        setCell(course.rowIndex, slot.percentCol, alloc.percent ?? null);
      }
      if (slot.hoursCol !== undefined) {
        row[slot.hoursCol] = alloc.hours ?? null;
        setCell(course.rowIndex, slot.hoursCol, alloc.hours ?? null);
      }
    });

    if (studentSlot) {
      const studentAlloc = course.allocations.find((a) => a.role === "student_assistant");
      if (studentAlloc) {
        row[studentSlot.nameCol] = studentAlloc.person;
        setCell(course.rowIndex, studentSlot.nameCol, studentAlloc.person);
        if (studentSlot.percentCol !== undefined) {
          row[studentSlot.percentCol] = studentAlloc.percent ?? null;
          setCell(course.rowIndex, studentSlot.percentCol, studentAlloc.percent ?? null);
        }
        if (studentSlot.hoursCol !== undefined) {
          row[studentSlot.hoursCol] = studentAlloc.hours ?? null;
          setCell(course.rowIndex, studentSlot.hoursCol, studentAlloc.hours ?? null);
        }
      }
    }
  });

  if (headerLen) {
    const maxRow = Math.max(0, state.rows.length - 1);
    const maxCol = Math.max(0, headerLen - 1);
    sheet["!ref"] = XLSXlib.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow, c: maxCol } });
  }
}
