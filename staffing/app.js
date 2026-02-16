/* global XLSX */
import { parseWorkbook, applyAllocationsToSheet, updatePersonAllocations, toNumber } from "./app_core.js";
import { renderLists, renderDetail, renderTimeline, renderCosting } from "./app_ui.js";

const DEFAULT_YEAR = 2026;

const state = {
  workbook: null,
  sheetName: null,
  rows: null,
  headerRow: null,
  columns: null,
  courses: [],
  people: [],
  selectedCourseId: null,
  selectedPersonId: null,
  years: {},
  currentYear: DEFAULT_YEAR,
  removedRows: new Set(),
  costYears: {},
  costData: null,
  nameMapYears: {},
  nameMap: {},
};

const fileInput = document.getElementById("fileInput");
const costFileInput = document.getElementById("costFileInput");
const exportBtn = document.getElementById("exportBtn");
const courseList = document.getElementById("courseList");
const personList = document.getElementById("personList");
const detailTitle = document.getElementById("detailTitle");
const detailMeta = document.getElementById("detailMeta");
const detailView = document.getElementById("detailView");
const timeline = document.getElementById("timeline");
const costView = document.getElementById("costView");
const tabTimeline = document.getElementById("tabTimeline");
const tabCourses = document.getElementById("tabCourses");
const tabCosting = document.getElementById("tabCosting");
const courseSearch = document.getElementById("courseSearch");
const personSearch = document.getElementById("personSearch");
const detailModal = document.getElementById("detailModal");
const detailClose = document.getElementById("detailClose");
const yearSelect = document.getElementById("yearSelect");
const editModal = document.getElementById("editModal");
const editClose = document.getElementById("editClose");
const editCancel = document.getElementById("editCancel");
const editSave = document.getElementById("editSave");
const editForm = document.getElementById("editForm");
const nameMapModal = document.getElementById("nameMapModal");
const nameMapClose = document.getElementById("nameMapClose");
const nameMapSave = document.getElementById("nameMapSave");
const nameMapList = document.getElementById("nameMapList");
const log = document.getElementById("log");
const allocationTemplate = document.getElementById("allocationRowTpl");

function logMsg(msg) {
  log.textContent = msg;
}

function rerender() {
  renderLists({
    state,
    courseList,
    personList,
    courseSearch,
    personSearch,
    onSelectCourse: (id) => openDetail("course", id),
    onSelectPerson: (id) => openDetail("person", id),
    onDragPerson: (id, e) => {
      e.dataTransfer.setData("text/plain", id);
    },
  });

  if (state.view === "timeline") {
    timeline.style.display = "";
    courseList.style.display = "none";
    courseSearch.style.display = "none";
    costView.style.display = "none";
    renderTimeline({
      state,
      timeline,
      onSelectCourse: (id) => openDetail("course", id),
      onAssignPerson: (courseId, personId) => {
        const person = state.people.find((p) => p.id === personId);
        const course = state.courses.find((c) => c.id === courseId);
        if (!person || !course) return;
        course.allocations.push({
          person: person.name,
          role: "teacher",
          percent: 0,
          hours: 0,
        });
        updatePersonAllocations(state, person.id);
        rerender();
      },
      onAddCourse: (program) => addCourse(program),
    });
  } else {
    timeline.style.display = "none";
    if (state.view === "courses") {
      courseList.style.display = "";
      courseSearch.style.display = "";
      costView.style.display = "none";
    } else {
      courseList.style.display = "none";
      courseSearch.style.display = "none";
      costView.style.display = "grid";
      ensureNameMapping();
      renderCosting({ state, costView });
    }
  }

}

function ensureYearOption(year) {
  const value = String(year);
  if (![...yearSelect.options].some((opt) => opt.value === value)) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = value;
    yearSelect.appendChild(opt);
  }
}

function saveCurrentYear() {
  if (!state.currentYear) return;
  state.years[state.currentYear] = {
    workbook: state.workbook,
    sheetName: state.sheetName,
    rows: state.rows,
    headerRow: state.headerRow,
    columns: state.columns,
    courses: state.courses,
    people: state.people,
    removedRows: state.removedRows,
  };
  state.costYears[state.currentYear] = state.costData;
  state.nameMapYears[state.currentYear] = state.nameMap;
}

