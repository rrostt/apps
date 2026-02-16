export function renderLists({ state, courseList, personList, courseSearch, personSearch, onSelectCourse, onSelectPerson, onDragPerson }) {
  const courseFilter = courseSearch.value.toLowerCase();
  courseList.innerHTML = "";
  const filteredCourses = state.courses.filter((c) =>
    !courseFilter
      ? true
      : `${c.code} ${c.name}`.toLowerCase().includes(courseFilter)
  );
  const grouped = new Map();
  filteredCourses.forEach((course) => {
    const key = course.program ?? "Unassigned";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(course);
  });
  [...grouped.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([program, courses]) => {
      const header = document.createElement("div");
      header.className = "group-header";
      header.textContent = program;
      courseList.appendChild(header);

      courses
        .sort((a, b) => `${a.code ?? ""}`.localeCompare(`${b.code ?? ""}`))
        .forEach((course) => {
          const peopleLabels = course.allocations
            .map((alloc) => alloc.person)
            .filter(Boolean)
            .join(", ");
          const item = document.createElement("div");
          item.className = `list-item ${state.selectedCourseId === course.id ? "active" : ""}`;
          item.innerHTML = `
            <div>
              <div>${course.code ?? ""} ${course.name ?? ""}</div>
              <div class="meta">${course.credits ?? ""} hp</div>
              <div class="meta course-list">${peopleLabels || "No people yet"}</div>
            </div>
            <div class="meta">${course.allocations.length} alloc</div>
          `;
          item.addEventListener("click", () => onSelectCourse(course.id));
          courseList.appendChild(item);
        });
    });

  const personFilter = personSearch.value.toLowerCase();
  personList.innerHTML = "";
  state.people
    .filter((p) => (personFilter ? p.name.toLowerCase().includes(personFilter) : true))
    .forEach((person) => {
      const courseLabels = person.allocations
        .map((alloc) => alloc.courseCode || alloc.courseName)
        .filter(Boolean)
        .join(", ");
      const item = document.createElement("div");
      item.className = `list-item ${state.selectedPersonId === person.id ? "active" : ""}`;
      item.setAttribute("draggable", "true");
      item.innerHTML = `
        <div>
          <div>${person.name}</div>
          <div class="meta">${person.allocations.length} courses</div>
          <div class="meta course-list">${courseLabels || "No courses yet"}</div>
        </div>
      `;
      item.addEventListener("click", () => onSelectPerson(person.id));
      item.addEventListener("dragstart", (e) => onDragPerson(person.id, e));
      personList.appendChild(item);
    });
}

