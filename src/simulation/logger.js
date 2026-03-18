'use strict';

const chalk = require('chalk');

const COLORS = {
    INIT: chalk.cyan,
    TLS: chalk.magenta,
    SEND: chalk.yellow,
    RECV: chalk.green,
    ROUTE: chalk.blue,
    PKT: chalk.white,
    HOP: chalk.gray,
    CRYPTO: chalk.magentaBright,
    ERROR: chalk.red,
    SUCCESS: chalk.greenBright,
    STAT: chalk.cyanBright,
    SECTION: chalk.bold.whiteBright,
};

const ICONS = {
    ok: chalk.green('✓'),
    fail: chalk.red('✗'),
    arrow: chalk.gray('→'),
    lock: chalk.yellow('🔒'),
    unlock: chalk.yellow('🔓'),
    packet: chalk.blue('📦'),
    hop: chalk.gray('⟶'),
    warn: chalk.yellow('⚠'),
    info: chalk.cyan('ℹ'),
};

function timestamp() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    const ms = String(now.getMilliseconds()).padStart(3, '0');
    return chalk.dim(`[${h}:${m}:${s}.${ms}]`);
}

function tag(category) {
    const color = COLORS[category] || chalk.white;
    return color(`[${category.padEnd(6)}]`);
}

class Logger {
    constructor(options = {}) {
        this.silent = options.silent || false;
        this.noTime = options.noTime || false;
        this._startTime = Date.now();
    }

    resetTimer() {
        this._startTime = Date.now();
    }

    elapsed() {
        return Date.now() - this._startTime;
    }

    _print(category, message) {
        if (this.silent) return;
        const ts = this.noTime ? '' : timestamp() + ' ';
        console.log(`${ts}${tag(category)} ${message}`);
    }

    init(msg)    { this._print('INIT',    chalk.cyan(msg)); }
    tls(msg)     { this._print('TLS',     chalk.magenta(msg)); }
    send(msg)    { this._print('SEND',    chalk.yellow(msg)); }
    recv(msg)    { this._print('RECV',    chalk.green(msg)); }
    route(msg)   { this._print('ROUTE',   chalk.blue(msg)); }
    packet(msg)  { this._print('PKT',     chalk.white(msg)); }
    hop(msg)     { this._print('HOP',     chalk.gray(msg)); }
    crypto(msg)  { this._print('CRYPTO',  chalk.magentaBright(msg)); }
    error(msg)   { this._print('ERROR',   chalk.red(msg)); }
    success(msg) { this._print('SUCCESS', chalk.greenBright(msg)); }
    stat(msg)    { this._print('STAT',    chalk.cyanBright(msg)); }

    section(title) {
        if (this.silent) return;
        console.log(chalk.bold.whiteBright(`\n ${title}`));
        console.log('');
    }

    stats(data) {
        if (this.silent) return;
        const line = '═'.repeat(50);
        console.log('');
        console.log(chalk.bold.cyanBright(`╔${line}╗`));
        console.log(chalk.bold.cyanBright(`║${'  simulation statistics'.padEnd(50)}║`));
        console.log(chalk.bold.cyanBright(`╠${line}╣`));
        for (const [key, val] of Object.entries(data)) {
            const row = `  ${key}: ${val}`.padEnd(50);
            console.log(chalk.cyanBright(`║${row}║`));
        }
        console.log(chalk.bold.cyanBright(`╚${line}╝`));
        console.log('');
    }

    routePath(path) {
        return path.map(n => chalk.bold.yellow(`Node${n}`)).join(chalk.gray(' → '));
    }

    ok()   { return ICONS.ok; }
    fail() { return ICONS.fail; }
}

const logger = new Logger();

module.exports = { Logger, logger, ICONS };