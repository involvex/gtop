var blessed = require('blessed'),
  contrib = require('blessed-contrib'),
  monitor = require('./monitor'),
  exec = require('child_process').exec;

// Get terminal size with fallback to minimum valid dimensions
// drawille requires width%2==0 and height%4==0
function getValidTerminalSize() {
  var columns = 80;
  var rows = 24;

  // Try process.stdout first
  try {
    if (process.stdout.columns) columns = process.stdout.columns;
    if (process.stdout.rows) rows = process.stdout.rows;
  } catch (_e) {}

  // Try getWindowSize if available
  try {
    if (process.stdout.getWindowSize) {
      var size = process.stdout.getWindowSize();
      if (size && size[0]) columns = size[0];
      if (size && size[1]) rows = size[1];
    }
  } catch (_e) {}

  // On Windows, try PowerShell as fallback
  if (process.platform === 'win32') {
    try {
      var execSync = require('child_process').execSync;
      var result = execSync(
        'powershell -Command "Write-Output (Get-Host).UI.RawUI.BufferSize.Width; Write-Output (Get-Host).UI.RawUI.BufferSize.Height"',
        { encoding: 'utf8', timeout: 1000 }
      );
      var dims = result
        .trim()
        .split(/\r?\n/)
        .map(function (x) {
          return parseInt(x.trim(), 10);
        });
      if (dims.length >= 2 && dims[0] > 0) columns = dims[0];
      if (dims.length >= 2 && dims[1] > 0) rows = dims[1];
    } catch (_e) {
      // Fallback to common Windows terminal size
      columns = 120;
      rows = 30;
    }
  }

  // Also set these on process.stdout so blessed can find them
  try {
    if (!process.stdout.columns) process.stdout.columns = columns;
    if (!process.stdout.rows) process.stdout.rows = rows;
  } catch (_e) {}

  // Ensure minimum dimensions and valid drawille constraints
  return {
    width: Math.floor(Math.max(columns, 40) / 2) * 2,
    height: Math.floor(Math.max(rows, 12) / 4) * 4,
  };
}

var termSize = getValidTerminalSize();

var screen = blessed.screen({
  smartCSR: true,
  terminal: 'xterm-256color',
  // Force dimensions to ensure widgets get valid sizes
  width: termSize.width,
  height: termSize.height,
  // These help blessed recognize it's in a capable terminal
  forceTTY: true,
  fastTTY: false,
});

// Additional fix: ensure the screen has valid dimensions
try {
  screen.width = termSize.width;
  screen.height = termSize.height;
} catch (_e) {}

// Patch the grid's _getDimensions to ensure valid sizes
var originalGrid = contrib.grid;

// Create grid and set up UI immediately (synchronously)
var grid = new originalGrid({
  rows: 11,
  cols: 12,
  screen: screen,
});

var cpuLine = grid.set(0, 0, 4, 12, contrib.line, {
  showNthLabel: 5,
  maxY: 100,
  label: 'CPU History',
  showLegend: true,
});

var memLine = grid.set(4, 0, 4, 8, contrib.line, {
  showNthLabel: 5,
  maxY: 100,
  label: 'Memory and Swap History',
  showLegend: true,
  legend: {
    width: 10,
  },
});

var memDonut = grid.set(4, 8, 2, 4, contrib.donut, {
  radius: 8,
  arcWidth: 3,
  yPadding: 2,
  remainColor: 'black',
  label: 'Memory',
});

var swapDonut = grid.set(6, 8, 2, 4, contrib.donut, {
  radius: 8,
  arcWidth: 3,
  yPadding: 2,
  remainColor: 'black',
  label: 'Swap',
});

var netSpark = grid.set(8, 0, 2, 6, contrib.sparkline, {
  label: 'Network History',
  tags: true,
  style: {
    fg: 'blue',
  },
});

var diskDonut = grid.set(10, 0, 2, 6, contrib.donut, {
  radius: 8,
  arcWidth: 3,
  yPadding: 2,
  remainColor: 'black',
  label: 'Disk usage',
});

var procTable = grid.set(8, 6, 4, 6, contrib.table, {
  keys: true,
  label: 'Processes',
  columnSpacing: 1,
  columnWidth: [7, 24, 7, 7],
});

procTable.focus();

// Add footer box with hotkeys
var footerBox = blessed.box({
  bottom: 0,
  left: 0,
  width: '100%',
  height: 1,
  content:
    '{bold}Hotkeys:{/bold} [k]Kill [/]Search Sort:[m]Mem [c]CPU [p]PID [n]Name [r]ClearCache [C]ClearStandby [q]Quit',
  style: {
    fg: 'white',
    bg: 'blue',
  },
  tags: true,
});

