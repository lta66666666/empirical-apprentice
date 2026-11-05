"""实证学徒 · 4 城市同批 DID 教学实验。仅使用 Python 标准库。

运行：python3 run_demo.py（Windows 也可用 py run_demo.py）
所有数据均人为设置；此脚本不做统计推断，不输出真实政策结论。
"""
from pathlib import Path
import csv
import json
from statistics import mean, stdev

ROOT = Path(__file__).resolve().parent


def read_csv(path):
    with Path(path).open(encoding="utf-8-sig", newline="") as stream:
        return list(csv.DictReader(stream))


def clean_rows(raw, corrections):
    """① 审计唯一键；② 只删除完全重复；③ 依据明确的模拟补充表恢复缺失。"""
    fixes = {}
    for row in corrections:
        key = (row["city"], row["year"])
        if key in fixes:
            raise ValueError(f"补充表键重复：{key}")
        fixes[key] = row["energy"]
    seen, cleaned = {}, []
    log = {"input_rows": len(raw), "exact_duplicates_removed": 0,
           "missing_values_restored": 0, "output_rows": 0,
           "source": "全部模拟；补值仅来自同包 correction.csv"}
    for row in raw:
        key = (row["city"], row["year"])
        if key in seen:
            if row != seen[key]:
                raise ValueError(f"同一城市—年份数值冲突，需人工核对：{key}")
            log["exact_duplicates_removed"] += 1
            continue
        seen[key] = row.copy()
        energy = row["energy"]
        if not energy.strip():
            if key not in fixes:
                raise ValueError(f"缺失值没有补充依据：{key}。不得自动填零。")
            energy = fixes[key]
            log["missing_values_restored"] += 1
        treated, year = int(row["treated"]), int(row["year"])
        if treated not in (0, 1) or float(energy) < 0:
            raise ValueError(f"异常值，需核对：{key}")
        # 此实验为同批实施，统一从 2015 年 1 月起。分批研究不能照抄这一行。
        post = int(year >= 2015)
        cleaned.append({"city": row["city"], "year": year,
                        "energy": float(energy), "treated": treated,
                        "post": post, "did": treated * post})
    log["output_rows"] = len(cleaned)
    cleaned.sort(key=lambda r: (r["city"], r["year"]))
    return cleaned, log


def summarize(rows):
    """④ 等权城市均值及样本标准差；每组每年分别报告，避免掩盖覆盖问题。"""
    result = []
    for year in sorted({r["year"] for r in rows}):
        for group in (0, 1):
            values = [r["energy"] for r in rows if r["year"] == year and r["treated"] == group]
            if not values:
                raise ValueError(f"缺少组别—年份数据：{group}, {year}")
            result.append({"year": year, "treated": group, "n": len(values),
                           "mean_energy": mean(values),
                           "sample_sd": stdev(values) if len(values) > 1 else "",
                           "min": min(values), "max": max(values)})
    return result


def calculate_did(summary, before=2014, after=2015):
    """⑤ 两次相减。窗口必须明确；不要用全部年份覆盖掉当前二期定义。"""
    def cell(year, group):
        matches = [r for r in summary if r["year"] == year and r["treated"] == group]
        if len(matches) != 1:
            raise ValueError(f"计算窗口缺失或重复：{year}, {group}")
        return matches[0]["mean_energy"]
    change_t = cell(after, 1) - cell(before, 1)
    change_c = cell(after, 0) - cell(before, 0)
    return {"before": before, "after": after, "treated_change": change_t,
            "control_change": change_c, "did": change_t - change_c,
            "unit": "万吨标准煤（模拟）"}


def write_csv(path, rows):
    with path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def main():
    # 输入均由脚本位置定位，不依赖用户打开终端时的目录。
    raw = read_csv(ROOT / "panel_raw.csv")
    cleaned, audit = clean_rows(raw, read_csv(ROOT / "correction.csv"))
    summary = summarize(cleaned)
    result = calculate_did(summary)
    # 重复运行仅覆盖本实验的 outputs；不改原始文件。
    output = ROOT / "outputs"
    output.mkdir(exist_ok=True)
    write_csv(output / "panel_clean.csv", cleaned)
    write_csv(output / "descriptive_statistics.csv", summary)
    for name, data in (("cleaning_log", audit), ("did_result", result)):
        (output / f"{name}.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    memo = f"""# 模拟教学实验备忘录

问题：练习同批实施政策的两组变化之差，不能据此推断真实政策效果。

数据：4 个模拟城市，2013–2016 年；A、B 为试点，C、D 为对照。
政策：统一从 2015 年 1 月开始（与课程第 2 阶段分批阅读案例分开）。

清洗：{audit['input_rows']} 行 → 删除完全重复 {audit['exact_duplicates_removed']} 行
→ 根据模拟补充表恢复 {audit['missing_values_restored']} 个缺失值 → {audit['output_rows']} 行。

计算窗口：{result['before']}–{result['after']}。
试点变化 = {result['treated_change']}，对照变化 = {result['control_change']}。
DID = {result['did']} 万吨标准煤（模拟）。

局限：数值人为设置、城市数极少，未估计标准误或置信区间；没有验证因果识别条件。
两组水平可以不同；因果解释仍需要无政策反事实的平行趋势、无差异干扰等条件。
课程中的事件研究图和置信区间图是独立示意，不是本脚本的统计输出。

下一步：为真实研究核对政策原文、进入时点、数据覆盖、比较对象，并请老师审阅设计。
"""
    (output / "research_memo.md").write_text(memo, encoding="utf-8")
    print(json.dumps({"cleaning": audit, "result": result}, ensure_ascii=False, indent=2))
    print("已保存 outputs；请核对清洗日志、分组均值与手算结果。没有进行显著性推断。")


if __name__ == "__main__":
    main()
