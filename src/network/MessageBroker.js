'use strict';

const { Node } = require('../core/Node');
const { Channel } = require('./Channel');
const { Hypercube } = require('../core/Hypercube');
const { Fragmenter, PacketType, Packet, PacketUtils } = require('../core/Packet');
const { SessionManager } = require('../crypto/TLSHandshake');
const { logger } = require('../simulation/logger');

class BrokerError extends Error {
    constructor(msg) { super(msg); this.name = 'BrokerError'; }
}

class MessageBroker {
    constructor(options = {}) {
        this.maxPacketSize = options.maxPacketSize !== undefined ? options.maxPacketSize : 256;
        this.channelDelayMs = options.channelDelayMs !== undefined ? options.channelDelayMs : 50;
        this.lossRate = options.lossRate !== undefined ? options.lossRate : 0;
        this.verbose = options.verbose !== undefined ? options.verbose : true;
        this.rsaBits = options.rsaBits !== undefined ? options.rsaBits : 2048;

        this._sessionManager = new SessionManager({
            verbose: this.verbose,
            rsaBits: this.rsaBits,
        });
        this._hypercube = new Hypercube({ verbose: this.verbose });
        this._nodes = new Map();
        this._channels = new Map();
        this._globalStats = {
            totalPacketsSent: 0,
            totalPacketsForwarded: 0,
            totalHops: 0,
            totalMessages: 0,
            totalBroadcasts: 0,
            startTime: Date.now(),
        };
        this._init();
    }

    _init() {
        for (let id = 0; id < 8; id++) {
            const node = new Node(id, {
                verbose: this.verbose,
                sessionManager: this._sessionManager,
                rsaBits: this.rsaBits,
            });
            this._nodes.set(id, node);
        }

        const seen = new Set();
        for (let id = 0; id < 8; id++) {
            for (const nId of this._hypercube.getNeighbors(id)) {
                const key = `${Math.min(id, nId)}-${Math.max(id, nId)}`;
                if (seen.has(key)) continue;
                seen.add(key);

                const channel = new Channel(id, nId, {
                    maxPacketSize: this.maxPacketSize,
                    delayMs: this.channelDelayMs,
                    lossRate: this.lossRate,
                    verbose: this.verbose,
                });

                this._channels.set(key, channel);
                this._nodes.get(id).addChannel(nId, channel);
                this._nodes.get(nId).addChannel(id, channel);
            }
        }

        if (this.verbose) {
            logger.init(
                `messagebroker ready: 8 nodes, ${this._channels.size} channels, ` +
                `maxpacket=${this.maxPacketSize}b, delay=${this.channelDelayMs}ms`
            );
        }
    }

    getNode(id) {
        const node = this._nodes.get(id);
        if (!node) throw new BrokerError(`Node ${id} not found`);
        return node;
    }

    allNodes() {
        return Array.from(this._nodes.values()).sort((a, b) => a.id - b.id);
    }

    async handshake(srcId, dstId) {
        if (this.verbose) {
            logger.section(`tls handshake: node${srcId} ↔ node${dstId}`);
        }
        this._sessionManager.getOrCreate(srcId, dstId);
    }

    async send(srcId, dstId, message) {
        if (srcId === dstId) throw new BrokerError('src and dst cannot be the same');
        this._assertNodeId(srcId);
        this._assertNodeId(dstId);

        const t0 = Date.now();

        if (!this._sessionManager.hasSession(srcId, dstId)) {
            if (this.verbose) logger.section(`tls handshake: node${srcId} ↔ node${dstId}`);
            this._sessionManager.getOrCreate(srcId, dstId);
        }

        const cipher = this._sessionManager.getCipherFor(srcId, dstId);
        const plainBuf = Buffer.isBuffer(message)
            ? message
            : Buffer.from(String(message), 'utf8');
        const encrypted = cipher.encrypt(plainBuf);

        if (this.verbose) {
            logger.send(
                `node${srcId} → node${dstId} ` +
                `plain=${PacketUtils.formatSize(plainBuf.length)} ` +
                `encrypted=${PacketUtils.formatSize(encrypted.length)}`
            );
        }

        const route = this._hypercube.getPath(srcId, dstId);

        if (this.verbose) {
            logger.route(`route: ${logger.routePath(route)} (${route.length - 1} hops)`);
        }

        const packets = Fragmenter.fragment(
            encrypted, srcId, dstId, this.maxPacketSize,
            { route, type: PacketType.DATA }
        );

        if (this.verbose) {
            logger.packet(
                `fragmentation: ${packets.length} packets ` +
                `(max ${this.maxPacketSize}b/packet, ` +
                `total ${PacketUtils.formatSize(PacketUtils.totalBytes(packets))})`
            );
        }

        let totalHops = 0;
        const promises = packets.map(packet =>
            this._routePacket(packet).then(hops => { totalHops += hops; })
        );
        await Promise.all(promises);

        const ms = Date.now() - t0;
        this._globalStats.totalPacketsSent += packets.length;
        this._globalStats.totalHops += totalHops;
        this._globalStats.totalMessages++;

        if (this.verbose) {
            logger.success(
                `delivered node${srcId} → node${dstId} ` +
                `packets=${packets.length} hops=${totalHops} time=${ms}ms`
            );
        }

        return { packets: packets.length, hops: totalHops, ms };
    }

    async _routePacket(packet) {
        let current = packet;
        let hops = 0;

        while (!current.isAtDestination()) {
            const fromId = current.route[current.hopIndex];
            const toId = current.route[current.hopIndex + 1];
            const fromNode = this._nodes.get(fromId);
            const advanced = current.advance();

            let delivered = false;
            await fromNode.sendToNeighbor(toId, current, () => {
                delivered = true;
                this._globalStats.totalPacketsForwarded++;
            });

            if (!delivered) {
                logger.error(
                    `packet ${current.id} lost on ${fromId}→${toId} (hop ${hops + 1})`
                );
                return hops;
            }

            hops++;
            current = advanced;

            if (current.isAtDestination()) {
                const dstNode = this._nodes.get(current.dstId);
                dstNode.receivePacket(current);
                this._globalStats.totalHops++;
            }
        }

        return hops;
    }

    _assertNodeId(id) {
        if (!Number.isInteger(id) || id < 0 || id > 7) {
            throw new BrokerError(`invalid node id: ${id}. must be 0–7.`);
        }
    }
}

module.exports = { MessageBroker, BrokerError };