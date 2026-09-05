<p align="center">
  <a href="https://fama.stdlaw.cn">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="法码 logo">
    </picture>
  </a>
</p>
<p align="center">开源的中文法律 AI 助手。</p>
<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">简体中文</a>
</p>

---

法码（Fama）是基于 OpenCode 引擎打造的法律场景 AI 智能体：内置 53 个中国法律文书技能、
法条检索、合同分析等法律工程能力，同时完整保留底层引擎的通用 agent 能力。
面向律师、企业法务、公检法工作人员与法学教研。

### 安装

```bash
# 安装脚本
curl -fsSL https://fama.stdlaw.cn/install | bash

# npm
npm i -g fama@latest        # 也可使用 bun/pnpm/yarn

# 桌面应用：从 GitHub Releases 下载
```

#### 安装目录

安装脚本按以下优先级决定安装路径：

1. `$FAMA_INSTALL_DIR` - 自定义安装目录
2. `$XDG_BIN_DIR` - 符合 XDG 基础目录规范的路径
3. `$HOME/bin` - 标准用户二进制目录（如存在或可创建）
4. `$HOME/.fama/bin` - 默认备用路径

### 法律角色 Agent

法码内置按法律角色划分的智能体，各自配备独立的系统提示词、安全护栏与引用规范：

- **lawyer（律师）** - 诉讼文书、合同起草、法律检索
- **judge（法官）** - 裁判文书辅助草拟（仅辅助，不替代审判权）
- **prosecutor（检察官）** - 检察文书，遵循客观义务
- **counsel（法务）** - 企业法务与合规工作

底层引擎面向开发者的 **build**、**plan**、**general** 等 agent 全部保留——
法码不削减任何工程能力。

### 内置法律技能

开箱即用 53 个文书技能：民事/刑事/行政各类诉状与裁判文书、检察文书、
公安侦查文书、仲裁与公证文书、合同起草与审查等。

### 文档

配置与扩展说明见 [CONTEXT.md](./CONTEXT.md) 与 [AGENTS.md](./AGENTS.md)。

### 参与贡献

如有兴趣贡献代码，请在提交 PR 前阅读 [贡献指南](./CONTRIBUTING.md)。

### 许可与来源

法码基于 MIT 协议开源，fork 自 [OpenCode](https://github.com/anomalyco/opencode)。
fork 来源保持透明——引擎的服务集成（模型网关、账号控制台）与上游保持兼容。

---

**标准法律（stdlaw.cn）** · [fama.stdlaw.cn](https://fama.stdlaw.cn) · [calculator.stdlaw.cn](https://calculator.stdlaw.cn)
