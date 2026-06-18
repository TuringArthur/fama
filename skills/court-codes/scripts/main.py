# -*- coding: utf-8 -*-
"""
法院代字查询脚本（Python 版）
替代 bash 脚本，支持跨平台运行。

用法:
  python main.py --query <关键词>          # 查询法院代字
  python main.py --generate <法院代字> <案件类型> [年份] [序号]  # 生成案号

也可通过 stdin 传入 JSON 参数:
  {"query": "北京市朝阳区人民法院"}
  {"action": "generate", "court_code": "京05", "case_type": "民初", "year": 2026, "seq": 1}
"""

import json
import sys
import os
import re
from pathlib import Path

# 参数 schema 供 ScriptSkill 提取
PARAM_SCHEMA = {
    "type": "object",
    "properties": {
        "query": {"type": "string", "description": "查询关键词（法院名称/代字）"},
        "action": {"type": "string", "enum": ["query", "generate"], "description": "操作类型"},
        "court_code": {"type": "string", "description": "法院代字（生成案号时使用）"},
        "case_type": {"type": "string", "description": "案件类型（生成案号时使用）"},
        "year": {"type": "integer", "description": "年份（生成案号时使用）"},
        "seq": {"type": "integer", "description": "序号（生成案号时使用）"},
    },
    "required": [],
}


def load_data():
    """加载法院代字数据"""
    data_file = Path(__file__).parent.parent / "data" / "court-codes.json"
    if not data_file.exists():
        return None
    with open(data_file, "r", encoding="utf-8") as f:
        return json.load(f)


def query_court(data, keyword):
    """按关键词查询法院代字"""
    results = []
    keyword_lower = keyword.lower()

    all_courts = data.get("allCourts", [])
    for court in all_courts:
        name = court.get("courtName", "")
        code = court.get("courtCode", "")
        region = court.get("regionName", "")
        if (keyword_lower in name.lower() or
                keyword_lower in code.lower() or
                keyword_lower in region.lower()):
            results.append({
                "courtName": name,
                "courtCode": code,
                "regionCode": court.get("regionCode", ""),
                "regionName": region,
                "courtLevel": court.get("courtLevel", -1),
            })

    return results


# 案件类型代字映射（法定标准）
CASE_TYPE_CODES = {
    "刑事一审": "刑初",
    "刑事二审": "刑终",
    "民事一审": "民初",
    "民事二审": "民终",
    "行政一审": "行初",
    "行政二审": "行终",
    "执行案件": "执",
    "国家赔偿": "赔",
    "刑初": "刑初",
    "刑终": "刑终",
    "民初": "民初",
    "民终": "民终",
    "行初": "行初",
    "行终": "行终",
    "执": "执",
    "赔": "赔",
}


def generate_case_number(court_code, case_type, year=None, seq=1):
    """生成案号"""
    import datetime
    if year is None:
        year = datetime.datetime.now().year

    type_code = CASE_TYPE_CODES.get(case_type, case_type)
    seq_formatted = f"{int(seq):06d}"
    case_number = f"{court_code}{type_code}{year}{seq_formatted}号"

    return {
        "courtCode": court_code,
        "caseType": case_type,
        "typeCode": type_code,
        "year": year,
        "seq": seq,
        "caseNumber": case_number,
    }


LEVEL_NAMES = {
    0: "最高人民法院",
    1: "高级人民法院",
    2: "中级人民法院",
    3: "基层人民法院",
    4: "专门法院",
}


def main():
    data = load_data()
    if data is None:
        result = {"success": False, "error": "无法加载法院代字数据文件"}
        print(json.dumps(result, ensure_ascii=False))
        sys.exit(1)

    # 尝试从命令行参数或 stdin 获取输入
    params = {}

    # 先检查环境变量
    env_params = os.environ.get("SKILL_PARAMS", "")
    if env_params:
        try:
            params = json.loads(env_params)
        except json.JSONDecodeError:
            pass

    # 如果环境变量没有，检查 stdin
    if not params and not sys.stdin.isatty():
        try:
            stdin_data = sys.stdin.read().strip()
            if stdin_data:
                params = json.loads(stdin_data)
        except (json.JSONDecodeError, IOError):
            pass

    # 如果还没有，检查命令行参数
    if not params:
        if len(sys.argv) < 2:
            result = {
                "success": True,
                "message": "法院代字查询工具",
                "usage": {
                    "query": "python main.py --query <关键词>",
                    "generate": "python main.py --generate <法院代字> <案件类型> [年份] [序号]",
                },
                "caseTypeCodes": CASE_TYPE_CODES,
            }
            print(json.dumps(result, ensure_ascii=False, indent=2))
            sys.exit(0)

        if sys.argv[1] == "--query" and len(sys.argv) >= 3:
            params = {"query": sys.argv[2]}
        elif sys.argv[1] == "--generate" and len(sys.argv) >= 4:
            params = {
                "action": "generate",
                "court_code": sys.argv[2],
                "case_type": sys.argv[3],
                "year": int(sys.argv[4]) if len(sys.argv) > 4 else None,
                "seq": int(sys.argv[5]) if len(sys.argv) > 5 else 1,
            }
        else:
            params = {"query": sys.argv[1]}

    # 执行操作
    action = params.get("action", "query")

    if action == "generate":
        court_code = params.get("court_code", "")
        case_type = params.get("case_type", "")
        year = params.get("year")
        seq = params.get("seq", 1)
        result = {
            "success": True,
            "result": generate_case_number(court_code, case_type, year, seq),
        }
    else:
        keyword = params.get("query", params.get("keyword", ""))
        if not keyword:
            result = {"success": False, "error": "缺少查询关键词"}
        else:
            matches = query_court(data, keyword)
            result = {
                "success": True,
                "query": keyword,
                "count": len(matches),
                "results": matches[:20],
            }

    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
