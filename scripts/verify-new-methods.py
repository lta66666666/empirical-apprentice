import hashlib
import importlib.util
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location("cloud_artifacts", ROOT / "executor" / "cloud_artifacts.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

PLANS = {
    "event_study": {
        "method": "event_study", "outcome": "v0", "predictors": ["v1"], "unit": "v2",
        "time": "v3", "treated": "v4", "policy_year": 2021, "window": [3, 2],
        "reference_period": -1, "vcov": "cluster", "cluster": "v2", "missing": "block",
        "labels": {"v0": "y", "v1": "x", "v4": "treated"},
    },
    "iv_2sls_fe": {
        "method": "iv_2sls", "outcome": "v0", "endogenous": "v4", "instruments": ["v5"],
        "predictors": ["v1"], "unit": "v2", "time": "v3", "vcov": "cluster",
        "cluster": "v2", "missing": "block",
        "labels": {"v0": "y", "v1": "x", "v4": "d", "v5": "z"},
    },
    "iv_2sls_no_fe": {
        "method": "iv_2sls", "outcome": "v0", "endogenous": "v4", "instruments": ["v5"],
        "predictors": ["v1"], "vcov": "hetero", "missing": "block",
        "labels": {"v0": "y", "v1": "x", "v4": "d", "v5": "z"},
    },
    "staggered_did_never": {
        "method": "staggered_did", "outcome": "v0", "predictors": ["v1"], "unit": "v2",
        "time": "v3", "first_treat": "v5", "control_group": "nevertreated",
        "absorbing_confirmed": True, "vcov": "cluster", "cluster": "v2",
        "missing": "block", "labels": {"v0": "y", "v1": "x", "v5": "first_treat"},
    },
    "staggered_did_notyet": {
        "method": "staggered_did", "outcome": "v0", "predictors": ["v1"], "unit": "v2",
        "time": "v3", "first_treat": "v5", "control_group": "notyettreated",
        "absorbing_confirmed": True, "vcov": "cluster", "cluster": "v2",
        "missing": "block", "labels": {"v0": "y", "v1": "x", "v5": "first_treat"},
    },
}

EXPECTED = {"staggered_did_never": ("csdid ", "bacondecomp "), "staggered_did_notyet": ("csdid ", "notyet", "bacondecomp ")}

checks = []
for name, plan in PLANS.items():
    text, manifest = MODULE.teaching(plan)
    assert manifest["sha256"] == hashlib.sha256(text.encode()).hexdigest(), name
    assert manifest["commands"], name
    assert manifest["core_command"] in text, name
    assert "待验收" not in text, name
    if name in EXPECTED:
        assert all(command in text for command in EXPECTED[name]), name
    else:
        assert any(command in text for command in ("reghdfe", "ivreghdfe", "ivreg2")), name
    assert "executed" in manifest and manifest["executed"] is False, name
    r_code = manifest.get("r_code", "")
    assert r_code and manifest["r_sha256"] == hashlib.sha256(r_code.encode()).hexdigest(), name
    assert ("att_gt(" in r_code) if name.startswith("staggered") else ("feols(" in r_code), name
    assert "本脚本未在 R 中实际运行" in r_code, name
    checks.append(name)

print(json.dumps({"checks": checks, "scope": "Stata and R corresponding-code templates only; not executed"}))