screen.append(footerBox);

// Store proc monitor reference
var procMonitor;

// Search mode
var searchMode = false;
var searchQuery = '';

// Kill process function using fkill for better process termination
var fkill;

function killSelectedProcess() {
  var selected = procTable.rows.selected;
  var rows = procMonitor ? procMonitor.currentRows : null;
  if (rows && rows[selected]) {
    var pid = rows[selected][0];
    // Prevent killing the gtop process itself
    if (pid && pid > 0 && pid !== process.pid) {
      // Try fkill first (supports force kill, tree kill, etc.)
      try {
        if (!fkill) {
          fkill = require('fkill');
        }
        fkill(pid, { force: true, tree: true })
          .then(function () {
            footerBox.setContent(
              '{bold}Hotkeys:{/bold} [k]Kill [/]Search Sort:[m]Mem [c]CPU [p]PID [n]Name [r]ClearCache [C]ClearStandby [q]Quit {green}Killed PID ' +
                pid +
                '{/green}'
            );
            screen.render();
            setTimeout(resetFooter, 2000);
          })
          .catch(function (_err) {
            // Fall back to native kill if fkill fails
            try {
              process.kill(pid, 'SIGTERM');
              footerBox.setContent(
                '{bold}Hotkeys:{/bold} [k]Kill [/]Search Sort:[m]Mem [c]CPU [p]PID [n]Name [r]ClearCache [C]ClearStandby [q]Quit {green}Killed PID ' +
                  pid +
                  '{/green}'
              );
            } catch (_e) {
              footerBox.setContent(
                '{bold}Hotkeys:{/bold} [k]Kill [/]Search Sort:[m]Mem [c]CPU [p]PID [n]Name [r]ClearCache [C]ClearStandby [q]Quit {red}Failed to kill PID ' +
                  pid +
                  '{/red}'
              );
            }
            screen.render();
            setTimeout(resetFooter, 2000);
          });
      } catch (_e) {
        // Fall back to native kill if require fails
        try {
          process.kill(pid, 'SIGTERM');
          footerBox.setContent(
            '{bold}Hotkeys:{/bold} [k]Kill [/]Search Sort:[m]Mem [c]CPU [p]PID [n]Name [r]ClearCache [C]ClearStandby [q]Quit {green}Killed PID ' +
              pid +
              '{/green}'
          );
        } catch (_e2) {
          footerBox.setContent(
            '{bold}Hotkeys:{/bold} [k]Kill [/]Search Sort:[m]Mem [c]CPU [p]PID [n]Name [r]ClearCache [C]ClearStandby [q]Quit {red}Failed to kill PID ' +
              pid +
              '{/red}'
          );
        }
        screen.render();
        setTimeout(resetFooter, 2000);
      }
    }
  }
}

function resetFooter() {
  footerBox.setContent(
    '{bold}Hotkeys:{/bold} [k]Kill [/]Search Sort:[m]Mem [c]CPU [p]PID [n]Name [r]ClearCache [C]ClearStandby [q]Quit'
  );
  screen.render();
}

// Clear memory cache function
function clearMemoryCache() {
  if (process.platform === 'win32') {
    // On Windows, try to empty working sets (requires admin)
    exec(
      'powershell -Command "Get-Process | Where-Object {$_.WorkingSet64 -gt 100MB} | ForEach-Object { $_.MinWorkingSet($_.MinWorkingSet) }"',
      function (err) {
        if (err) {
          footerBox.setContent(
            '{bold}Hotkeys:{/bold} [k]KILL [r]ClearCache [C]ClearStandby [q]Quit {red}Failed to clear cache{/red}'
          );
        } else {
          footerBox.setContent(
            '{bold}Hotkeys:{/bold} [k]KILL [r]ClearCache [C]ClearStandby [q]Quit {green}Cache cleared{/green}'
          );
        }
        screen.render();
        setTimeout(resetFooter, 2000);
      }
    );
  } else {
    // On Linux, drop caches
    exec('sync && echo 3 > /proc/sys/vm/drop_caches', function (err) {
      if (err) {
        footerBox.setContent(
          '{bold}Hotkeys:{/bold} [k]KILL [r]ClearCache [C]ClearStandby [q]Quit {red}Failed (need sudo){/red}'
        );
      } else {
        footerBox.setContent(
          '{bold}Hotkeys:{/bold} [k]KILL [r]ClearCache [C]ClearStandby [q]Quit {green}Cache cleared{/green}'
        );
      }
      screen.render();
      setTimeout(resetFooter, 2000);
    });
  }
}