function loadYear(year) {
  const data = state.years[year];
  if (!data) {
    state.workbook = null;
    state.sheetName = null;
    state.rows = null;
    state.headerRow = null;
    state.columns = null;
    state.courses = [];
    state.people = [];
    state.removedRows = new Set();
    state.costData = state.costYears[year] || null;
    state.nameMap = state.nameMapYears[year] || {};
    exportBtn.disabled = true;
    logMsg(`No data loaded for ${year}. Upload an Excel file.`);
  } else {
    state.workbook = data.workbook;
    state.sheetName = data.sheetName;
    state.rows = data.rows;
    state.headerRow = data.headerRow;
    state.columns = data.columns;
    state.courses = data.courses;
    state.people = data.people;
    state.removedRows = data.removedRows || new Set();
    state.costData = state.costYears[year] || null;
    state.nameMap = state.nameMapYears[year] || {};
    exportBtn.disabled = !state.workbook;
  }
  state.selectedCourseId = null;
  state.selectedPersonId = null;
  closeDetail();
  rerender();
}

function openDetail(type, id) {
  if (type === "course") {
    state.selectedCourseId = id;
    state.selectedPersonId = null;
  } else {
    state.selectedPersonId = id;
    state.selectedCourseId = null;
  }

  detailModal.classList.remove("hidden");
  rerender();

  renderDetail({
    state,
    detailTitle,
    detailMeta,
    detailView,
    allocationTemplate,
    onAssignPerson: (personId) => {
      const person = state.people.find((p) => p.id === personId);
      const course = state.courses.find((c) => c.id === state.selectedCourseId);
      if (!person || !course) return;
      course.allocations.push({
        person: person.name,
        role: "teacher",
        percent: 0,
        hours: 0,
      });
      updatePersonAllocations(state, person.id);
      rerender();
      openDetail("course", course.id);
    },
    onChangePercent: (courseId, idx, value, hoursInput) => {
      const course = state.courses.find((c) => c.id === courseId);
      if (!course) return;
      const alloc = course.allocations[idx];
      alloc.percent = toNumber(value) ?? 0;
      const total = course.budgetHours ?? course.forecastHours ?? null;
      if (total !== null) {
        alloc.hours = Number(((total * alloc.percent) / 100).toFixed(2));
        hoursInput.value = alloc.hours;
      }
      updatePersonAllocations(state, alloc.person);
      rerender();
      openDetail("course", course.id);
    },
    onChangeHours: (courseId, idx, value) => {
      const course = state.courses.find((c) => c.id === courseId);
      if (!course) return;
      const alloc = course.allocations[idx];
      alloc.hours = toNumber(value) ?? 0;
      updatePersonAllocations(state, alloc.person);
      rerender();
      openDetail("course", course.id);
    },
    onRemoveAllocation: (courseId, idx) => {
      const course = state.courses.find((c) => c.id === courseId);
      if (!course) return;
      const [removed] = course.allocations.splice(idx, 1);
      if (removed) updatePersonAllocations(state, removed.person);
      rerender();
      openDetail("course", course.id);
    },
    onRemoveCourse: (courseId) => {
      const course = state.courses.find((c) => c.id === courseId);
      const label = course ? `${course.code ?? ""} ${course.name ?? ""}`.trim() : "this course";
      if (!confirm(`Remove ${label}? This cannot be undone.`)) return;
      removeCourse(courseId);
      closeDetail();
      rerender();
    },
    onEditCourse: (courseId) => openEditCourse(courseId),
  });
}

function closeDetail() {
  detailModal.classList.add("hidden");
}

