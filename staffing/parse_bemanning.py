#!/usr/bin/env python
import json
import math
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd


@dataclass
class AllocationColumn:
    name_col: int
    percent_col: Optional[int]
    hours_col: Optional[int]
    role: str


def _norm(text: Any) -> str:
    if text is None:
        return ""
    return str(text).strip().lower().replace("\n", " ")


def _num(val: Any) -> Optional[float]:
    if val is None:
        return None
    if isinstance(val, (int, float)):
        if isinstance(val, float) and math.isnan(val):
            return None
        return float(val)
    s = str(val).strip()
    if not s or s.lower() in {"nan", "none"}:
        return None
    s = s.replace(" ", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def find_header_row(df: pd.DataFrame) -> int:
    for i in range(len(df)):
        row = [_norm(c) for c in df.iloc[i].tolist()]
        if "code" in row and "name" in row and "credits" in row:
            return i
    # fallback: first row that mentions "teacher 1"
    for i in range(len(df)):
        row = [_norm(c) for c in df.iloc[i].tolist()]
        if any("teacher 1" in c for c in row):
            return i
    raise ValueError("Could not locate header row")


def extract_columns(headers: List[str]) -> Tuple[Dict[str, int], List[AllocationColumn]]:
    col_index = {h: i for i, h in enumerate(headers)}

    def find_exact(name: str) -> Optional[int]:
        return col_index.get(name)

    base_cols = {}
    for key in ["code", "name", "credits", "period(s)", "programme", "program", "budget 2026 (number of working hours per course)", "prognos t1 2026 (number of working hours per course) enl programansvarig/avd chef", "the name of the course coordinator (first name initital letter last name)"]:
        if key in col_index:
            base_cols[key] = col_index[key]

    # Teacher columns are grouped: name, % of course, WH hours
    teacher_map: Dict[str, Dict[str, int]] = {}
    student_map: Dict[str, Dict[str, int]] = {}

    for idx, h in enumerate(headers):
        if not h:
            continue

        teacher_match = re.search(r"teacher\s*(\d+)", h)
        larare_match = re.search(r"l[aä]rare\s*(\d+)", h)
        if teacher_match or larare_match:
            num = (teacher_match or larare_match).group(1)
            teacher_map.setdefault(num, {})
            if "wh" in h:
                teacher_map[num]["hours"] = idx
            elif "%" in h or "av kursen" in h:
                teacher_map[num]["percent"] = idx
            else:
                teacher_map[num]["name"] = idx
            continue

        if "studentassistent" in h:
            student_map.setdefault("student", {})
            if "wh" in h:
                student_map["student"]["hours"] = idx
            elif "%" in h or "av kursen" in h:
                student_map["student"]["percent"] = idx
            else:
                student_map["student"]["name"] = idx

    allocations: List[AllocationColumn] = []
    for num, cols in sorted(teacher_map.items(), key=lambda x: int(x[0])):
        if "name" in cols:
            allocations.append(
                AllocationColumn(
                    name_col=cols["name"],
                    percent_col=cols.get("percent"),
                    hours_col=cols.get("hours"),
                    role="teacher",
                )
            )

    if "student" in student_map and "name" in student_map["student"]:
        cols = student_map["student"]
        allocations.append(
            AllocationColumn(
                name_col=cols["name"],
                percent_col=cols.get("percent"),
                hours_col=cols.get("hours"),
                role="student_assistant",
            )
        )

    return base_cols, allocations


def parse_file(path: Path) -> Dict[str, Any]:
    xl = pd.ExcelFile(path)
    sheet = xl.sheet_names[0]
    df = pd.read_excel(xl, sheet, header=None)

    header_row = find_header_row(df)
    headers = [_norm(c) for c in df.iloc[header_row].tolist()]
    base_cols, alloc_cols = extract_columns(headers)

    code_col = base_cols.get("code")
    name_col = base_cols.get("name")
    credits_col = base_cols.get("credits")
    period_col = base_cols.get("period(s)")
    program_col = base_cols.get("programme") or base_cols.get("program")
    budget_hours_col = base_cols.get("budget 2026 (number of working hours per course)")
    forecast_hours_col = base_cols.get("prognos t1 2026 (number of working hours per course) enl programansvarig/avd chef")
    coordinator_col = base_cols.get("the name of the course coordinator (first name initital letter last name)")

    courses = []
    people: Dict[str, Dict[str, Any]] = {}

    for row_idx in range(header_row + 1, len(df)):
        row = df.iloc[row_idx]
        code = row[code_col] if code_col is not None else None
        name = row[name_col] if name_col is not None else None

        if (code is None or (isinstance(code, float) and math.isnan(code))) and (name is None or (isinstance(name, float) and math.isnan(name))):
            continue

        if pd.isna(code) and pd.isna(name):
            continue

        course = {
            "code": str(code).strip() if not pd.isna(code) else None,
            "name": str(name).strip() if not pd.isna(name) else None,
            "credits": _num(row[credits_col]) if credits_col is not None else None,
            "periods": row[period_col] if period_col is not None else None,
            "program": str(row[program_col]).strip() if program_col is not None and not pd.isna(row[program_col]) else None,
            "budget_hours": _num(row[budget_hours_col]) if budget_hours_col is not None else None,
            "forecast_hours": _num(row[forecast_hours_col]) if forecast_hours_col is not None else None,
            "coordinator": str(row[coordinator_col]).strip() if coordinator_col is not None and not pd.isna(row[coordinator_col]) else None,
            "allocations": [],
        }

        for alloc in alloc_cols:
            raw_name = row[alloc.name_col]
            if pd.isna(raw_name) or str(raw_name).strip() == "":
                continue

            name_str = str(raw_name).strip()
            percent = _num(row[alloc.percent_col]) if alloc.percent_col is not None else None
            hours = _num(row[alloc.hours_col]) if alloc.hours_col is not None else None

            if (percent in (None, 0.0)) and (hours in (None, 0.0)):
                continue

            allocation = {
                "person": name_str,
                "role": alloc.role,
                "percent": percent,
                "hours": hours,
            }
            course["allocations"].append(allocation)

            person = people.setdefault(name_str, {"name": name_str, "allocations": []})
            person["allocations"].append(
                {
                    "course_code": course["code"],
                    "course_name": course["name"],
                    "role": alloc.role,
                    "percent": percent,
                    "hours": hours,
                }
            )

        courses.append(course)

    return {"courses": courses, "people": list(people.values())}


def main() -> None:
    data = parse_file(Path("bemanning.xlsx"))
    print(json.dumps(data, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
