#!/bin/bash
# 案号生成脚本
# 用法: ./case-number-generator.sh <法院代字> <案件类型> [年份] [序号]

DATA_FILE="$(dirname "$0")/../data/court-codes.json"

if [ -z "$1" ] || [ -z "$2" ]; then
    echo "用法: $0 <法院代字> <案件类型> [年份] [序号]"
    echo ""
    echo "案件类型代字:"
    if command -v jq &> /dev/null; then
        jq -r '.caseTypeCodes | to_entries[] | "\(.key)=\(.value)"' "$DATA_FILE"
    else
        echo "  刑事一审=刑初  刑事二审=刑终"
        echo "  民事一审=民初  民事二审=民终"
        echo "  行政一审=行初  行政二审=行终"
        echo "  执行案件=执    国家赔偿=赔"
    fi
    echo ""
    echo "示例:"
    echo "  $0 京01 刑初 2026 1"
    echo "  $0 沪02 民终 2026 100"
    exit 1
fi

COURT_CODE="$1"
CASE_TYPE="$2"
YEAR="${3:-$(date +%Y)}"
SEQ="${4:-1}"

# 获取案件类型代字
if command -v jq &> /dev/null; then
    TYPE_CODE=$(jq -r ".caseTypeCodes[\"$CASE_TYPE\"] // \"$CASE_TYPE\"" "$DATA_FILE")
else
    TYPE_CODE="$CASE_TYPE"
fi

# 格式化序号为6位
SEQ_FORMATTED=$(printf "%06d" "$SEQ")

# 生成案号
CASE_NUMBER="${COURT_CODE}${TYPE_CODE}${YEAR}${SEQ_FORMATTED}号"

echo "=== 案号生成结果 ==="
echo "法院代字: $COURT_CODE"
echo "案件类型: $CASE_TYPE"
echo "类型代字: $TYPE_CODE"
echo "年份: $YEAR"
echo "序号: $SEQ"
echo "---"
echo "生成案号: $CASE_NUMBER"
