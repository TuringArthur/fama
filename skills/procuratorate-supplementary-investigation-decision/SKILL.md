---
name: procuratorate-supplementary-investigation-decision
description: 生成符合《法律文书写作（第五版）》规范的检察机关补充侦查决定书，涵盖首部、主文、尾部、附项完整结构，严格遵循刑事诉讼法及文书制作要求
version: 1.0.0
author: Legal Tech Innovation Team
---
parameters:
  - name: procuratorate_name
    type: string
    description: 作出补充侦查决定的人民检察院全称（如“北京市××区人民检察院”）
    required: true
  - name: document_number
    type: string
    description: 文书编号，格式严格为「××检××补侦〔××〕×号」（如“京朝检公诉补侦〔2020〕12号”）
    required: true
  - name: return_agency
    type: string
    description: 被退回补充侦查的机关（即报请审查的原公安机关，如“北京市公安局朝阳分局”）
    required: true
  - name: case_source
    type: object
    description: 案件来源基础信息
    properties:
      - name: agency_transfer_date
        type: string
        description: 移送机关移送案件的日期（格式：YYYY年MM月DD日）
        required: true
      - name: agency_transfer_doc_num
        type: string
        description: 移送机关的文书编号（如“京公朝诉字〔2020〕45号”）
        required: true
      - name: suspect_name
        type: string
        description: 本案犯罪嫌疑人姓名
        required: true
  - name: case_cause
    type: string
    description: 本案案由（如“赵××涉嫌诈骗罪”）
    required: true
  - name: suspect_basic_info
    type: object
    description: 犯罪嫌疑人基本身份信息
    properties:
      - name: full_name
        type: string
        description: 姓名
        required: true
      - name: gender
        type: string
        description: 性别
        required: true
      - name: birth_date
        type: string
        description: 出生日期（格式：YYYY年MM月DD日）
        required: true
      - name: work_unit
        type: string
        description: 工作单位（无则填“无”）
        required: false
      - name: residential_address
        type: string
        description: 住址
        required: true
      - name: citizen_id_number
        type: string
        description: 公民身份号码
        required: true
      - name: is_npc_deputy
        type: boolean
        description: 是否为人大代表（是/否）
        required: false
      - name: is_cppcc_member
        type: boolean
        description: 是否为政协委员（是/否）
        required: false
  - name: supplementary_reason
    type: string
    description: 退回补充侦查的核心理由，必须为对定案有决定性影响的重大问题（如犯罪事实不清、关键证据不足、遗漏重要罪行/同案犯等），需具体明确，禁止笼统含糊
    required: true
  - name: supplementary_items
    type: array
    description: 补充侦查的具体事项清单，需逐条明确侦查方向
    items:
      type: string
    required: true
  - name: issue_date
    type: string
    description: 文书制作签发日期（格式：YYYY年MM月DD日）
    required: true
returns:
  type: object
  description: 生成完整的补充侦查决定书，包含存根联与正本文本
  properties:
    - stub_version: string
      description: 补充侦查决定书（存根）文本
    - official_version: string
      description: 补充侦查决定书（正本）文本
---

## Skill Implementation

### 1. 存根联生成逻辑
基于输入参数填充以下固定格式模板：
```
××××人民检察院
补充侦查决定书
（存 根）
[文书编号]

案 由：[案由]
犯罪嫌疑人基本情况（姓名、性别、出生日期、工作单位、住址、公民身份号码、是否人大代表、政协委员）：
[犯罪嫌疑人基本信息拼接文本]
送达机关：[退回补充侦查的机关名称]
补充侦查的理由：
[补充侦查理由]
补充侦查的事项：
1. [事项1]
2. [事项2]
……
备 注：[可选备注内容，无则填“无”]
填发人：[填发人姓名]
填发日期：[文书签发日期]
```

### 2. 正本文本生成逻辑
#### 首部模块
```
[人民检察院名称]
补充侦查决定书

[文书编号]
```

#### 案件来源模块
```
你局[移送日期][移送机关文书编号]移送起诉的被告人[犯罪嫌疑人姓名]案卷材料收悉。经本院审查认为：
```

