var si = require('systeminformation'),
  utils = require('../utils');

function Net(sparkline) {
  this.sparkline = sparkline;
  this.netData = [Array(61).fill(0), Array(61).fill(0)];

  var that = this;

  si.networkInterfaceDefault(function (iface) {
    var updater = function () {
      si.networkStats(iface, function (data) {
        that.updateData(data[0]);
      });
    };
    updater();
    that.interval = setInterval(updater, 1000);
  });
}

Net.prototype.updateData = function (data) {
  var rx_sec = Math.max(0, data['rx_sec']);
  var tx_sec = Math.max(0, data['tx_sec']);

  this.netData[0].shift();
  this.netData[0].push(rx_sec);

  this.netData[1].shift();
  this.netData[1].push(tx_sec);

  // Download (rx) and Upload (tx) labels
  var rx_label =
    '{bold}Download:{/bold} ' +
    utils.humanFileSize(rx_sec) +
    '/s \nTotal: ' +
    utils.humanFileSize(data['rx_bytes']);

  var tx_label =
    '{bold}Upload:{/bold}   ' +
    utils.humanFileSize(tx_sec) +
    '/s \nTotal: ' +
    utils.humanFileSize(data['tx_bytes']);

  this.sparkline.setData([rx_label, tx_label], this.netData);
  this.sparkline.screen.render();
};

module.exports = Net;