export function renderTimeline({ state, timeline, onSelectCourse, onAssignPerson, onAddCourse }) {
  const periods = [
    { key: "3", label: "Period 3" },
    { key: "4", label: "Period 4" },
    { key: "summer", label: "Summer" },
    { key: "1", label: "Period 1" },
    { key: "2", label: "Period 2" },
  ];
  const order = new Map(periods.map((p, idx) => [p.key, idx]));

  function normalizePeriods(raw) {
    if (raw === null || raw === undefined || raw === "") return [];
    const text = String(raw).toLowerCase().replace(/\s+o\s+/g, " ");
    const parts = text
      .split(/[,/;+\s]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    const normalized = new Set();
    const addToken = (token) => {
      if (!token) return;
      if (token === "s" || token === "summer" || token.includes("sommar")) {
        normalized.add("summer");
        return;
      }
      const digit = token.match(/[1-4]/);
      if (digit) normalized.add(digit[0]);
    };
    parts.forEach((p) => {
      if (p.includes("-")) {
        p.split("-").forEach((token) => addToken(token));
        return;
      }
      addToken(p);
    });
    return [...normalized];
  }

  timeline.innerHTML = "";
  const grouped = new Map();
  state.courses.forEach((course) => {
    const key = course.program ?? "Unassigned";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(course);
  });

  const headerRow = document.createElement("div");
  headerRow.className = "timeline-header-row";
  const headerGrid = document.createElement("div");
  headerGrid.className = "timeline-header-grid";
  periods.forEach((period) => {
    const header = document.createElement("div");
    header.className = "timeline-header";
    header.textContent = period.label;
    headerGrid.appendChild(header);
  });
  headerRow.appendChild(headerGrid);
  timeline.appendChild(headerRow);

  [...grouped.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([program, courses]) => {
      const label = document.createElement("div");
      label.className = "timeline-program-label";
      const labelText = document.createElement("span");
      labelText.textContent = program;
      const addBtn = document.createElement("button");
      addBtn.className = "timeline-add";
      addBtn.type = "button";
      addBtn.textContent = "+";
      addBtn.addEventListener("click", () => onAddCourse(program));
      label.appendChild(labelText);
      label.appendChild(addBtn);
      timeline.appendChild(label);

      const items = courses
        .map((course) => ({
          course,
          periods: normalizePeriods(course.periods).filter((p) => order.has(p)),
        }))
        .filter((entry) => entry.periods.length);

      const packed = items
        .map(({ course, periods: coursePeriods }) => {
          const sorted = coursePeriods
            .map((p) => ({ key: p, idx: order.get(p) }))
            .sort((a, b) => a.idx - b.idx);
          const start = sorted[0].idx;
          const end = sorted[sorted.length - 1].idx;
          return { course, start, end };
        })
        .sort((a, b) => (a.start - b.start) || (a.end - b.end));

      const rows = [];
      packed.forEach((item) => {
        let placed = false;
        for (const row of rows) {
          const conflict = row.some((existing) => !(item.end < existing.start || item.start > existing.end));
          if (!conflict) {
            row.push(item);
            placed = true;
            break;
          }
        }
        if (!placed) rows.push([item]);
      });

      rows.forEach((rowItems) => {
        const grid = document.createElement("div");
        grid.className = "timeline-grid";
        rowItems.forEach((item) => {
          const peopleLabels = item.course.allocations
            .map((alloc) => alloc.person)
            .filter(Boolean)
            .join(", ");
          const node = document.createElement("div");
          node.className = "timeline-item";
          node.style.gridColumn = `${item.start + 1} / ${item.end + 2}`;
          node.innerHTML = `
            <div>${item.course.code ?? ""} ${item.course.name ?? ""}</div>
            <div class="meta">${item.course.credits ?? ""} hp</div>
            <div class="meta">${peopleLabels || "No people yet"}</div>
          `;
          node.addEventListener("click", () => onSelectCourse(item.course.id));
          node.addEventListener("dragover", (e) => {
            e.preventDefault();
            node.classList.add("drag-over");
          });
          node.addEventListener("dragleave", () => node.classList.remove("drag-over"));
          node.addEventListener("drop", (e) => {
            e.preventDefault();
            node.classList.remove("drag-over");
            const personId = e.dataTransfer.getData("text/plain");
            if (personId) onAssignPerson(item.course.id, personId);
          });
          grid.appendChild(node);
        });
        timeline.appendChild(grid);
      });
    });
}

export function renderDetail({ state, detailTitle, detailMeta, detailView, allocationTemplate, onAssignPerson, onChangePercent, onChangeHours, onRemoveAllocation, onRemoveCourse, onEditCourse }) {
  detailView.innerHTML = "";
  if (state.selectedCourseId) {
    const course = state.courses.find((c) => c.id === state.selectedCourseId);
    if (!course) return;
    detailTitle.textContent = `${course.code ?? ""} ${course.name ?? ""}`;
    detailMeta.textContent = `${course.allocations.length} allocations · ${course.budgetHours ?? "?"} hours`;

    const editCourse = document.createElement("button");
    editCourse.className = "modal-close";
    editCourse.textContent = "Edit course";
    editCourse.addEventListener("click", () => onEditCourse(course.id));
    detailView.appendChild(editCourse);

    const removeCourse = document.createElement("button");
    removeCourse.className = "modal-close";
    removeCourse.textContent = "Remove course";
    removeCourse.addEventListener("click", () => onRemoveCourse(course.id));
    detailView.appendChild(removeCourse);

    const assignBox = document.createElement("div");
    assignBox.className = "assign-box";
    assignBox.innerHTML = `
      <input class="assign-input" type="search" placeholder="Search teacher to assign" />
      <div class="assign-results"></div>
    `;
    const input = assignBox.querySelector(".assign-input");
    const results = assignBox.querySelector(".assign-results");
    const renderResults = () => {
      const term = input.value.toLowerCase().trim();
      results.innerHTML = "";
      if (!term) return;
      const matches = state.people
        .filter((p) => p.name.toLowerCase().includes(term))
        .slice(0, 8);
      matches.forEach((person) => {
        const item = document.createElement("div");
        item.className = "assign-item";
        item.textContent = person.name;
        item.addEventListener("click", () => {
          onAssignPerson(person.id);
          input.value = "";
          renderResults();
        });
        results.appendChild(item);
      });
    };
    input.addEventListener("input", renderResults);
    renderResults();
    detailView.appendChild(assignBox);

    course.allocations.forEach((alloc, idx) => {
      const row = allocationTemplate.content.firstElementChild.cloneNode(true);
      row.querySelector(".alloc-name").textContent = alloc.person;
      row.querySelector(".alloc-role").textContent = alloc.role.replace("_", " ");
      const percentInput = row.querySelector(".alloc-percent");
      const hoursInput = row.querySelector(".alloc-hours");
      percentInput.value = alloc.percent ?? "";
      hoursInput.value = alloc.hours ?? "";

      percentInput.addEventListener("change", () => onChangePercent(course.id, idx, percentInput.value, hoursInput));
      hoursInput.addEventListener("change", () => onChangeHours(course.id, idx, hoursInput.value));
      row.querySelector(".alloc-remove").addEventListener("click", () => onRemoveAllocation(course.id, idx));

      detailView.appendChild(row);
    });
  } else if (state.selectedPersonId) {
    const person = state.people.find((p) => p.id === state.selectedPersonId);
    if (!person) return;
    const totalHours = person.allocations.reduce((sum, alloc) => sum + (alloc.hours ?? 0), 0);
    const ftePercent = totalHours ? (totalHours / 1700) * 100 : 0;
    detailTitle.textContent = person.name;
    detailMeta.textContent = `${person.allocations.length} allocations · ${totalHours.toFixed(1)} h · ${ftePercent.toFixed(1)}% FTE`;

    person.allocations.forEach((alloc) => {
      const row = document.createElement("div");
      row.className = "allocation";
      row.innerHTML = `
        <div class="alloc-name">${alloc.courseCode ?? ""} ${alloc.courseName ?? ""}</div>
        <div class="alloc-role">${alloc.role.replace("_", " ")}</div>
        <div>${alloc.percent ?? ""}%</div>
        <div>${alloc.hours ?? ""} h</div>
        <div></div>
      `;
      detailView.appendChild(row);
    });
  } else {
    detailTitle.textContent = "Select a course or person";
    detailMeta.textContent = "";
  }
}

export function renderCosting({ state, costView }) {
  costView.innerHTML = "";
  if (!state.costData || !state.costData.people.length) {
    costView.innerHTML = "<div class=\"cost-meta\">No costing data loaded for this year.</div>";
    return;
  }
  const courseMap = new Map();
  state.people.forEach((p) => {
    courseMap.set(p.name, p.allocations || []);
  });
  state.costData.people.forEach((person) => {
    const staffingName = state.nameMap?.[person.name] || person.name;
    const courseAllocations = courseMap.get(staffingName) || [];
    const card = document.createElement("div");
    card.className = "cost-card";
    const total = person.total ?? 0;
    const avg = total / 12;
    const fte = total ? (total / 1700) * 100 : 0;
    const monthLabels = person.rows[0]?.months.map((m) => m.label) || [];
    card.innerHTML = `
      <div class="cost-header">
        <div class="cost-name">${person.name}</div>
        <div class="cost-meta">${avg.toFixed(0)} avg · ${fte.toFixed(1)}% FTE</div>
      </div>
      <table class="cost-table">
        <thead>
          <tr>
            <th>Verksamhet</th>
            <th>Fritt fält</th>
            ${monthLabels.map((label) => `<th>${label}</th>`).join("")}
            <th>Avg</th>
          </tr>
        </thead>
        <tbody>
          ${person.rows.map((row) => `
            <tr>
              <td>${row.verksamhet}</td>
              <td>${row.fritt || ""}</td>
              ${row.months.map((m) => `<td>${m.value.toFixed(0)}</td>`).join("")}
              <td>${(row.total / 12).toFixed(0)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
      <div class="course-tags">
        ${courseAllocations.map((alloc) => {
          const label = `${alloc.courseCode ?? ""} ${alloc.courseName ?? ""}`.trim();
          return `<span class=\"course-tag\">${label}</span>`;
        }).join("") || "<span class=\"cost-meta\">No courses</span>"}
      </div>
    `;
    costView.appendChild(card);
  });
}
