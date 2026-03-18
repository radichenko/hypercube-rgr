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

    toString() {
        return `Packet(${this.type} | ${this.srcId}→${this.dstId} `
            + `frag ${this.fragIndex + 1}/${this.fragTotal} `
            + `size=${this.byteSize}B id=${this.id})`;
    }
}

Packet.HEADER_OVERHEAD = 64;

module.exports = { Packet, PacketType, PacketError };