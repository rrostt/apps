// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderLists, renderDetail, renderTimeline, renderCosting } from "../app_ui.js";

function buildDOM() {
  document.body.innerHTML = `
    <input id="courseSearch" />
    <input id="personSearch" />
    <div id="courseList"></div>
    <div id="personList"></div>
    <div id="detailTitle"></div>
    <div id="detailMeta"></div>
    <div id="detailView"></div>
    <div id="timeline"></div>
    <template id="allocationRowTpl">
      <div class="allocation">
        <div class="alloc-name"></div>
        <div class="alloc-role"></div>
        <input class="alloc-percent" />
        <input class="alloc-hours" />
        <button class="alloc-remove"></button>
      </div>
    </template>
  `;
  return {
    courseSearch: document.getElementById("courseSearch"),
    personSearch: document.getElementById("personSearch"),
    courseList: document.getElementById("courseList"),
    personList: document.getElementById("personList"),
    detailTitle: document.getElementById("detailTitle"),
    detailMeta: document.getElementById("detailMeta"),
    detailView: document.getElementById("detailView"),
    timeline: document.getElementById("timeline"),
    allocationTemplate: document.getElementById("allocationRowTpl"),
  };
}

describe("renderLists and renderDetail", () => {
  it("renders courses and people lists", () => {
    const dom = buildDOM();
    const state = {
      courses: [{
        id: "c1",
        code: "TST100",
        name: "Test",
        program: "X",
        credits: 7.5,
        allocations: [{ person: "Alice" }],
      }],
      people: [{ id: "Alice", name: "Alice", allocations: [{ courseCode: "TST100" }] }],
      selectedCourseId: null,
      selectedPersonId: null,
    };

    renderLists({
      state,
      ...dom,
      onSelectCourse: () => {},
      onSelectPerson: () => {},
      onDragPerson: () => {},
    });

    expect(dom.courseList.children.length).toBe(2);
    expect(dom.personList.children.length).toBe(1);
    expect(dom.courseList.textContent).toContain("Alice");
    expect(dom.personList.textContent).toContain("TST100");
  });

  it("renders course allocations", () => {
    const dom = buildDOM();
    const state = {
      courses: [{
        id: "c1",
        code: "TST100",
        name: "Test",
        budgetHours: 200,
        periods: "1",
        allocations: [{ person: "Alice", role: "teacher", percent: 50, hours: 100 }],
      }],
      people: [{ id: "Alice", name: "Alice", allocations: [] }],
      selectedCourseId: "c1",
      selectedPersonId: null,
    };

    renderDetail({
      state,
      detailTitle: dom.detailTitle,
      detailMeta: dom.detailMeta,
      detailView: dom.detailView,
      allocationTemplate: dom.allocationTemplate,
      onAssignPerson: () => {},
      onChangePercent: () => {},
      onChangeHours: () => {},
      onRemoveAllocation: () => {},
      onRemoveCourse: () => {},
      onEditCourse: () => {},
    });

    expect(dom.detailView.querySelectorAll(".allocation").length).toBe(1);
    expect(dom.detailTitle.textContent).toContain("TST100");
  });

  it("renders timeline buckets", () => {
    const dom = buildDOM();
    const state = {
      courses: [{
        id: "c1",
        code: "TST100",
        name: "Test",
        program: "X",
        periods: "P3-P4",
        credits: 7.5,
        allocations: [{ person: "Alice" }],
      }],
      people: [],
      selectedCourseId: null,
      selectedPersonId: null,
    };

    renderTimeline({ state, timeline: dom.timeline, onSelectCourse: () => {}, onAssignPerson: () => {}, onAddCourse: () => {} });

    expect(dom.timeline.textContent).toContain("Period 3");
    expect(dom.timeline.textContent).toContain("Period 4");
    expect(dom.timeline.textContent).toContain("TST100");
    expect(dom.timeline.textContent).toContain("X");
    expect(dom.timeline.textContent).toContain("7.5");
    expect(dom.timeline.textContent).toContain("Alice");
    const item = dom.timeline.querySelector(".timeline-item");
    expect(item.style.gridColumn).toBe("1 / 3");
  });

  it("normalizes period ranges with labels", () => {
    const dom = buildDOM();
    const state = {
      courses: [{
        id: "c2",
        code: "TST200",
        name: "Range Course",
        program: "Y",
        periods: "Period 3-4",
        credits: 15,
        allocations: [{ person: "Bob" }],
      }],
      people: [],
      selectedCourseId: null,
      selectedPersonId: null,
    };

    renderTimeline({ state, timeline: dom.timeline, onSelectCourse: () => {}, onAssignPerson: () => {}, onAddCourse: () => {} });

    expect(dom.timeline.textContent).toContain("Period 3");
    expect(dom.timeline.textContent).toContain("Period 4");
    expect(dom.timeline.textContent).toContain("TST200");
  });

  it("renders costing view", () => {
    const dom = buildDOM();
    const state = {
      costData: {
        people: [{
          name: "Alice",
          rows: [{ verksamhet: "Education", fritt: "37", months: [{ label: "Jan", value: 120 }], total: 120 }],
          total: 120,
        }],
      },
      people: [{ name: "Alice", allocations: [{ courseCode: "TST100", courseName: "Test" }] }],
    };
    renderCosting({ state, costView: dom.detailView });
    expect(dom.detailView.textContent).toContain("Alice");
    expect(dom.detailView.textContent).toContain("Jan");
    expect(dom.detailView.textContent).toContain("Education");
    expect(dom.detailView.textContent).toContain("37");
    expect(dom.detailView.textContent).toContain("TST100");
  });
});
