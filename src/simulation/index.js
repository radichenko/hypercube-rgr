'use strict';

const readline = require('readline');
const { MessageBroker } = require('../network/MessageBroker');
const { logger } = require('./logger');
const {
    scenarioTopology,
    scenarioHandshake,
    scenarioUnicast,
    scenarioFragmentation,
    scenarioParallel,
    scenarioBroadcast,
    scenarioStress,
} = require('./scenarios');

const CONFIG = {
    maxPacketSize: 256,
    channelDelayMs: 30,
    lossRate: 0,
    verbose: true,
    rsaBits: 2048,
};

const SCENARIOS = [
    { key: '1', name: 'hypercube topology',        fn: scenarioTopology     },
    { key: '2', name: 'tls handshake',             fn: scenarioHandshake    },
    { key: '3', name: 'unicast (different routes)', fn: scenarioUnicast      },
    { key: '4', name: 'large file fragmentation',  fn: scenarioFragmentation },
    { key: '5', name: 'parallel transmission',     fn: scenarioParallel     },
    { key: '6', name: 'broadcast',                 fn: scenarioBroadcast    },
    { key: '7', name: 'stress test (20 transfers)', fn: scenarioStress      },
];

function prompt(rl, question) {
    return new Promise(resolve => rl.question(question, resolve));
}

function printMenu() {
    const chalk = require('chalk');
    console.log('');
    console.log(chalk.bold.cyanBright('  choose scenario'));
    for (const s of SCENARIOS) {
        console.log(chalk.cyanBright(`  ${chalk.bold.yellow('[' + s.key + ']')} ${s.name.padEnd(39)}`));
    }
    console.log(chalk.cyanBright(`  ${chalk.bold.green('[A]')} run all scenarios sequentially`));
    console.log(chalk.cyanBright(`  ${chalk.bold.magenta('[V]')} toggle verbose (current: ${CONFIG.verbose ? chalk.green('on ') : chalk.red('off')})`));
    console.log(chalk.cyanBright(`  ${chalk.bold.red('[Q]')} exit`));
    console.log('');
}

async function runScenario(scenario, broker) {
    logger.resetTimer();
    const t0 = Date.now();
    try {
        await scenario.fn(broker);
        logger.success(`scenario "${scenario.name}" completed in ${Date.now() - t0}ms`);
    } catch (err) {
        logger.error(`scenario "${scenario.name}" failed with error: ${err.message}`);
        logger.error(err.stack);
    }
}

async function runAll(broker) {
    logger.section('run all scenarios');
    const results = [];
    for (const s of SCENARIOS) {
        const t0 = Date.now();
        try {
            await s.fn(broker);
            results.push({ name: s.name, ok: true, ms: Date.now() - t0 });
        } catch (err) {
            logger.error(`"${s.name}": ${err.message}`);
            results.push({ name: s.name, ok: false, ms: Date.now() - t0 });
        }
    }
    logger.section('summary of all scenarios');
    for (const r of results) {
        logger.stat(`  ${r.ok ? logger.ok() : logger.fail()} ${r.name.padEnd(35)} ${r.ms}ms`);
    }
    broker.printStats();
    broker.printInboxes();
}

async function main() {
    logger.section('network initialization');
    logger.init(`maxPacketSize=${CONFIG.maxPacketSize}B delay=${CONFIG.channelDelayMs}ms rsa=${CONFIG.rsaBits}bit`);

    let broker = new MessageBroker({ ...CONFIG, verbose: false });
    logger.init('network initialized. tls sessions will be cached between runs.\n');

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    rl.on('close', () => {
        console.log('\n');
        logger.success('goodbye!');
        process.exit(0);
    });

    let running = true;
    while (running) {
        printMenu();
        const answer = (await prompt(rl, '  your choice: ')).trim().toUpperCase();
        console.log('');

        if (answer === 'Q') {
            running = false;
            logger.success('simulation finished.');
            broker.printStats();
        } else if (answer === 'A') {
            await runAll(broker);
        } else if (answer === 'V') {
            CONFIG.verbose = !CONFIG.verbose;
            broker = new MessageBroker({ ...CONFIG, verbose: false });
            logger.success(`verbose now: ${CONFIG.verbose ? 'on' : 'off'}. network restarted.`);
        } else if (answer >= '1' && answer <= '7') {
            const idx = parseInt(answer) - 1;
            const scenario = SCENARIOS[idx];
            broker.verbose = CONFIG.verbose;
            broker._hypercube.verbose = CONFIG.verbose;
            for (const node of broker.allNodes()) node.verbose = CONFIG.verbose;
            for (const ch of broker._channels.values()) ch.verbose = CONFIG.verbose;
            broker._sessionManager.verbose = CONFIG.verbose;
            await runScenario(scenario, broker);
            await prompt(rl, '\n  press enter to return to menu...');
        } else {
            logger.error(`unknown command: "${answer}". try 1–7, a, v or q.`);
        }
    }

    rl.close();
}

main().catch(err => {
    logger.error('critical error: ' + err.message);
    logger.error(err.stack);
    process.exit(1);
});