function normalizeName(name) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[.,()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildNameIndex(names) {
  const index = new Map();
  names.forEach((n) => {
    const key = normalizeName(n);
    if (!key) return;
    index.set(key, n);
  });
  return index;
}

function autoMatchName(costName, staffingNames) {
  const costKey = normalizeName(costName);
  if (!costKey) return null;
  const tokens = costKey.split(" ");
  if (tokens.length < 2) return null;
  const last = tokens[0];
  const first = tokens.slice(1).join(" ");
  const direct = `${first} ${last}`.trim();
  const index = buildNameIndex(staffingNames);
  if (index.has(direct)) return index.get(direct);
  const lastInitial = last[0];
  const firstOnly = first.split(" ")[0];
  const candidates = staffingNames.filter((n) => {
    const parts = normalizeName(n).split(" ");
    if (parts.length < 2) return false;
    const f = parts[0];
    const l = parts[1];
    return f === firstOnly && l.startsWith(lastInitial);
  });
  if (candidates.length === 1) return candidates[0];
  return null;
}

function ensureNameMapping() {
  if (!state.costData || !state.costData.people.length) return;
  const staffingNames = state.people.map((p) => p.name);
  if (!staffingNames.length) return;
  const missing = [];
  state.costData.people.forEach((person) => {
    if (state.nameMap[person.name]) return;
    const auto = autoMatchName(person.name, staffingNames);
    if (auto) {
      state.nameMap[person.name] = auto;
      return;
    }
    missing.push(person.name);
  });

  if (!missing.length) return;
  nameMapList.innerHTML = "";
  missing.forEach((costName) => {
    const row = document.createElement("div");
    row.className = "name-map-row";
    row.innerHTML = `
      <div>${costName}</div>
      <select data-cost="${costName}"></select>
    `;
    const select = row.querySelector("select");
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "Select staffing name";
    select.appendChild(empty);
    staffingNames.forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      select.appendChild(opt);
    });
    nameMapList.appendChild(row);
  });
  nameMapModal.classList.remove("hidden");
}

function closeNameMap() {
  nameMapModal.classList.add("hidden");
}

function saveNameMap() {
  const selects = nameMapList.querySelectorAll("select[data-cost]");
  selects.forEach((select) => {
    const costName = select.getAttribute("data-cost");
    const staffingName = select.value;
    if (costName && staffingName) {
      state.nameMap[costName] = staffingName;
    }
  });
  closeNameMap();
  rerender();
}

function openEditCourse(courseId) {
  const course = state.courses.find((c) => c.id === courseId);
  if (!course) return;
  editForm.innerHTML = `
    <div>
      <label>Code</label>
      <input name="code" value="${course.code ?? ""}" />
    </div>
    <div>
      <label>Name</label>
      <input name="name" value="${course.name ?? ""}" />
    </div>
    <div>
      <label>Credits</label>
      <input name="credits" type="number" step="0.1" value="${course.credits ?? ""}" />
    </div>
    <div>
      <label>Periods</label>
      <input name="periods" value="${course.periods ?? ""}" />
    </div>
    <div>
      <label>Program</label>
      <input name="program" value="${course.program ?? ""}" />
    </div>
    <div>
      <label>Budget Hours</label>
      <input name="budgetHours" type="number" step="0.1" value="${course.budgetHours ?? ""}" />
    </div>
    <div>
      <label>Forecast Hours</label>
      <input name="forecastHours" type="number" step="0.1" value="${course.forecastHours ?? ""}" />
    </div>
    <div>
      <label>Coordinator</label>
      <input name="coordinator" value="${course.coordinator ?? ""}" />
    </div>
  `;
  editModal.dataset.courseId = courseId;
  editModal.classList.remove("hidden");
}

function closeEdit() {
  editModal.classList.add("hidden");
  editModal.dataset.courseId = "";
}

function saveEdit() {
  const courseId = editModal.dataset.courseId;
  const course = state.courses.find((c) => c.id === courseId);
  if (!course) return;
  const formData = new FormData(editForm);
  course.code = formData.get("code")?.toString().trim() || null;
  course.name = formData.get("name")?.toString().trim() || null;
  course.credits = toNumber(formData.get("credits"));
  course.periods = formData.get("periods")?.toString().trim() || null;
  course.program = formData.get("program")?.toString().trim() || null;
  course.budgetHours = toNumber(formData.get("budgetHours"));
  course.forecastHours = toNumber(formData.get("forecastHours"));
  course.coordinator = formData.get("coordinator")?.toString().trim() || null;
  rerender();
  closeEdit();
  closeDetail();
}

function recomputePeopleAllocations() {
  state.people.forEach((p) => {
    p.allocations = [];
  });
  state.courses.forEach((course) => {
    course.allocations.forEach((alloc) => {
      const person = state.people.find((p) => p.name === alloc.person);
      if (!person) return;
      person.allocations.push({
        courseId: course.id,
        courseCode: course.code,
        courseName: course.name,
        role: alloc.role,
        percent: alloc.percent,
        hours: alloc.hours,
      });
    });
  });
}

