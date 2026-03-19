'use strict';

const { logger } = require('./logger');

async function scenarioTopology(broker) {
    logger.section('scenario 1: hypercube topology');
    broker._hypercube.printTopology();
    logger.init('network parameters:');
    logger.init(`  dimension: 3d (2³ = 8 nodes)`);
    logger.init(`  edges: ${broker._hypercube.edgeCount}`);
    logger.init(`  diameter: ${broker._hypercube.diameter()} hops`);
    logger.init(`  node degree: ${broker._hypercube.averageDegree()} (each node has exactly 3 neighbors)`);
    logger.init(`  connectivity: ${broker._hypercube.isConnected() ? 'full ✓' : 'not full ✗'}`);
    logger.init(`  packet limit: ${broker.maxPacketSize} bytes`);
    logger.init(`  channel delay: ${broker.channelDelayMs} ms`);
    logger.init('');
    logger.init('routing table (selected pairs):');
    const pairs = [
        [0, 7, 'maximum distance (3 hops)'],
        [0, 1, 'neighbors (1 hop)'],
        [2, 5, 'average distance (3 hops)'],
        [1, 4, 'average distance (2 hops)'],
    ];
    for (const [s, d, comment] of pairs) {
        const path = broker._hypercube.getPath(s, d);
        logger.route(
            `Node${s}(${s.toString(2).padStart(3, '0')}) → Node${d}(${d.toString(2).padStart(3, '0')})` +
            ` path: ${path.join('→')} (${path.length - 1} hops) — ${comment}`
        );
    }
}

async function scenarioHandshake(broker) {
    logger.section('scenario 2: tls handshake between node pairs');
    logger.tls('simulating tls handshake for 3 node pairs...');
    logger.tls('');

    const pairs = [[0, 7], [2, 5], [1, 6]];
    const results = [];

    for (const [a, b] of pairs) {
        const t0 = Date.now();
        broker._sessionManager.getOrCreate(a, b);
        const ms = Date.now() - t0;
        results.push({ a, b, ms });
    }

    logger.tls('');
    logger.tls('handshake results:');
    for (const r of results) {
        const key = broker._sessionManager.listSessions()
            .find(s => s.nodes === `Node${Math.min(r.a, r.b)} ↔ Node${Math.max(r.a, r.b)}`);
        logger.success(
            `Node${r.a} ↔ Node${r.b} SessionKey=${key ? key.sessionKey : '?'} time=${r.ms}ms`
        );
    }

    logger.tls('');
    logger.tls(`cached sessions (repeat request): Node0↔Node7 [already exists — skipping handshake]`);
    const t1 = Date.now();
    broker._sessionManager.getOrCreate(0, 7);
    logger.success(`cache hit in ${Date.now() - t1}ms (instead of ~10-200ms)`);
}

async function scenarioUnicast(broker) {
    logger.section('scenario 3: unicast — transmission between different pairs');

    const cases = [
        { src: 0, dst: 1, msg: 'message at distance 1 hop' },
        { src: 0, dst: 3, msg: 'message at distance 2 hops' },
        { src: 0, dst: 7, msg: 'message at distance 3 hops (diameter)' },
        { src: 5, dst: 2, msg: 'reverse route: Node5→Node2' },
    ];

    const summary = [];
    for (const c of cases) {
        logger.send(`\n sending: Node${c.src} → Node${c.dst} "${c.msg}"`);
        const result = await broker.send(c.src, c.dst, c.msg);
        summary.push({ ...c, ...result });
    }

    logger.stat('');
    logger.stat('unicast summary:');
    logger.stat('  ' + 'route'.padEnd(14) + 'hops'.padEnd(8) + 'packets'.padEnd(10) + 'time');
    logger.stat('  ' + '─'.repeat(44));
    for (const r of summary) {
        logger.stat(
            '  ' +
            `Node${r.src}→Node${r.dst}`.padEnd(14) +
            String(r.hops).padEnd(8) +
            String(r.packets).padEnd(10) +
            `${r.ms}ms`
        );
    }
}

module.exports = {
    scenarioTopology,
    scenarioHandshake,
    scenarioUnicast,
};