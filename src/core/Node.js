'use strict';

const { Reassembler } = require('./Packet');
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
        this._reassemblers = new Map();
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

    receivePacket(packet) {
        if (!this.online) return;
        this._stats.packetsReceived++;
        this._stats.bytesReceived += packet.byteSize;
        if (packet.dstId === this.id) {
            this._handleIncomingData(packet);
        }
    }

    _handleIncomingData(packet) {
        const { PacketType } = require('./Packet');
        if (packet.type !== PacketType.DATA) return;

        const key = `${packet.srcId}-${packet.messageId}`;
        if (!this._reassemblers.has(key)) {
            this._reassemblers.set(key, new Reassembler());
        }
        const asm = this._reassemblers.get(key);

        if (this.verbose) {
            logger.recv(
                `${this.label} ← packet from node${packet.srcId} ` +
                `frag ${packet.fragIndex + 1}/${packet.fragTotal} ` +
                `${packet.byteSize}b`
            );
        }

        const assembled = asm.addFragment(packet);
        if (assembled !== null) {
            this._reassemblers.delete(key);
            this._finalizeMessage(packet.srcId, packet.dstId, packet.messageId, assembled, packet.meta);
        }
    }

    _finalizeMessage(srcId, dstId, messageId, encryptedData, meta) {
        let plaintext;
        try {
            const cipher = this._sessionManager.getCipherFor(dstId, srcId);
            plaintext = cipher.decrypt(encryptedData);
        } catch (e) {
            plaintext = encryptedData;
        }

        const entry = {
            srcId,
            dstId,
            messageId,
            data: plaintext,
            text: plaintext.toString('utf8'),
            receivedAt: Date.now(),
            meta: meta || {},
        };

        this._inbox.set(messageId, entry);
        this._stats.messagesReceived++;

        if (this.verbose) {
            const preview = entry.text.length > 60
                ? entry.text.slice(0, 60) + '...'
                : entry.text;
            logger.recv(`${this.label} ✓ message from node${srcId}: "${preview}"`);
        }

        for (const cb of this._onMessageCallbacks) {
            try { cb(entry, this); } catch (_) {}
        }
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

    toInfo() {
        return {
            id: this.id,
            binary: this.binary,
            label: this.label,
            neighbors: this.neighbors,
            online: this.online,
            sessions: this._sessionManager.sessionCount,
            messages: this._inbox.size,
            stats: this.stats,
        };
    }
}

module.exports = { Node, NodeError };