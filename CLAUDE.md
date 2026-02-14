# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**gtop** is a terminal-based system monitoring dashboard (similar to `top`/`htop`) built with Node.js. It displays real-time CPU, memory, network, disk, and process information in a visual terminal UI.

- **Terminal UI**: Uses `blessed` and `blessed-contrib` for widgets and charts
- **System Metrics**: Uses `systeminformation` library for cross-platform system data
- **Platforms**: Linux, OSX, Windows (partial support)

## Common Commands

```bash
# Format code (ES5, single quotes, trailing commas)
bun run format
bun run format:check

# Linting
bun run lint
bun run lint:fix

# Run the application
bun index.js
# or
npm start

# Tests (placeholder - not implemented)
npm test
```

## Architecture

### Entry Point
- `index.js` → `lib/gtop.js` (main application)

### Monitor Pattern (`lib/monitor/`)

Each system metric has its own module following a consistent pattern:

| Module | Widget Type | Update Interval |
|--------|-------------|----------------|
| `cpu.js` | Line chart | 1 second |
| `mem.js` | Line chart + 2 donuts | 2 seconds |
| `net.js` | Sparkline | 1 second |
| `disk.js` | Donut | 5 seconds |
| `proc.js` | Table | 3 seconds |

**Monitor Constructor Pattern:**
```javascript
function Metric(widget) {
  this.widget = widget;
  // Initial data fetch
  si.someMethod((data) => {
    this.updateData(data);
  });
  // Set up recurring updates
  this.interval = setInterval(() => {
    si.someMethod((data) => {
      this.updateData(data);
    });
  }, intervalMs);
}

Metric.prototype.updateData = function(data) {
  // Process data
  this.widget.setData(processedData);
  this.widget.screen.render();
};
```

### Shared Utilities
- `lib/utils.js` - `humanFileSize()`, `colors` array for charts
- `lib/monitor/index.js` - Exports all monitor constructors

### Widget Grid Layout (`lib/gtop.js`)

The UI uses an 11 rows × 12 cols blessed grid:

| Widget | Position |
|--------|----------|
| CPU History | rows 0-3, cols 0-11 |
| Memory/Swap History | rows 4-7, cols 0-7 |
| Memory donut | rows 4-5, cols 8-11 |
| Swap donut | rows 6-7, cols 8-11 |
| Network sparkline | rows 8-9, cols 0-5 |
| Disk donut | rows 10-11, cols 0-5 |
| Process table | rows 8-11, cols 6-11 |

### Process Table Features
- **Sorting**: `p` (PID), `c` (CPU), `m` (Memory), `n` (Name)
- **Search**: `/` enters search mode, `Esc` exits
- **Kill**: `k` kills selected process (uses `fkill` module)

### Terminal Size Handling
The `getValidTerminalSize()` function in `gtop.js` ensures drawille-compatible dimensions:
- Width must be even (width % 2 == 0)
- Height must be multiple of 4 (height % 4 == 0)
- Windows fallback uses PowerShell to get terminal size

## Code Constraints

- **ES5 syntax only**: `var`, not `const`/`let`
- **Old function syntax**: `function() {}`, not arrows (mostly)
- **Blessed typo**: Package is `blessed` (not `blessed`) due to npm naming
- **Drawille constraints**: Any terminal sizing must ensure width%2==0 and height%4==0

## Key Files

- `index.js` - Entry point
- `lib/gtop.js` - Main application, blessed grid layout, key handlers
- `lib/monitor/` - Individual monitor modules
- `lib/utils.js` - Shared utilities
- `package.json` - Commands and dependencies
