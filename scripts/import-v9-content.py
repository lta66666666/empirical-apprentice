"""Copy reviewed V9 teaching content into the independent Sites source tree.

Run only from the local handoff workspace. Deployment reads the generated JSON;
it does not require the original V9 project or Python.
"""

from pathlib import Path
import json
import sys
import yaml

site = Path(__file__).resolve().parents[1]
original = site.parent / "agent1"
sys.path.insert(0, str(original))
from backend.tutorial import STEPS, CSV, BROKEN  # noqa: E402
curriculum = yaml.safe_load((original / "backend/curriculum/path_zero.yaml").read_text(encoding="utf-8"))
cases = json.loads((original / "frontend/teaching/case_config.json").read_text(encoding="utf-8"))
practice_cases = {
    path.stem: yaml.safe_load(path.read_text(encoding="utf-8"))
    for path in sorted((original / "backend/cases").glob("case_*.yaml"))
}
for lesson in curriculum["lessons"]:
    case = cases[lesson.get("case_id", "main")]
    lesson["case_label"] = case["label"]
    for key in ("intro", "guide", "example"):
        if isinstance(lesson.get(key), str):
            lesson[key] = lesson[key].replace("{{case.summary}}", case["summary"])

(site / "worker/curriculum.json").write_text(
    json.dumps(curriculum, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
)
(site / "worker/case_config.json").write_text(
    json.dumps(cases, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
)
(site / "worker/content.js").write_text(
    "export const curriculum = "
    + json.dumps(curriculum, ensure_ascii=False, separators=(",", ":"))
    + ";\nexport const caseConfig = "
    + json.dumps(cases, ensure_ascii=False, separators=(",", ":"))
    + ";\nexport const tutorialSteps = "
    + json.dumps(STEPS, ensure_ascii=False, separators=(",", ":"))
    + ";\nexport const tutorialCsv = " + json.dumps(CSV, ensure_ascii=False)
    + ";\nexport const tutorialBroken = " + json.dumps(BROKEN, ensure_ascii=False)
    + ";\nexport const practiceCases = " + json.dumps(practice_cases, ensure_ascii=False, separators=(",", ":"))
    + ";\n",
    encoding="utf-8",
)
print(f"Imported {len(curriculum['lessons'])} V9 lessons, {len(cases)} case configurations, and {len(practice_cases)} practice cases.")