#### 主文模块（核心理由）
```
[补充侦查理由，需满足两项约束：
① 仅针对对定案有决定性影响的重大问题（如主要犯罪事实不清、关键证据缺失、遗漏重要罪行/同案犯），一般轻微问题或可由检察院自行侦查的问题不得作为理由；
② 内容必须具体明确，避免“事实不清、证据不足”等笼统表述，需指向具体待查事项]

为查明案件事实，准确惩治犯罪，依照《中华人民共和国刑事诉讼法》相关规定，现将本案退回你局补充侦查。请你局在收到本决定书后一个月内补充侦查完毕，并将补充侦查结果移送本院审查。
```

#### 尾部模块
```
此致
[退回补充侦查的机关名称]

[人民检察院名称]（院印）
[文书签发日期]
```

#### 附项模块
```
附：补充侦查的事项：
1. [事项1]
2. [事项2]
……
```

### 3. 强制约束规则
1. **理由合法性约束**：补充侦查理由必须属于《刑事诉讼法》规定的法定情形，仅当存在以下情况时方可退回：
   - 主要犯罪事实情节不清
   - 重要证据不足或存在矛盾无法排除
   - 遗漏了重要罪行或应当追究刑事责任的同案犯
   一般、较小或可由人民检察院自行侦查解决的问题，不得作为退回补充侦查的理由。
2. **事项明确性约束**：补充侦查事项必须逐条具体化，禁止使用“进一步查明案件事实”等模糊表述，需让公安机关可直接开展针对性侦查。
3. **格式规范性约束**：
   - 文书编号必须严格遵循 `××检××补侦〔××〕×号` 格式
   - 所有日期必须使用 `YYYY年MM月DD日` 格式
   - 尾部必须加盖人民检察院院章（文本中以「（院印）」标识）
4. **期限约束**：正文中必须明确要求公安机关在**一个月内**补充侦查完毕，不得变更期限。
```

---

### 示例输出（Demo）
#### 存根联示例
```
北京市朝阳区人民检察院
补充侦查决定书
（存 根）
京朝检公诉补侦〔2020〕12号

案 由：赵××涉嫌诈骗罪
犯罪嫌疑人基本情况（姓名、性别、出生日期、工作单位、住址、公民身份号码、是否人大代表、政协委员）：
赵××，男，1985年03月12日，无业，住北京市朝阳区××路××号，公民身份号码11010519850312××××，非人大代表、非政协委员
送达机关：北京市公安局朝阳分局
补充侦查的理由：
本案中，赵××诈骗所得款项流向未查清，关键转账记录缺失，且同案犯李××未到案，导致主要犯罪事实无法认定，影响定罪量刑。
补充侦查的事项：
1. 调取赵××名下银行账户2020年1月-5月交易流水，查明50万元诈骗款项的具体流向
2. 抓捕同案犯李××，核实其参与诈骗的具体行为及分工
备 注：无
填发人：张××
填发日期：2020年09月30日
```

#### 正本文本示例
```
北京市朝阳区人民检察院
补充侦查决定书

京朝检公诉补侦〔2020〕12号

你局2020年08月15日京公朝诉字〔2020〕45号移送起诉的被告人赵××案卷材料收悉。经本院审查认为：
本案中，赵××诈骗所得款项流向未查清，关键转账记录缺失，且同案犯李××未到案，导致主要犯罪事实无法认定，影响定罪量刑。为查明案件事实，准确惩治犯罪，依照《中华人民共和国刑事诉讼法》相关规定，现将本案退回你局补充侦查。请你局在收到本决定书后一个月内补充侦查完毕，并将补充侦查结果移送本院审查。

此致
北京市公安局朝阳分局

北京市朝阳区人民检察院（院印）
2020年09月30日

附：补充侦查的事项：
1. 调取赵××名下银行账户2020年1月-5月交易流水，查明50万元诈骗款项的具体流向
2. 抓捕同案犯李××，核实其参与诈骗的具体行为及分工
```
```

