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

module.exports = { RouterError, isNeighbor, getNeighbors, getPath, NODES };