# DesignStudio for AI apps (MCP)

Let Claude Desktop, Claude Code, Cursor, VS Code, Windsurf and other MCP apps work with the DesignStudio file that's open in your browser. They can read it, see screenshots, write code from it, and make changes you can undo.

## Set up once
You need **Node.js 18 or newer** ([nodejs.org](https://nodejs.org), LTS).

| App | What to do |
|---|---|
| **Claude Desktop** | Double-click **`Connect-Claude-Desktop.cmd`**, then quit and reopen Claude Desktop. |
| **Cursor** | Double-click **`Connect-Cursor.cmd`**, then restart Cursor and enable *designstudio* in Settings › MCP. |
| **Claude Code** | `claude mcp add designstudio --scope user -- node "<this folder>\designstudio-mcp.mjs"` |
| **VS Code / other** | Add a stdio server: command `node`, args `["<this folder>\designstudio-mcp.mjs"]`. Apps that take a URL: run `node designstudio-mcp.mjs --http` and use `http://127.0.0.1:3845/mcp`. |

DesignStudio shows these snippets with your real folder path in **✦ AI › AI apps**.

## Use it
1. In DesignStudio, open **✦ AI › AI apps** (Ctrl+Alt+M) and turn on **Let AI apps use this file**.
2. Choose **Read only** or **Read & edit**. Tick **Ask me before each change** if you want to approve every edit.
3. Ask your AI app, for example: *"Using my variables and components, add a pricing section to this DesignStudio file."*

The status bar shows **● AI apps** when an app is connected. Every change is one undoable step (Ctrl+Z) and is listed under *Recent requests*. `Check-Connection.cmd` tells you whether the bridge sees DesignStudio.

## Tools the AI app gets
| Tool | What it does |
|---|---|
| `get_document` | Pages, frames, selection, components, variables, text styles, prototype, 3D summary |
| `get_selection` / `get_node` / `find_nodes` | Layers with properties and children |
| `get_screenshot` | PNG of a frame or layer, so the AI can see the design |
| `get_code` | HTML+CSS, React, Vue, Svelte (CSS or Tailwind), or SVG |
| `get_design_system` | Variables and modes, styles, components, W3C tokens |
| `apply_operations` | Create, edit or delete layers, variables, text styles, components and prototype links (validated first, one undo step) |
| `select_nodes` | Select and zoom to layers |
| `get_scene3d` | Objects, settings and triggers of the 3D section |

## Privacy and safety
- The bridge listens on **127.0.0.1** only, so nothing is reachable from your network.
- Websites can't use it. It only accepts the DesignStudio tab opened from your computer and local AI apps; any other web page is refused.
- It's off until you turn it on in DesignStudio, and it stops when you turn it off or close the tab.
- No accounts, no keys, no telemetry. The bridge is one readable file with no dependencies.

## Troubleshooting
- **"DesignStudio is not connected"**: open DesignStudio from `index.html` on your computer and turn on AI apps. The hosted web copy can't reach the bridge.
- **Status stays "Waiting"**: open your AI app (it starts the bridge), or run `node designstudio-mcp.mjs --http`.
- **Port 3845 is busy**: set `DESIGNSTUDIO_MCP_PORT` to another port for the bridge, and set the same port under AI apps › Advanced.
