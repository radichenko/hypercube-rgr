'use strict';

const { Router, NODES } = require('./Router');
const { logger } = require('../simulation/logger');

class HypercubeNode {
    constructor(id) {
        this.id = id;
        this.binary = id.toString(2).padStart(3, '0');
        this.label = `Node${id}`;
        this.neighbors = [];
        this.online = true;
    }

    toString() {
        return `${this.label}(${this.binary})`;
    }

    neighborIds() {
        return [...this.neighbors];
    }

    isNeighbor(otherId) {
        return this.neighbors.includes(otherId);
    }
}

class Hypercube {
    constructor(options = {}) {
        this.verbose = options.verbose !== undefined ? options.verbose : true;
        this.router = new Router();
        this.nodes = new Map();
        this._edgeCount = 0;
        this._init();
    }

    _init() {
        for (let id = 0; id < NODES; id++) {
            this.nodes.set(id, new HypercubeNode(id));
        }
        const seen = new Set();
        for (let id = 0; id < NODES; id++) {
            const node = this.nodes.get(id);
            const neighbors = this.router.getNeighbors(id);
            node.neighbors = neighbors;
            for (const nId of neighbors) {
                const edgeKey = [Math.min(id, nId), Math.max(id, nId)].join('-');
                if (!seen.has(edgeKey)) {
                    seen.add(edgeKey);
                    this._edgeCount++;
                    if (this.verbose) {
                        logger.init(`${node.toString()} ↔ ${this.nodes.get(nId).toString()}`);
                    }
                }
            }
        }
        if (this.verbose) {
            logger.init(`hypercube initialized: ${NODES} nodes, ${this._edgeCount} edges`);
        }
    }

    getNode(id) {
        const node = this.nodes.get(id);
        if (!node) throw new Error(`Node ${id} not found`);
        return node;
    }

    allNodes() {
        return Array.from(this.nodes.values()).sort((a, b) => a.id - b.id);
    }

    get size() { return this.nodes.size; }
    get edgeCount() { return this._edgeCount; }

    getPath(srcId, dstId) { return this.router.getPath(srcId, dstId); }
    getAllPaths(srcId, dstId) { return this.router.getAllPaths(srcId, dstId); }
    distance(srcId, dstId) { return this.router.distance(srcId, dstId); }
    nextHop(currentId, dstId) { return this.router.nextHop(currentId, dstId); }
    getNeighbors(nodeId) { return this.router.getNeighbors(nodeId); }
    isNeighbor(a, b) { return this.router.isNeighbor(a, b); }
}

module.exports = { Hypercube, HypercubeNode };