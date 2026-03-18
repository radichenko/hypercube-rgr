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

class Router {
    constructor() {}

    getPath(src, dst) {
        if (src === dst) return [src];
        return getPath(src, dst);
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
}

module.exports = { Router, RouterError, isNeighbor, getNeighbors, getPath, getAllOptimalPaths, getDistance, NODES };