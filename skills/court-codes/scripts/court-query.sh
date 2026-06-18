#!/bin/bash
# 法院代字查询脚本
# 用法: ./court-query.sh <查询关键词>

DATA_FILE="$(dirname "$0")/../data/court-codes.json"

if [ -z "$1" ]; then
    echo "用法: $0 <查询关键词>"
    echo "示例: $0 北京"
    echo "      $0 朝阳区"
    echo "      $0 民初"
    exit 1
fi

KEYWORD="$1"

echo "=== 法院代字查询结果 ==="
echo "查询关键词: $KEYWORD"
echo ""

# 使用jq进行JSON查询（如果可用）
if command -v jq &> /dev/null; then
    echo "--- 高级人民法院 ---"
    jq -r ".provincialHighCourts[] | select(.courtName | contains(\"$KEYWORD\")) | \"\(.courtName)\t\(.courtCode)\t\(.regionCode)\" " "$DATA_FILE" 2>/dev/null

    echo ""
    echo "--- 北京市法院 ---"
    for key in highCourt intermediateCourts basicCourts specializedCourts; do
        jq -r ".$key[]? | select(.courtName | contains(\"$KEYWORD\")) | \"\(.courtName)\t\(.courtCode)\" " "$DATA_FILE" 2>/dev/null
    done

    echo ""
    echo "--- 上海市法院 ---"
    jq -r ".shanghai[]? | select(.courtName | contains(\"$KEYWORD\")) | \"\(.courtName)\t\(.courtCode)\" " "$DATA_FILE" 2>/dev/null

    echo ""
    echo "--- 专门法院 ---"
    jq -r ".specializedCourts.*[]? | select(.courtName | contains(\"$KEYWORD\")) | \"\(.courtName)\t\(.courtCode)\" " "$DATA_FILE" 2>/dev/null

    echo ""
    echo "--- 案件类型代字 ---"
    jq -r "to_entries[] | select(.key | contains(\"$KEYWORD\")) | \"\(.key)=\(.value)\" " "$DATA_FILE" 2>/dev/null
else
    echo "提示: 安装jq可以获得更好的查询体验"
    echo "      sudo apt install jq"
    echo ""

    # 基础文本搜索
    grep -i "$KEYWORD" "$DATA_FILE" | head -20
fi
