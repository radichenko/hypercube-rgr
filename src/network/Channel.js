'use strict';

const { PacketUtils } = require('../core/Packet');
const { logger } = require('../simulation/logger');

class ChannelError extends Error {
    constructor(msg) { super(msg); this.name = 'ChannelError'; }
}

class Channel {
    constructor(nodeA, nodeB, options = {}) {
        this.nodeA = nodeA;
        this.nodeB = nodeB;
        this.maxPacketSize = options.maxPacketSize !== undefined ? options.maxPacketSize : 256;
        this.delayMs = options.delayMs !== undefined ? options.delayMs : 50;
        this.lossRate = options.lossRate !== undefined ? options.lossRate : 0;
        this.verbose = options.verbose !== undefined ? options.verbose : false;
        this._stats = {
            sent: 0,
            dropped: 0,
            totalBytes: 0,
            totalDelayMs: 0,
        };
    }

    get id() {
        return `ch${Math.min(this.nodeA, this.nodeB)}-${Math.max(this.nodeA, this.nodeB)}`;
    }

    async transmit(packet, onDeliver) {
        if (PacketUtils.exceedsLimit(packet, this.maxPacketSize)) {
            throw new ChannelError(
                `packet too large: ${packet.byteSize}b > limit ${this.maxPacketSize}b ` +
                `(${this.id}). fragment before sending.`
            );
        }

        if (this.lossRate > 0 && Math.random() < this.lossRate) {
            this._stats.dropped++;
            if (this.verbose) {
                logger.hop(`${this.id} dropped ${packet.toString()}`);
            }
            return false;
        }

        this._stats.sent++;
        this._stats.totalBytes += packet.byteSize;
        this._stats.totalDelayMs += this.delayMs;

        if (this.verbose) {
            logger.hop(
                `${this.id} node${packet.route[packet.hopIndex]} ` +
                `→ node${packet.route[packet.hopIndex + 1] ?? packet.dstId} ` +
                `${packet.byteSize}b delay=${this.delayMs}ms`
            );
        }

        await Channel._sleep(this.delayMs);
        onDeliver(packet);
        return true;
    }

    get stats() {
        return {
            ...this._stats,
            avgDelayMs: this._stats.sent > 0
                ? (this._stats.totalDelayMs / this._stats.sent).toFixed(1)
                : 0,
            dropRate: this._stats.sent + this._stats.dropped > 0
                ? (this._stats.dropped / (this._stats.sent + this._stats.dropped)).toFixed(3)
                : 0,
        };
    }

    resetStats() {
        this._stats = { sent: 0, dropped: 0, totalBytes: 0, totalDelayMs: 0 };
    }

    static _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    toString() {
        return `Channel(${this.nodeA}↔${this.nodeB} max=${this.maxPacketSize}B delay=${this.delayMs}ms)`;
    }
}

module.exports = { Channel, ChannelError };