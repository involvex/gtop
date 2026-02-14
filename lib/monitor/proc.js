var si = require("systeminformation");

var pars = {
  p: "pid",
  c: "cpu",
  m: "mem",
  n: "command",
};

function Proc(table) {
  this.table = table;

  this.pSort = pars.c;
  this.reIndex = false;
  this.reverse = false;

  // Store selected PID to maintain selection during refresh
  this.selectedPid = null;

  // Store current data for kill function access
  this.currentData = null;
  this.currentRows = null;

  // Search functionality
  this.searchQuery = "";
  this.filteredData = null;

  var that = this;

  var updater = function () {
    si.processes(function (data) {
      that.updateData(data);
    });
  };
  updater();
  this.interval = setInterval(updater, 3000);
}

Proc.prototype.updateData = function (data) {
  var that = this;
  var par = this.pSort;

  // Save selection before update
  var savedPid = this.selectedPid;

  // Validate data exists and has list
  if (!data || !data.list || !Array.isArray(data.list)) {
    return;
  }

  try {
    // Apply search filter if active
    var dataToProcess = data.list;
    if (this.searchQuery) {
      var query = this.searchQuery.toLowerCase();
      dataToProcess = data.list.filter(function (p) {
        // Safe property access - handle null/undefined
        var cmd = p && p.command ? p.command.toLowerCase() : "";
        var pid = p && p.pid ? p.pid.toString() : "";
        return cmd.indexOf(query) !== -1 || pid.indexOf(query) !== -1;
      });
    }

    // For name sorting, we need string comparison
    var isNameSort = par === "command";

    var sortedData = dataToProcess.slice().sort(function (a, b) {
      if (isNameSort) {
        // String comparison for name sorting
        var nameA = ((a && a.command) || "").toLowerCase();
        var nameB = ((b && b.command) || "").toLowerCase();
        if (that.reverse) {
          return nameB.localeCompare(nameA);
        }
        return nameA.localeCompare(nameB);
      } else {
        // Numeric comparison for other fields - use safe defaults
        var valA = (a && a[par]) || 0;
        var valB = (b && b[par]) || 0;
        return valB - valA;
      }
    });

    var rows = sortedData.map(function (p) {
      // Safe access to process properties
      var pid = p && p.pid ? p.pid : 0;
      var cmd = p && p.command ? p.command : "";
      var cpu = p && p.cpu ? p.cpu.toFixed(1) : "0.0";
      var mem = p && p.mem ? p.mem.toFixed(1) : "0.0";
      return [pid, cmd, " " + cpu, mem];
    });

    // Store current data and rows for kill function access
    this.currentData = sortedData;
    this.currentRows = rows;

    var headers = ["PID", "Command", "%CPU", "%MEM"];

    headers[
      {
        pid: 0,
        cpu: 2,
        mem: 3,
        command: 1,
      }[this.pSort]
    ] += this.reverse ? "▲" : "▼";

    this.table.setData({
      headers: headers,
      data: this.reverse ? rows.reverse() : rows,
    });

    // Restore selection after sorting
    var newSelectedIndex = 0;
    if (savedPid) {
      var idx = rows.findIndex(function (r) {
        return r[0] === savedPid;
      });
      if (idx !== -1) {
        newSelectedIndex = idx;
      }
    }
    // Only set selection if we have rows
    if (rows.length > 0) {
      this.table.rows.selected = newSelectedIndex;
      this.selectedPid = rows[newSelectedIndex][0];
    } else {
      this.table.rows.selected = 0;
      this.selectedPid = null;
    }

    this.table.screen.render();
  } catch (e) {
    console.error("Error updating process table:", e.message);
    console.error(e.stack);
  }
};

module.exports = Proc;
