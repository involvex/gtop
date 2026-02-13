var si = require('systeminformation');

var pars = {
  p: 'pid',
  c: 'cpu',
  m: 'mem',
  n: 'command',
};

function Proc(table) {
  this.table = table;

  this.pSort = pars.c;
  this.reIndex = false;
  this.reverse = false;

  // Store selected PID to maintain selection during refresh
  this.selectedPid = null;

  var that = this;

  var updater = function () {
    si.processes(function (data) {
      that.updateData(data);
    });
  };
  updater();
  this.interval = setInterval(updater, 3000);

  // Sorting keys - handled directly on table
  this.table.key(['m', 'c', 'p', 'n'], function (ch) {
    if (pars[ch] == that.pSort) {
      that.reverse = !that.reverse;
    } else {
      that.pSort = pars[ch] || that.pSort;
    }

    that.reIndex = true;
    updater();
  });
}

Proc.prototype.updateData = function (data) {
  var that = this;
  var par = this.pSort;

  // For name sorting, we need string comparison
  var isNameSort = par === 'command';

  var sortedData = data.list.slice().sort(function (a, b) {
    if (isNameSort) {
      // String comparison for name sorting
      var nameA = (a.command || '').toLowerCase();
      var nameB = (b.command || '').toLowerCase();
      if (that.reverse) {
        return nameB.localeCompare(nameA);
      }
      return nameA.localeCompare(nameB);
    } else {
      // Numeric comparison for other fields
      return b[par] - a[par];
    }
  });

  var rows = sortedData.map(function (p) {
    return [p.pid, p.command, ' ' + p.cpu.toFixed(1), p.mem.toFixed(1)];
  });

  var headers = ['PID', 'Command', '%CPU', '%MEM'];

  headers[
    {
      pid: 0,
      cpu: 2,
      mem: 3,
      command: 1,
    }[this.pSort]
  ] += this.reverse ? '▲' : '▼';

  this.table.setData({
    headers: headers,
    data: this.reverse ? rows.reverse() : rows,
  });

  this.table.screen.render();
};

module.exports = Proc;
