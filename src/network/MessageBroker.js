'use strict';

const { Node } = require('../core/Node');
const { Channel } = require('./Channel');
const { Hypercube } = require('../core/Hypercube');
const { Fragmenter, PacketType, Packet } = require('../core/Packet');
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

    _assertNodeId(id) {
        if (!Number.isInteger(id) || id < 0 || id > 7) {
            throw new BrokerError(`invalid node id: ${id}. must be 0–7.`);
        }
    }
}

module.exports = { MessageBroker, BrokerError };