function removeCourse(courseId) {
  const course = state.courses.find((c) => c.id === courseId);
  state.courses = state.courses.filter((c) => c.id !== courseId);
  if (course && course.rowIndex !== null && course.rowIndex !== undefined && state.rows) {
    state.removedRows.add(course.rowIndex);
    const headerLen = state.rows[state.headerRow]?.length ?? 0;
    state.rows[course.rowIndex] = Array.from({ length: headerLen }, () => null);
  }
  recomputePeopleAllocations();
}

function addCourse(program) {
  const id = `new-${Date.now()}`;
  const course = {
    id,
    rowIndex: state.rows ? state.rows.length : null,
    code: "NEW",
    name: "New Course",
    credits: null,
    periods: "1",
    program,
    budgetHours: null,
    forecastHours: null,
    coordinator: null,
    allocations: [],
  };
  state.courses.push(course);
  if (state.rows && state.columns) {
    const headerLen = state.rows[state.headerRow]?.length ?? 0;
    const row = Array.from({ length: headerLen }, () => null);
    if (state.columns.base.code !== undefined) row[state.columns.base.code] = course.code;
    if (state.columns.base.name !== undefined) row[state.columns.base.name] = course.name;
    if (state.columns.base.credits !== undefined) row[state.columns.base.credits] = course.credits;
    if (state.columns.base["period(s)"] !== undefined) row[state.columns.base["period(s)"]] = course.periods;
    const progCol = state.columns.base.programme ?? state.columns.base.program;
    if (progCol !== undefined) row[progCol] = program;
    state.rows.push(row);
  }
  rerender();
  openDetail("course", id);
}

fileInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const yearInput = prompt("Import this Excel as year:", String(state.currentYear || DEFAULT_YEAR));
  if (!yearInput) return;
  const year = Number.parseInt(yearInput, 10);
  if (Number.isNaN(year)) return;
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array" });
  const parsed = parseWorkbook(workbook, XLSX);

  saveCurrentYear();

  state.workbook = workbook;
  state.sheetName = parsed.sheetName;
  state.rows = parsed.rows;
  state.headerRow = parsed.headerRow;
  state.columns = parsed.columns;
  state.courses = parsed.courses;
  state.people = parsed.people;
  state.selectedCourseId = null;
  state.selectedPersonId = null;
  state.view = "timeline";
  state.currentYear = year;
  state.removedRows = new Set();

  state.years[year] = {
    workbook,
    sheetName: parsed.sheetName,
    rows: parsed.rows,
    headerRow: parsed.headerRow,
    columns: parsed.columns,
    courses: parsed.courses,
    people: parsed.people,
    removedRows: state.removedRows,
  };
  state.costYears[year] = state.costYears[year] || null;
  ensureYearOption(year);
  yearSelect.value = String(year);
  tabTimeline.classList.add("active");
  tabCourses.classList.remove("active");

  exportBtn.disabled = false;
  logMsg(`Loaded ${state.courses.length} courses and ${state.people.length} people.`);
  rerender();
});

function parseCostWorkbook(workbook) {
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  const headerRow = 4;
  const headers = rows[headerRow].map((h) => String(h ?? "").trim().toLowerCase());
  const idx = (name) => headers.indexOf(name);
  const nameCol = idx("namn (efternamn förnamn)");
  const verksamhetCol = idx("verksamhet (benämning)");
  const frittCol = idx("fritt fält med 37 i");
  const monthCols = [
    { key: "jan", label: "Jan" },
    { key: "feb", label: "Feb" },
    { key: "mars", label: "Mar" },
    { key: "april", label: "Apr" },
    { key: "maj", label: "May" },
    { key: "juni", label: "Jun" },
    { key: "july", label: "Jul" },
    { key: "aug", label: "Aug" },
    { key: "sept", label: "Sep" },
    { key: "okt", label: "Oct" },
    { key: "nov", label: "Nov" },
    { key: "dec", label: "Dec" },
  ].map((m) => ({ ...m, col: idx(m.key) }));

  const peopleMap = new Map();
  for (let r = headerRow + 1; r < rows.length; r += 1) {
    const row = rows[r];
    if (!row || row.length === 0) continue;
    const verksamhet = verksamhetCol >= 0 ? String(row[verksamhetCol] ?? "").trim().toLowerCase() : "";
    if (verksamhet === "totalt") continue;
    const name = nameCol >= 0 ? String(row[nameCol] ?? "").trim() : "";
    if (!name) continue;
    const verksamhetLabel = verksamhetCol >= 0 ? String(row[verksamhetCol] ?? "").trim() : "Okänd";
    if (!peopleMap.has(name)) {
      peopleMap.set(name, {
        name,
        rows: [],
        total: 0,
      });
    }
    const person = peopleMap.get(name);
    const rowEntry = {
      verksamhet: verksamhetLabel,
      fritt: frittCol >= 0 ? String(row[frittCol] ?? "").trim() : "",
      months: monthCols.map((m) => ({ label: m.label, value: 0 })),
      total: 0,
    };
    monthCols.forEach((m, idxM) => {
      const val = toNumber(row[m.col]) ?? 0;
      const pct = val * 100;
      rowEntry.months[idxM].value = pct;
      rowEntry.total += pct;
      person.total += pct;
    });
    person.rows.push(rowEntry);
  }

  return { people: [...peopleMap.values()].sort((a, b) => a.name.localeCompare(b.name)) };
}

costFileInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const yearInput = prompt("Import costing file as year:", String(state.currentYear || DEFAULT_YEAR));
  if (!yearInput) return;
  const year = Number.parseInt(yearInput, 10);
  if (Number.isNaN(year)) return;
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array" });
  const parsed = parseCostWorkbook(workbook);
  saveCurrentYear();
  state.costYears[year] = parsed;
  state.currentYear = year;
  state.costData = parsed;
  ensureYearOption(year);
  yearSelect.value = String(year);
  rerender();
});

exportBtn.addEventListener("click", () => {
  if (!state.workbook) return;
  const teacherSlots = state.columns.allocations.filter((a) => a.role === "teacher").length;
  const overflow = state.courses.filter((c) => c.allocations.filter((a) => a.role === "teacher").length > teacherSlots);
  if (overflow.length) {
    logMsg(`Warning: ${overflow.length} courses exceed available teacher slots. Extra allocations will be ignored on export.`);
  }
  applyAllocationsToSheet(state, XLSX);
  const filename = `bemanning_${state.currentYear}_export.xlsx`;
  XLSX.writeFile(state.workbook, filename);
  if (!overflow.length) logMsg(`Exported ${filename}`);
});

courseSearch.addEventListener("input", rerender);
personSearch.addEventListener("input", rerender);

tabTimeline.addEventListener("click", () => {
  state.view = "timeline";
  tabTimeline.classList.add("active");
  tabCourses.classList.remove("active");
  tabCosting.classList.remove("active");
  rerender();
});

tabCourses.addEventListener("click", () => {
  state.view = "courses";
  tabCourses.classList.add("active");
  tabTimeline.classList.remove("active");
  tabCosting.classList.remove("active");
  rerender();
});

tabCosting.addEventListener("click", () => {
  state.view = "costing";
  tabCosting.classList.add("active");
  tabTimeline.classList.remove("active");
  tabCourses.classList.remove("active");
  rerender();
});

yearSelect.addEventListener("change", () => {
  const year = Number.parseInt(yearSelect.value, 10);
  if (Number.isNaN(year)) return;
  saveCurrentYear();
  state.currentYear = year;
  loadYear(year);
});

detailClose.addEventListener("click", closeDetail);
detailModal.querySelector(".modal-backdrop").addEventListener("click", closeDetail);
editClose.addEventListener("click", closeEdit);
editCancel.addEventListener("click", closeEdit);
editSave.addEventListener("click", saveEdit);
editModal.querySelector(".modal-backdrop").addEventListener("click", closeEdit);
nameMapClose.addEventListener("click", closeNameMap);
nameMapSave.addEventListener("click", saveNameMap);
nameMapModal.querySelector(".modal-backdrop").addEventListener("click", closeNameMap);

logMsg("Upload bemanning.xlsx to start.");
state.view = "timeline";
tabTimeline.classList.add("active");
tabCourses.classList.remove("active");
tabCosting.classList.remove("active");
for (let y = DEFAULT_YEAR; y <= 2030; y += 1) {
  ensureYearOption(y);
}
yearSelect.value = String(DEFAULT_YEAR);
rerender();

if (typeof window !== "undefined") {
  window.__app = { state, rerender };
}
