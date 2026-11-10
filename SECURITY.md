# Security

DesignStudio runs entirely in your browser. It has no server and no account, and it makes no network calls unless you turn on an online feature: AI providers, GitHub import, the MCP bridge, or a plugin you give network permission.

## Reporting a problem

Please report security problems privately. On this repository, open **Security › Report a vulnerability**. Do not open a public issue for a security problem.

Include the DesignStudio version (File › About), your browser, and the steps to reproduce. You'll get a reply within 7 days.

## Built-in protections

- **Content Security Policy:** a strict policy, with every script allowed by its own hash in the single-file build.
- **Project files:** opened files are checked and cleaned before loading (`js/core/security.js`).
- **Plugins:** each plugin runs in a sandboxed Web Worker, with only the permissions you approve.
- **API keys and tokens:** stored in your browser only and removed from diagnostic logs.