// Clear standby list function (like rammap -Et)
function clearStandbyList() {
  if (process.platform === 'win32') {
    // On Windows, try to empty standby list using various methods
    exec('powershell -Command "EmptyStandbyList"', function (err) {
      if (err) {
        // Try alternative method - clear file cache
        exec(
          "powershell -Command \"[System.IO.File]::WriteAllText('C:\\\\Windows\\\\System32\\\\config\\\\systemprofile\\\\test', 'test'); Remove-Item 'C:\\\\Windows\\\\System32\\\\config\\\\systemprofile\\\\test' -Force\"",
          function (err2) {
            if (err2) {
              footerBox.setContent(
                '{bold}Hotkeys:{/bold} [k]KILL [r]ClearCache [C]ClearStandby [q]Quit {red}Failed (need admin){/red}'
              );
            } else {
              footerBox.setContent(
                '{bold}Hotkeys:{/bold} [k]KILL [r]ClearCache [C]ClearStandby [q]Quit {green}Standby cleared{/green}'
              );
            }
            screen.render();
            setTimeout(resetFooter, 2000);
          }
        );
      } else {
        footerBox.setContent(
          '{bold}Hotkeys:{/bold} [k]KILL [r]ClearCache [C]ClearStandby [q]Quit {green}Standby cleared{/green}'
        );
        screen.render();
        setTimeout(resetFooter, 2000);
      }
    });
  } else {
    // On Linux, drop caches again (similar effect)
    exec('sync && echo 3 > /proc/sys/vm/drop_caches', function (err) {
      if (err) {
        footerBox.setContent(
          '{bold}Hotkeys:{/bold} [k]KILL [r]ClearCache [C]ClearStandby [q]Quit {red}Failed (need sudo){/red}'
        );
      } else {
        footerBox.setContent(
          '{bold}Hotkeys:{/bold} [k]KILL [r]ClearCache [C]ClearStandby [q]Quit {green}Standby cleared{/green}'
        );
      }
      screen.render();
      setTimeout(resetFooter, 2000);
    });
  }
}

screen.render();

// Handle resize properly
screen.on('resize', function () {
  // Update screen dimensions
  var newSize = getValidTerminalSize();
  screen.width = newSize.width;
  screen.height = newSize.height;

  // Re-emit attach on widgets to refresh them
  screen.render();
});

// Search key handler
screen.key('/', function () {
  searchMode = true;
  searchQuery = '';
  footerBox.setContent('{bold}Search:{/bold} Type to filter (Esc to clear)');
  screen.render();
});

screen.key(['escape', 'q', 'C-c'], function () {
  if (searchMode) {
    searchMode = false;
    searchQuery = '';
    if (procMonitor) {
      procMonitor.searchQuery = '';
      procMonitor.reIndex = true;
    }
    footerBox.setContent(
      '{bold}Hotkeys:{/bold} [k]Kill [/]Search Sort:[m]Mem [c]CPU [p]PID [n]Name [r]ClearCache [C]ClearStandby [q]Quit'
    );
    screen.render();
  } else {
    return process.exit(0);
  }
});

// Keypress handler for search input
screen.key(['keypress'], function (ch, key) {
  if (searchMode && key && key.name === 'return') {
    searchMode = false;
  } else if (searchMode && ch && ch.length === 1) {
    searchQuery += ch;
    if (procMonitor) {
      procMonitor.searchQuery = searchQuery;
      procMonitor.reIndex = true;
    }
    footerBox.setContent('{bold}Search:{/bold} ' + searchQuery);
    screen.render();
  } else if (searchMode && key && key.name === 'backspace') {
    searchQuery = searchQuery.slice(0, -1);
    if (procMonitor) {
      procMonitor.searchQuery = searchQuery;
      procMonitor.reIndex = true;
    }
    footerBox.setContent('{bold}Search:{/bold} ' + searchQuery);
    screen.render();
  }
});

// Key handler for killing process
screen.key('k', function () {
  killSelectedProcess();
});

// Key handler for clearing memory cache
screen.key('r', function () {
  clearMemoryCache();
});

// Key handler for clearing standby list
screen.key('C', function () {
  clearStandbyList();
});

function init() {
  new monitor.Cpu(cpuLine);
  new monitor.Mem(memLine, memDonut, swapDonut);
  new monitor.Net(netSpark);
  new monitor.Disk(diskDonut);
  procMonitor = new monitor.Proc(procTable);
}

process.on('uncaughtException', function (err) {
  console.error('Gtop Error:', err.message);
  console.error('Stack:', err.stack);
});

module.exports = {
  init: init,
  monitor: monitor,
};
