# 北大法宝（pkulaw）MCP 数据源接入

法宝 MCP 提供权威法律法规/司法案例数据与法条引用校验，作为本地法条库的在线增强。
配置后，agent 会自动获得法宝的检索、识别、核验类工具（`pkulaw_*` 前缀）。

## 1. 获取 Token

在 [mcp.pkulaw.com](https://mcp.pkulaw.com) 的「获取 Token」页生成 Access Token。

**不要把 Token 写进任何文件。** fama 配置支持 `{env:VAR}` 插值——把 Token 放进环境变量即可。

## 2. 配置

在全局配置 `~/.config/fama/fama.json`（或项目 `.fama/fama.jsonc`）的 `mcp.servers` 下加入以下条目。

先在 shell 配置（`~/.zshrc`）中导出 Token：

```bash
export PKULAW_MCP_TOKEN="你的真实Token"
```

然后把下述 9 个服务加入 `mcp.servers`（注意：URL 末尾**不加** `/mcp` 后缀）：

```jsonc
{
  "mcp": {
    "servers": {
      "pkulaw-law-search": {
        "type": "remote",
        "url": "https://apim-gateway.pkulaw.com/mcp-law-search-service",
        "headers": { "Authorization": "Bearer {env:PKULAW_MCP_TOKEN}" }
      },
      "pkulaw-law-keyword": {
        "type": "remote",
        "url": "https://apim-gateway.pkulaw.com/mcp-law",
        "headers": { "Authorization": "Bearer {env:PKULAW_MCP_TOKEN}" }
      },
      "pkulaw-case-semantic-search": {
        "type": "remote",
        "url": "https://apim-gateway.pkulaw.com/mcp-case-search-service",
        "headers": { "Authorization": "Bearer {env:PKULAW_MCP_TOKEN}" }
      },
      "pkulaw-case-keyword": {
        "type": "remote",
        "url": "https://apim-gateway.pkulaw.com/mcp-case",
        "headers": { "Authorization": "Bearer {env:PKULAW_MCP_TOKEN}" }
      },
      "pkulaw-law-item-keyword": {
        "type": "remote",
        "url": "https://apim-gateway.pkulaw.com/mcp-fatiao",
        "headers": { "Authorization": "Bearer {env:PKULAW_MCP_TOKEN}" }
      },
      "pkulaw-law-recognition": {
        "type": "remote",
        "url": "https://apim-gateway.pkulaw.com/law_recognition",
        "headers": { "Authorization": "Bearer {env:PKULAW_MCP_TOKEN}" }
      },
      "pkulaw-case-number-recognition": {
        "type": "remote",
        "url": "https://apim-gateway.pkulaw.com/case_number_recognition",
        "headers": { "Authorization": "Bearer {env:PKULAW_MCP_TOKEN}" }
      },
      "pkulaw-citation-validator": {
        "type": "remote",
        "url": "https://apim-gateway.pkulaw.com/pku_citation_validator",
        "headers": { "Authorization": "Bearer {env:PKULAW_MCP_TOKEN}" }
      },
      "pkulaw-doc-link": {
        "type": "remote",
        "url": "https://apim-gateway.pkulaw.com/add-doc-link",
        "headers": { "Authorization": "Bearer {env:PKULAW_MCP_TOKEN}" }
      }
    }
  }
}
```

> 不同客户端对 `type` 的拼写可能是 `streamableHttp` / `streamablehttp` / `http`；
> fama 使用 `remote`（底层为 Streamable HTTP 传输）。

## 3. 验证

配置后重启 fama，在对话中依次验证：

1. **法律数据**：「数据出境相关的部门规章有哪些？」→ 法规检索工具运行并返回效力标注
2. **司法案例**：「检索与『竞业限制违约』相关的典型司法案例」→ 返回案例标题、案号等结构化信息
3. **法条解析**：「识别这段文字里的法条引用并给出标准出处：《民法典》第577条」→ 返回标准法条条目

## 4. 与本地法条库的关系

| 场景 | 首选 |
| --- | --- |
| 快速调条文全文（离线/保密） | `law_get` / `law_search`（本地索引） |
| 法规时效性、修订沿革核验 | 法宝 MCP（权威在线数据） |
| 司法案例检索 | 法宝 MCP（本地库不含案例全文） |
| 文书定稿前的引用核验 | `citation_check`（本地初筛）→ 法宝 `pkulaw-citation-validator`（权威复核） |

本地法条库是静态快照；法宝是在线权威数据。二者互补，不互斥。
