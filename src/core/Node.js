'use strict';

const { SessionManager } = require('../crypto/TLSHandshake');
const { logger } = require('../simulation/logger');

class NodeError extends Error {
    constructor(msg) { super(msg); this.name = 'NodeError'; }
}

class Node {
    constructor(id, options = {}) {
        this.id = id;
        this.binary = id.toString(2).padStart(3, '0');
        this.label = `Node${id}`;
        this.verbose = options.verbose !== undefined ? options.verbose : true;
        this._channels = new Map();
        this._sessionManager = options.sessionManager || new SessionManager({
            verbose: this.verbose,
            rsaBits: options.rsaBits || 2048,
        });
        this._inbox = new Map();
        this._onMessageCallbacks = [];
        this._stats = {
            packetsReceived: 0,
            packetsSent: 0,
            packetsForwarded: 0,
            messagesReceived: 0,
            bytesReceived: 0,
            bytesSent: 0,
        };
        this.online = true;
    }

    addChannel(neighborId, channel) {
        this._channels.set(neighborId, channel);
    }

    getChannel(neighborId) {
        const ch = this._channels.get(neighborId);
        if (!ch) throw new NodeError(`${this.label}: no channel to Node${neighborId}`);
        return ch;
    }

    get neighbors() {
        return Array.from(this._channels.keys()).sort((a, b) => a - b);
    }

    getOrEstablishSession(remoteId) {
        return this._sessionManager.getCipherFor(this.id, remoteId);
    }

    hasSession(remoteId) {
        return this._sessionManager.hasSession(this.id, remoteId);
    }

    async sendToNeighbor(neighborId, packet, onDeliver) {
        const channel = this.getChannel(neighborId);
        this._stats.packetsSent++;
        this._stats.bytesSent += packet.byteSize;
        return channel.transmit(packet, onDeliver);
    }

    onMessage(callback) {
        this._onMessageCallbacks.push(callback);
        return this;
    }

    getMessages() {
        return Array.from(this._inbox.values());
    }

    getLastMessage() {
        const msgs = this.getMessages();
        return msgs.length ? msgs[msgs.length - 1] : null;
    }

    hasMessages() {
        return this._inbox.size > 0;
    }

    clearInbox() {
        this._inbox.clear();
    }

    get stats() {
        return { ...this._stats };
    }

    resetStats() {
        this._stats = {
            packetsReceived: 0,
            packetsSent: 0,
            packetsForwarded: 0,
            messagesReceived: 0,
            bytesReceived: 0,
            bytesSent: 0,
        };
    }

    toString() {
        return `${this.label}(${this.binary}) neighbors=[${this.neighbors.join(',')}]`;
    }
}

module.exports = { Node, NodeError };