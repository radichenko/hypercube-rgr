'use strict';

const crypto = require('crypto');

const PacketType = Object.freeze({
    DATA: 'DATA',
    TLS_HELLO_C: 'TLS_HELLO_C',
    TLS_HELLO_S: 'TLS_HELLO_S',
    TLS_KEY: 'TLS_KEY',
    TLS_PRE: 'TLS_PRE',
    TLS_READY: 'TLS_READY',
    ACK: 'ACK',
    BROADCAST: 'BROADCAST',
});

class PacketError extends Error {
    constructor(message) {
        super(message);
        this.name = 'PacketError';
    }
}

class Packet {
    constructor(options = {}) {
        if (!options.type) throw new PacketError('packet: type is required');
        if (options.srcId === undefined) throw new PacketError('packet: srcid is required');
        if (options.dstId === undefined) throw new PacketError('packet: dstid is required');

        this.id = options.id || Packet._generateId();
        this.type = options.type;
        this.srcId = options.srcId;
        this.dstId = options.dstId;
        this.payload = options.payload !== undefined ? options.payload : Buffer.alloc(0);
        this.messageId = options.messageId || this.id;
        this.fragIndex = options.fragIndex !== undefined ? options.fragIndex : 0;
        this.fragTotal = options.fragTotal !== undefined ? options.fragTotal : 1;
        this.route = options.route || [];
        this.hopIndex = options.hopIndex !== undefined ? options.hopIndex : 0;
        this.meta = options.meta || {};
        this.createdAt = options.createdAt || Date.now();
    }

    static _generateId() {
        return crypto.randomBytes(4).toString('hex');
    }

    get byteSize() {
        const payloadSize = Buffer.isBuffer(this.payload)
            ? this.payload.length
            : Buffer.byteLength(String(this.payload), 'utf8');
        return payloadSize + Packet.HEADER_OVERHEAD;
    }

    toJSON() {
        return {
            id: this.id,
            type: this.type,
            srcId: this.srcId,
            dstId: this.dstId,
            payload: Buffer.isBuffer(this.payload)
                ? this.payload.toString('base64')
                : this.payload,
            payloadEncoding: Buffer.isBuffer(this.payload) ? 'base64' : 'string',
            messageId: this.messageId,
            fragIndex: this.fragIndex,
            fragTotal: this.fragTotal,
            route: this.route,
            hopIndex: this.hopIndex,
            meta: this.meta,
            createdAt: this.createdAt,
        };
    }

    static fromJSON(obj) {
        const payload = obj.payloadEncoding === 'base64'
            ? Buffer.from(obj.payload, 'base64')
            : obj.payload;
        return new Packet({ ...obj, payload });
    }

    nextHop() {
        if (this.hopIndex + 1 < this.route.length) {
            return this.route[this.hopIndex + 1];
        }
        return null;
    }

    advance() {
        return new Packet({
            ...this.toJSON(),
            payload: this.payload,
            hopIndex: this.hopIndex + 1,
        });
    }

    isLastFragment() { return this.fragIndex === this.fragTotal - 1; }
    isOnlyFragment() { return this.fragTotal === 1; }
    isAtDestination() {
        return this.route.length > 0
            ? this.hopIndex === this.route.length - 1
            : true;
    }

    toString() {
        return `Packet(${this.type} | ${this.srcId}→${this.dstId} `
            + `frag ${this.fragIndex + 1}/${this.fragTotal} `
            + `size=${this.byteSize}B id=${this.id})`;
    }
}

Packet.HEADER_OVERHEAD = 64;

class Fragmenter {
    static fragment(data, srcId, dstId, maxPacketSize, options = {}) {
        if (maxPacketSize <= Packet.HEADER_OVERHEAD) {
            throw new PacketError(
                `maxpacketsize (${maxPacketSize}b) must be greater than header overhead (${Packet.HEADER_OVERHEAD}b)`
            );
        }
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
        const maxPayload = maxPacketSize - Packet.HEADER_OVERHEAD;
        const messageId = Packet._generateId();
        const packets = [];

        if (buf.length === 0) {
            packets.push(new Packet({
                type: options.type || PacketType.DATA,
                srcId,
                dstId,
                payload: Buffer.alloc(0),
                messageId,
                fragIndex: 0,
                fragTotal: 1,
                route: options.route || [],
                meta: options.meta || {},
            }));
            return packets;
        }

        const totalFrags = Math.ceil(buf.length / maxPayload);
        for (let i = 0; i < totalFrags; i++) {
            const slice = buf.slice(i * maxPayload, (i + 1) * maxPayload);
            packets.push(new Packet({
                type: options.type || PacketType.DATA,
                srcId,
                dstId,
                payload: slice,
                messageId,
                fragIndex: i,
                fragTotal: totalFrags,
                route: options.route ? [...options.route] : [],
                meta: options.meta || {},
            }));
        }
        return packets;
    }
}

class Reassembler {
    constructor() {
        this._buffers = new Map();
    }

    addFragment(packet) {
        const key = packet.messageId;
        if (!this._buffers.has(key)) {
            this._buffers.set(key, {
                total: packet.fragTotal,
                srcId: packet.srcId,
                dstId: packet.dstId,
                type: packet.type,
                meta: packet.meta,
                received: new Map(),
            });
        }
        const entry = this._buffers.get(key);
        entry.received.set(packet.fragIndex, packet.payload);

        if (entry.received.size === entry.total) {
            const parts = [];
            for (let i = 0; i < entry.total; i++) {
                const part = entry.received.get(i);
                if (!part) throw new PacketError(`missing fragment ${i} for message ${key}`);
                parts.push(part);
            }
            this._buffers.delete(key);
            return Buffer.concat(parts);
        }
        return null;
    }

    pendingCount() { return this._buffers.size; }

    receivedCount(messageId) {
        return this._buffers.has(messageId)
            ? this._buffers.get(messageId).received.size
            : 0;
    }

    reset() { this._buffers.clear(); }
}

const PacketUtils = {
    totalBytes(packets) {
        return packets.reduce((sum, p) => sum + p.byteSize, 0);
    },
    formatSize(bytes) {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
        return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    },
    exceedsLimit(packet, maxPacketSize) {
        return packet.byteSize > maxPacketSize;
    },
    groupByMessage(packets) {
        const groups = new Map();
        for (const p of packets) {
            if (!groups.has(p.messageId)) groups.set(p.messageId, []);
            groups.get(p.messageId).push(p);
        }
        return groups;
    },
};

module.exports = {
    Packet,
    PacketType,
    PacketError,
    Fragmenter,
    Reassembler,
    PacketUtils,
};