<p align="center">
  <a href="https://fama.stdlaw.cn">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="Fama logo">
    </picture>
  </a>
</p>
<p align="center">The open-source AI legal assistant.</p>
<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">简体中文</a>
</p>

---

Fama (法码) is a legal-scenario AI agent built on the OpenCode engine: legal document
drafting (53 built-in Chinese legal document skills), statute retrieval, contract
analysis, and a full coding-agent core underneath — for lawyers, in-house counsel,
and legal professionals.

### Installation

```bash
# Install script
curl -fsSL https://fama.stdlaw.cn/install | bash

# npm
npm i -g fama@latest        # or bun/pnpm/yarn

# Desktop app: download from GitHub Releases
```

#### Installation Directory

The install script respects the following priority order for the installation path:

1. `$FAMA_INSTALL_DIR` - Custom installation directory
2. `$XDG_BIN_DIR` - XDG Base Directory Specification compliant path
3. `$HOME/bin` - Standard user binary directory (if it exists or can be created)
4. `$HOME/.fama/bin` - Default fallback

### Legal Agents

Fama ships role-based legal agents, each with its own system prompt, guardrails,
and citation discipline:

- **lawyer** - Attorney work: litigation documents, contracts, legal research
- **judge** - Court document drafting assistance (assistive only; never replaces judicial authority)
- **prosecutor** - Prosecution documents under the objectivity duty
- **counsel** - In-house counsel and compliance work

Developer-facing agents from the underlying engine (**build**, **plan**, **general**)
remain fully available — Fama keeps the complete coding-agent capability set.

### Built-in Legal Skills

53 document skills are bundled out of the box: civil/criminal/administrative
pleadings, judgments, prosecution documents, police investigation records,
arbitration and notarization documents, and contract drafting/review.

### Documentation

Configuration and extension docs live in [CONTEXT.md](./CONTEXT.md) and
[AGENTS.md](./AGENTS.md).

### Contributing

Please read [CONTRIBUTING.md](./CONTRIBUTING.md) before submitting a pull request.

### License & Provenance

Fama is MIT-licensed, forked from [OpenCode](https://github.com/anomalyco/opencode).
The fork provenance is intentionally transparent — the engine's service
integrations (provider gateway, account console) remain compatible upstream.

---

**标准法律 (stdlaw.cn)** · [fama.stdlaw.cn](https://fama.stdlaw.cn) · [calculator.stdlaw.cn](https://calculator.stdlaw.cn)
