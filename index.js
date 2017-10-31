'use strict';

const net = require('net');

/**
 * Zabbix sender class
 */
class ZabbixSender {

    /**
     *
     * @param options
     * @param options.agentHost
     * @param options.serverHost
     * @param [options.serverPort]
     * @param [options.timeout]
     * @param [options.withTimestamps]
     */
    constructor(options) {

        options = (typeof options !== 'undefined') ? options : {};

        this.serverHost     = options.serverHost || 'localhost';
        this.serverPort     = parseInt(options.serverPort) || 10051;
        this.timeout        = parseInt(options.timeout) || 5000;
        this.withTimestamps = options.withTimestamps || false;
        this.agentHost      = options.agentHost;

        // prepare items array
        this.clearItems();
    }

    addItem(host, key, value) {

        if (arguments.length < 3) {
            if (arguments.length < 2) {
                throw new Error('addItem requires 2 or 3 arguments');
            }

            // if just 2 args provided
            value = key;
            key   = host;
            host  = this.agentHost;
        }

        const length = this.items.push({
            host: host,
            key: key,
            value: value
        });

        if (this.withTimestamps) {
            this.items[length - 1].clock = Date.now() / 1000 | 0;
        }
    }

    clearItems() {

        this.items = [];
    }

    countItems() {

        return this.items.length;
    }

    prepareData(items, withTimestamps) {

        const data = {
            request: 'sender data',
            data: items
        };

        if (withTimestamps) {
            data.clock = Date.now() / 1000 | 0;
        }

        // console.log(data); // DEBUG

        const payload = new Buffer(JSON.stringify(data), 'utf8');
        const header  = new Buffer(5 + 4); // ZBXD\1 + packed payload.length

        header.write('ZBXD\x01');
        header.writeInt32LE(payload.length, 5);
        return Buffer.concat([header, new Buffer('\x00\x00\x00\x00'), payload]);
    }

    send(callback) {

        callback = (typeof callback === 'function') ? callback : () => {
        };

        let self     = this,
            error    = false,
            items    = this.items,
            data     = this.prepareData(items, this.withTimestamps),
            client   = new net.Socket(),
            response = new Buffer(0);

        // uncoment when debugging
        // console.log(data.slice(13).toString());

        // reset items array
        this.clearItems();

        // set socket timeout
        client.setTimeout(this.timeout);

        client.connect(this.serverPort, this.serverHost, () => {
            client.write(data);
        });

        client.on('data', data => {
            response = Buffer.concat([response, data]);
        });

        client.on('timeout', () => {
            error = new Error("socket timed out after " + self.timeout / 1000 + " seconds");
            client.destroy();
        });

        client.on('error', err => {
            error = err;
        });

        client.on('close', () => {
            // bail out on any error
            if (error) {
                // in case of error, put the items back
                self.items = self.items.concat(items);
                return callback(error, {});
            }

            // bail out if got wrong response
            if (response.slice(0, 5).toString() !== 'ZBXD\x01') {
                // in case of bad response, put the items back
                self.items = self.items.concat(items);
                return callback(new Error("got invalid response from server"), {});
            }

            // all clear, return the result
            callback(null, JSON.parse(response.slice(13)), items);
        });
    }
}

/**
 *
 * @type {ZabbixSender}
 */
module.exports = ZabbixSender;
