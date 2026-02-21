#!/usr/bin/env python3
"""Convert legacy CPA planner JSON into the new schema.

Usage:
  python convert_to_new_json.py input.json output.json
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def convert_legacy_to_new(data: dict[str, Any]) -> dict[str, Any]:
    if "schedule" in data and "curriculum" in data:
        return data

    home = data.get("home", {})
    details = data.get("details", {})
    modules = data.get("modules", {})

    curriculum: list[dict[str, Any]] = []

    for subject in home.get("subjects", []) or []:
        sid = subject.get("id")
        if not sid:
            continue

        detail = details.get(sid, {})
        cards_new: list[dict[str, Any]] = []

        for card in detail.get("cards", []) or []:
            module_id = card.get("module")
            module = modules.get(module_id, {}) if module_id else {}

            tabs_new: list[dict[str, Any]] = []
            for tab in module.get("tabs", []) or []:
                questions_new: list[dict[str, Any]] = []
                for q in tab.get("questions", []) or []:
                    questions_new.append(
                        {
                            "id": q.get("id"),
                            "src": q.get("src", ""),
                            "text": q.get("text", ""),
                            "userNote": q.get("userNote", ""),
                            "progress": {
                                "done": bool(q.get("done", False)),
                                "time": int(q.get("time", 0) or 0),
                                "isRunning": bool(q.get("isRunning", False)),
                            },
                        }
                    )

                tabs_new.append(
                    {
                        "id": tab.get("id"),
                        "label": tab.get("label", ""),
                        "theoryNote": tab.get("theoryNote", ""),
                        "progress": {
                            "done": bool(tab.get("done", False)),
                            "time": int(tab.get("time", 0) or 0),
                            "isRunning": bool(tab.get("isRunning", False)),
                        },
                        "questions": questions_new,
                    }
                )

            cards_new.append(
                {
                    "id": card.get("id"),
                    "title": card.get("title", ""),
                    "scope": card.get("scope", ""),
                    "qbox": card.get("qbox", ""),
                    "progress": {
                        "done": bool(card.get("done", False)),
                        "time": int(card.get("time", 0) or 0),
                        "isRunning": bool(card.get("isRunning", False)),
                    },
                    "module": {
                        "id": module.get("id", module_id),
                        "activeTab": module.get("activeTab", ""),
                        "tabs": tabs_new,
                    },
                }
            )

        curriculum.append(
            {
                "id": sid,
                "name": subject.get("name", ""),
                "examInfo": subject.get("examInfo", ""),
                "badge": subject.get("badge", ""),
                "progress": {
                    "done": bool(subject.get("done", False)),
                    "time": int(subject.get("time", 0) or 0),
                    "today": int(subject.get("today", 0) or 0),
                },
                "cards": cards_new,
            }
        )

    return {
        "meta": data.get("meta", {}),
        "schedule": {
            "dDays": home.get("dDays", []) or [],
            "dailyHistory": data.get("dailyHistory", {}) or {},
        },
        "curriculum": curriculum,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    src = json.loads(args.input.read_text(encoding="utf-8"))
    converted = convert_legacy_to_new(src)
    args.output.write_text(json.dumps(converted, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
