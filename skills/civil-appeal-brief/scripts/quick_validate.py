#!/usr/bin/env python3
"""
民事上诉状技能验证脚本
验证SKILL.md的frontmatter格式和结构完整性
"""

import os
import re
import sys

def validate_frontmatter(file_path):
    """验证SKILL.md的frontmatter格式"""
    errors = []
    warnings = []

    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # 检查是否以---开头
    if not content.strip().startswith('---'):
        errors.append("SKILL.md必须以YAML frontmatter开头（第一行必须是---）")
        return errors, warnings

    # 提取frontmatter
    frontmatter_match = re.match(r'^---\s*\n(.*?)\n---', content, re.DOTALL)
    if not frontmatter_match:
        errors.append("无法解析YAML frontmatter，请检查格式")
        return errors, warnings

    frontmatter = frontmatter_match.group(1)

    # 检查必需字段
    if 'name:' not in frontmatter:
        errors.append("frontmatter缺少name字段")
    else:
        name_match = re.search(r'name:\s*(.+)', frontmatter)
        if name_match:
            name = name_match.group(1).strip()
            if not re.match(r'^[a-z0-9-]+$', name):
                errors.append(f"name字段格式错误：'{name}'，应使用小写字母、数字和连字符")
            if ' ' in name:
                warnings.append(f"name字段可能包含空格：'{name}'")

    if 'description:' not in frontmatter:
        errors.append("frontmatter缺少description字段")
    else:
        desc_match = re.search(r'description:\s*(.+)', frontmatter)
        if desc_match:
            desc = desc_match.group(1).strip()
            if len(desc) < 10:
                warnings.append("description字段内容过短，可能不够详细")
            if 'Use when' not in desc and '当用户' not in desc:
                warnings.append("description建议包含触发短语（如'Use when'或'当用户'）")

    # 检查frontmatter之后的内容
    after_frontmatter = content[frontmatter_match.end():].strip()
    if after_frontmatter.startswith('#'):
        pass  # OK - 以标题开头是正常的
    elif after_frontmatter.startswith('---'):
        errors.append("frontmatter之后的内容不应以---开头")

    return errors, warnings

def validate_meta_json(file_path):
    """验证_meta.json格式"""
    errors = []
    warnings = []

    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # 简单检查是否为有效JSON
    import json
    try:
        data = json.loads(content)
    except json.JSONDecodeError as e:
        errors.append(f"_meta.json格式错误：{e}")
        return errors, warnings

    # 检查必需字段
    if 'id' not in data:
        errors.append("_meta.json缺少id字段")
    else:
        if not isinstance(data['id'], (int, str)):
            errors.append("_meta.json的id字段应为数字或字符串")

    if 'version' not in data:
        errors.append("_meta.json缺少version字段")
    else:
        if not re.match(r'^\d+\.\d+\.\d+$', data['version']):
            warnings.append(f"version字段格式不规范：'{data['version']}'，建议使用语义化版本格式（如1.0.0）")

    return errors, warnings

def validate_structure(skill_dir):
    """验证技能目录结构"""
    errors = []
    warnings = []

    required_files = ['SKILL.md', '_meta.json']
    for file in required_files:
        file_path = os.path.join(skill_dir, file)
        if not os.path.exists(file_path):
            errors.append(f"缺少必需文件：{file}")

    # 检查references目录
    references_dir = os.path.join(skill_dir, 'references')
    if os.path.exists(references_dir):
        ref_files = os.listdir(references_dir)
        if ref_files:
            print(f"  ✓ references目录包含 {len(ref_files)} 个参考文件")
        else:
            warnings.append("references目录存在但为空")

    return errors, warnings

def main():
    skill_dir = os.path.dirname(os.path.abspath(__file__))
    if skill_dir.endswith('/scripts'):
        skill_dir = os.path.dirname(skill_dir)

    print("=" * 50)
    print("民事上诉状技能 - 验证脚本")
    print("=" * 50)
    print(f"\n技能目录：{skill_dir}\n")

    all_errors = []
    all_warnings = []

    # 验证SKILL.md
    print("1. 验证 SKILL.md frontmatter...")
    skill_md = os.path.join(skill_dir, 'SKILL.md')
    if os.path.exists(skill_md):
        errors, warnings = validate_frontmatter(skill_md)
        all_errors.extend(errors)
        all_warnings.extend(warnings)
        if errors:
            for e in errors:
                print(f"   ✗ {e}")
        else:
            print("   ✓ frontmatter格式正确")
        for w in warnings:
            print(f"   ⚠ {w}")
    else:
        print(f"   ✗ 文件不存在：{skill_md}")
        all_errors.append("SKILL.md文件不存在")

    # 验证_meta.json
    print("\n2. 验证 _meta.json...")
    meta_json = os.path.join(skill_dir, '_meta.json')
    if os.path.exists(meta_json):
        errors, warnings = validate_meta_json(meta_json)
        all_errors.extend(errors)
        all_warnings.extend(warnings)
        if errors:
            for e in errors:
                print(f"   ✗ {e}")
        else:
            print("   ✓ _meta.json格式正确")
        for w in warnings:
            print(f"   ⚠ {w}")
    else:
        print(f"   ✗ 文件不存在：{meta_json}")
        all_errors.append("_meta.json文件不存在")

    # 验证目录结构
    print("\n3. 验证目录结构...")
    errors, warnings = validate_structure(skill_dir)
    all_errors.extend(errors)
    all_warnings.extend(warnings)
    if errors:
        for e in errors:
            print(f"   ✗ {e}")
    else:
        print("   ✓ 目录结构完整")
    for w in warnings:
        print(f"   ⚠ {w}")

    # 输出总结
    print("\n" + "=" * 50)
    if all_errors:
        print(f"验证结果：失败 ({len(all_errors)} 个错误)")
        for e in all_errors:
            print(f"  - {e}")
        return 1
    else:
        print("验证结果：通过")
        if all_warnings:
            print(f"({len(all_warnings)} 个警告)")
        return 0

if __name__ == '__main__':
    sys.exit(main())
