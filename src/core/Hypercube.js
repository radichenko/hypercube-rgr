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

    isConnected() {
        const visited = new Set();
        const queue = [0];
        while (queue.length) {
            const id = queue.shift();
            if (visited.has(id)) continue;
            visited.add(id);
            for (const nId of this.getNeighbors(id)) {
                if (!visited.has(nId)) queue.push(nId);
            }
        }
        return visited.size === NODES;
    }

    diameter() {
        let max = 0;
        for (let i = 0; i < NODES; i++) {
            for (let j = i + 1; j < NODES; j++) {
                max = Math.max(max, this.distance(i, j));
            }
        }
        return max;
    }

    averageDegree() {
        const total = Array.from(this.nodes.values())
            .reduce((sum, n) => sum + n.neighbors.length, 0);
        return total / NODES;
    }

    topologyReport() {
        return {
            nodes: this.size,
            edges: this.edgeCount,
            diameter: this.diameter(),
            averageDegree: this.averageDegree(),
            connected: this.isConnected(),
            dimension: Math.log2(NODES),
        };
    }

    printTopology() {
        console.log(this.router.visualize());
        console.log('');
        logger.init('adjacency table (neighbors of each node):');
        for (const node of this.allNodes()) {
            const nbStr = node.neighbors
                .map(id => `Node${id}(${id.toString(2).padStart(3, '0')})`)
                .join(', ');
            logger.init(`  ${node.toString().padEnd(12)} → [${nbStr}]`);
        }
        console.log('');
        const report = this.topologyReport();
        logger.init(
            `nodes: ${report.nodes} | edges: ${report.edges} | ` +
            `diameter: ${report.diameter} | degree: ${report.averageDegree} | ` +
            `connected: ${report.connected}`
        );
    }

    printRoutingTable() {
        logger.section('routing table (all pairs)');
        const rows = this.router.dumpRoutingTable();
        console.log(
            '  ' +
            'Src'.padEnd(6) +
            'Dst'.padEnd(6) +
            'Hops'.padEnd(6) +
            'Path'
        );
        console.log('  ' + '─'.repeat(50));
        for (const row of rows) {
            console.log(
                '  ' +
                String(row.src).padEnd(6) +
                String(row.dst).padEnd(6) +
                String(row.hops).padEnd(6) +
                row.path
            );
        }
    }
}

module.exports = { Hypercube, HypercubeNode };