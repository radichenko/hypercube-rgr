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

async function scenarioFragmentation(broker) {
    logger.section('scenario 4: fragmentation — large file transfer');

    const fileContent = [
        '=== report: results of distributed system operation ===',
        '',
        'date: ' + new Date().toISOString(),
        'system: hypercube 3d (8 nodes)',
        '',
        'topology:',
        '  - number of nodes: 8',
        '  - number of edges: 12',
        '  - diameter: 3 hops',
        '  - degree: 3 (each node is connected to 3 neighbors)',
        '',
        'security:',
        '  - protocol: tls-like handshake',
        '  - encryption: aes-256-gcm (symmetric)',
        '  - key exchange: rsa-2048 + hkdf-sha256',
        '  - each node pair has a unique session key',
        '',
        'data transfer:',
        '  - packet limit: ' + broker.maxPacketSize + ' bytes',
        '  - channel delay: ' + broker.channelDelayMs + ' ms',
        '  - fragmentation: automatic',
        '  - reassembly: automatic with integrity check',
        '',
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(5),
        'Distributed systems require careful attention to routing. '.repeat(4),
        '',
        '=== end of report ===',
    ].join('\n');

    const fileBuf = Buffer.from(fileContent, 'utf8');
    logger.packet(`file to transfer:`);
    logger.packet(`  size: ${fileBuf.length} bytes`);
    logger.packet(`  packet limit: ${broker.maxPacketSize} bytes`);

    const { Fragmenter } = require('../core/Packet');
    const preview = Fragmenter.fragment(fileBuf, 0, 7, broker.maxPacketSize);
    logger.packet(`  expected fragments (without encryption): ~${preview.length}`);
    logger.packet('');

    logger.send(`sending Node2 → Node5 (3 hops)...`);
    const result = await broker.send(2, 5, fileContent);

    logger.packet('');
    logger.stat(`actual packets: ${result.packets}`);
    logger.stat(`total hops: ${result.hops}`);
    logger.stat(`delivery time: ${result.ms}ms`);

    const received = broker.getNode(5).getLastMessage();
    const intact = received && received.text === fileContent;
    logger.success(`data integrity: ${intact ? 'confirmed ✓' : 'corrupted ✗'}`);
    if (intact) {
        logger.success(`received size: ${Buffer.from(received.text, 'utf8').length} bytes (matches original)`);
    }
}

async function scenarioParallel(broker) {
    logger.section('scenario 5: parallel transmission (4 concurrent streams)');
    logger.send('starting 4 parallel transfers:');

    const transfers = [
        { src: 0, dst: 7, msg: 'Stream A: Node0→Node7' },
        { src: 1, dst: 6, msg: 'Stream B: Node1→Node6' },
        { src: 2, dst: 5, msg: 'Stream C: Node2→Node5' },
        { src: 3, dst: 4, msg: 'Stream D: Node3→Node4' },
    ];

    for (const t of transfers) {
        logger.send(`  ${t.src}→${t.dst}: "${t.msg}"`);
    }
    logger.send('');

    const t0 = Date.now();
    const results = await Promise.all(
        transfers.map(t => broker.send(t.src, t.dst, t.msg))
    );
    const elapsed = Date.now() - t0;

    logger.stat('');
    logger.stat('parallel transmission results:');
    for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const t = transfers[i];
        logger.success(
            `  Node${t.src}→Node${t.dst} packets=${r.packets} hops=${r.hops} ${r.ms}ms`
        );
    }
    logger.stat(`total time (parallel): ${elapsed}ms`);

    let ok = 0;
    for (const t of transfers) {
        const node = broker.getNode(t.dst);
        const msgs = node.getMessages();
        if (msgs.some(m => m.text === t.msg)) ok++;
    }
    logger.success(`delivered correctly: ${ok}/${transfers.length} ✓`);
}

async function scenarioBroadcast(broker) {
    logger.section('scenario 6: broadcast from Node0 to all 7 nodes');

    const broadcastMsg = `[BROADCAST] system message from Node0: time=${Date.now()}`;
    logger.send(`message: "${broadcastMsg}"`);
    logger.send('');

    const results = await broker.broadcast(0, broadcastMsg);

    logger.stat('');
    logger.stat('broadcast results:');
    let totalPackets = 0, totalHops = 0;
    for (const r of results) {
        logger.success(
            `  Node0→Node${r.dstId} ` +
            `hops=${broker._hypercube.distance(0, r.dstId)} ` +
            `packets=${r.packets} time=${r.ms}ms`
        );
        totalPackets += r.packets;
        totalHops += r.hops;
    }

    logger.stat('');
    logger.stat(`total packets in broadcast: ${totalPackets}`);
    logger.stat(`total hops: ${totalHops}`);

    const targets = [1, 2, 3, 4, 5, 6, 7];
    let received = 0;
    for (const id of targets) {
        const msgs = broker.getNode(id).getMessages();
        if (msgs.some(m => m.text === broadcastMsg)) received++;
    }
    logger.success(`received broadcast: ${received}/${targets.length} nodes ✓`);
}

async function scenarioStress(broker) {
    logger.section('scenario 7: stress test (20 random transfers)');

    const N = 20;
    logger.send(`generating and sending ${N} random messages...`);

    const tasks = [];
    const crypto = require('crypto');
    for (let i = 0; i < N; i++) {
        const src = Math.floor(Math.random() * 8);
        let dst = Math.floor(Math.random() * 8);
        while (dst === src) dst = Math.floor(Math.random() * 8);
        const msg = `MSG#${i} [${crypto.randomBytes(8).toString('hex')}] src=${src} dst=${dst}`;
        tasks.push({ src, dst, msg });
    }

    const t0 = Date.now();
    let success = 0, fail = 0;
    const batchSize = 5;

    for (let b = 0; b < tasks.length; b += batchSize) {
        const batch = tasks.slice(b, b + batchSize);
        const results = await Promise.all(
            batch.map(t =>
                broker.send(t.src, t.dst, t.msg)
                    .then(r => ({ ...r, ok: true }))
                    .catch(() => ({ ok: false }))
            )
        );
        results.forEach(r => r.ok ? success++ : fail++);
        logger.stat(
            `  batch ${Math.floor(b / batchSize) + 1}/${Math.ceil(N / batchSize)}: ` +
            `✓${results.filter(r => r.ok).length} ✗${results.filter(r => !r.ok).length}`
        );
    }

    const elapsed = Date.now() - t0;
    logger.stat('');
    logger.stat(`stress test results:`);
    logger.stat(`  total: ${N} messages`);
    logger.stat(`  success: ${success}`);
    logger.stat(`  failed: ${fail}`);
    logger.stat(`  time: ${elapsed}ms`);
    logger.stat(`  throughput: ${(N / elapsed * 1000).toFixed(1)} messages/sec`);
}

module.exports = {
    scenarioTopology,
    scenarioHandshake,
    scenarioUnicast,
    scenarioFragmentation,
    scenarioParallel,
    scenarioBroadcast,
    scenarioStress,
};