'use strict';

const NODES = 8;

class RouterError extends Error {
    constructor(msg) { super(msg); this.name = 'RouterError'; }
}

function assertNodeId(id) {
    if (!Number.isInteger(id) || id < 0 || id >= NODES) {
        throw new RouterError(`invalid node id: ${id}. must be 0–${NODES - 1}.`);
    }
}

function isNeighbor(a, b) {
    const xor = a ^ b;
    return xor !== 0 && (xor & (xor - 1)) === 0;
}

function getNeighbors(nodeId) {
    assertNodeId(nodeId);
    const neighbors = [];
    for (let bit = 0; bit < 3; bit++) {
        neighbors.push(nodeId ^ (1 << bit));
    }
    return neighbors.sort((a, b) => a - b);
}

function getPath(src, dst) {
    assertNodeId(src);
    assertNodeId(dst);
    if (src === dst) return [src];
    const path = [src];
    let current = src;
    for (let bit = 2; bit >= 0; bit--) {
        const mask = 1 << bit;
        if ((current & mask) !== (dst & mask)) {
            current = current ^ mask;
            path.push(current);
        }
    }
    return path;
}

function getAllOptimalPaths(src, dst) {
    assertNodeId(src);
    assertNodeId(dst);
    if (src === dst) return [[src]];
    const diff = src ^ dst;
    const bitsToFix = [];
    for (let bit = 0; bit < 3; bit++) {
        if (diff & (1 << bit)) bitsToFix.push(bit);
    }
    function permute(current, remaining) {
        if (remaining.length === 0) return [[current]];
        const results = [];
        for (const bit of remaining) {
            const next = current ^ (1 << bit);
            const rest = remaining.filter(b => b !== bit);
            const subPaths = permute(next, rest);
            for (const sub of subPaths) {
                results.push([current, ...sub]);
            }
        }
        return results;
    }
    return permute(src, bitsToFix);
}

function getDistance(a, b) {
    const xor = a ^ b;
    let count = 0, n = xor;
    while (n) { count += n & 1; n >>= 1; }
    return count;
}

function buildRoutingTable() {
    const table = new Map();
    for (let src = 0; src < NODES; src++) {
        for (let dst = 0; dst < NODES; dst++) {
            if (src !== dst) {
                table.set(`${src}-${dst}`, getPath(src, dst));
            }
        }
    }
    return table;
}

function buildAdjacencyMatrix() {
    const matrix = Array.from({ length: NODES }, () => new Array(NODES).fill(0));
    for (let i = 0; i < NODES; i++) {
        for (const j of getNeighbors(i)) {
            matrix[i][j] = 1;
        }
    }
    return matrix;
}

function toBin(n) {
    return n.toString(2).padStart(3, '0');
}

function visualizeTopology() {
    const lines = [];
    lines.push('');
    lines.push('  hypercube topology (8 nodes):');
    lines.push('');
    lines.push('    3 ────── 7');
    lines.push('   /|       /|');
    lines.push('  1 ────── 5 |');
    lines.push('  | 2 ─────| 6');
    lines.push('  |/       |/');
    lines.push('  0 ────── 4');
    lines.push('');
    lines.push('  edges (12 total):');
    const seen = new Set();
    for (let i = 0; i < NODES; i++) {
        for (const j of getNeighbors(i)) {
            const key = [Math.min(i, j), Math.max(i, j)].join('-');
            if (!seen.has(key)) {
                seen.add(key);
                lines.push(`    node${i}(${toBin(i)}) ↔ node${j}(${toBin(j)})`);
            }
        }
    }
    return lines.join('\n');
}

class Router {
    constructor() {
        this._table = buildRoutingTable();
        this._adjacency = buildAdjacencyMatrix();
    }

    getPath(src, dst) {
        if (src === dst) return [src];
        const key = `${src}-${dst}`;
        return [...this._table.get(key)];
    }

    getAllPaths(src, dst) {
        return getAllOptimalPaths(src, dst);
    }

    getNeighbors(nodeId) {
        return getNeighbors(nodeId);
    }

    distance(a, b) {
        return getDistance(a, b);
    }

    isNeighbor(a, b) {
        return isNeighbor(a, b);
    }

    nextHop(current, dst) {
        if (current === dst) return dst;
        const path = this.getPath(current, dst);
        return path[1];
    }

    getAdjacencyMatrix() {
        return this._adjacency.map(row => [...row]);
    }

    visualize() {
        return visualizeTopology();
    }

    dumpRoutingTable() {
        const rows = [];
        for (let src = 0; src < NODES; src++) {
            for (let dst = 0; dst < NODES; dst++) {
                if (src !== dst) {
                    const path = this.getPath(src, dst);
                    rows.push({
                        src,
                        dst,
                        hops: path.length - 1,
                        path: path.join(' → '),
                    });
                }
            }
        }
        return rows;
    }

    toBin(n) { return toBin(n); }
}

module.exports = {
    Router,
    RouterError,
    isNeighbor,
    getNeighbors,
    getPath,
    getAllOptimalPaths,
    getDistance,
    buildRoutingTable,
    buildAdjacencyMatrix,
    NODES,
};