'use strict';

const { KeyPair, createKeyPair } = require('./KeyPair');
const { SessionCipher, deriveSessionKey, computeFinishedMAC } = require('./SessionCipher');
const { logger } = require('../simulation/logger');

const HandshakeState = Object.freeze({
    IDLE:             'IDLE',
    CLIENT_HELLO_SENT:'CLIENT_HELLO_SENT',
    SERVER_HELLO_SENT:'SERVER_HELLO_SENT',
    PRE_MASTER_SENT:  'PRE_MASTER_SENT',
    KEYS_DERIVED:     'KEYS_DERIVED',
    CLIENT_FINISHED:  'CLIENT_FINISHED',
    SERVER_FINISHED:  'SERVER_FINISHED',
    DONE:             'DONE',
    ERROR:            'ERROR',
});

class HandshakeError extends Error {
    constructor(msg) { super(msg); this.name = 'HandshakeError'; }
}

class TLSHandshake {
    constructor(clientId, serverId, options = {}) {
        this.clientId = clientId;
        this.serverId = serverId;
        this.verbose = options.verbose !== undefined ? options.verbose : true;
        this.rsaBits = options.rsaBits || 2048;
        this.state = HandshakeState.IDLE;
        this._clientRandom = null;
        this._serverRandom = null;
        this._serverKeyPair = null;
        this._preMasterSecret = null;
        this._sessionKey = null;
        this._clientFinishedMAC = null;
        this._serverFinishedMAC = null;
        this._hsLog = [];
        this.clientCipher = null;
        this.serverCipher = null;
        this._startTime = null;
        this._duration = null;
    }

    perform() {
        this._startTime = Date.now();
        try {
            this._step1_clientHello();
            this._step2_serverHello();
            this._step3_preMasterExchange();
            this._step4_deriveKeys();
            this._step5_clientFinished();
            this._step6_serverFinished();
            this._step7_done();
        } catch (err) {
            this.state = HandshakeState.ERROR;
            logger.error(`[TLS] handshake failed (Node${this.clientId}↔Node${this.serverId}): ${err.message}`);
            throw err;
        }
        this._duration = Date.now() - this._startTime;
        return {
            clientCipher: this.clientCipher,
            serverCipher: this.serverCipher,
            sessionKeyHex: this._sessionKey.toString('hex'),
            durationMs: this._duration,
        };
    }

    _step1_clientHello() {
        this._clientRandom = KeyPair.generateRandom(32);
        this._hsLog.push(`CLIENT_HELLO:${this._clientRandom}`);
        if (this.verbose) {
            logger.tls(
                `Node${this.clientId} → Node${this.serverId} : ` +
                `ClientHello random=${this._clientRandom.slice(0, 16)}...`
            );
        }
        this.state = HandshakeState.CLIENT_HELLO_SENT;
    }

    _step2_serverHello() {
        this._serverRandom = KeyPair.generateRandom(32);
        this._serverKeyPair = createKeyPair(this.serverId, this.rsaBits);
        this._hsLog.push(`SERVER_HELLO:${this._serverRandom}`);
        this._hsLog.push(`SERVER_PUBKEY:${this._serverKeyPair.publicKeyShort}`);
        if (this.verbose) {
            logger.tls(
                `Node${this.serverId} → Node${this.clientId} : ` +
                `ServerHello random=${this._serverRandom.slice(0, 16)}...`
            );
            logger.tls(
                `Node${this.serverId} → Node${this.clientId} : ` +
                `PublicKey ${this._serverKeyPair.publicKeyShort}`
            );
        }
        this.state = HandshakeState.SERVER_HELLO_SENT;
    }

    _step3_preMasterExchange() {
        this._preMasterSecret = KeyPair.generatePreMasterSecret();
        const encrypted = this._serverKeyPair.encrypt(
            this._preMasterSecret,
            this._serverKeyPair.publicKey
        );
        this._hsLog.push(`PRE_MASTER:${this._preMasterSecret.toString('hex').slice(0, 16)}...`);
        if (this.verbose) {
            logger.tls(
                `Node${this.clientId} → Node${this.serverId} : ` +
                `PreMasterSecret (encrypted rsa, ${encrypted.length}b)`
            );
            logger.crypto(
                `Node${this.serverId} : decrypting premastersecret with private key...`
            );
        }
        const decrypted = this._serverKeyPair.decrypt(encrypted);
        if (!decrypted.equals(this._preMasterSecret)) {
            throw new HandshakeError('premastersecret decryption mismatch!');
        }
        if (this.verbose) {
            logger.crypto(`Node${this.serverId} : premastersecret decrypted ✓`);
        }
        this.state = HandshakeState.PRE_MASTER_SENT;
    }

    _step4_deriveKeys() {
        this._sessionKey = deriveSessionKey(
            this._clientRandom,
            this._serverRandom,
            this._preMasterSecret
        );
        if (this.verbose) {
            logger.crypto(
                `Node${this.clientId} + Node${this.serverId} : ` +
                `sessionkey derived (hkdf-sha256): ${this._sessionKey.toString('hex').slice(0, 16)}...`
            );
        }
        this.state = HandshakeState.KEYS_DERIVED;
    }

    _step5_clientFinished() {
        const mac = computeFinishedMAC(
            this._sessionKey,
            `client_finished:${this.clientId}→${this.serverId}`,
            this._hsLog.join('|')
        );
        this._clientFinishedMAC = mac;
        if (this.verbose) {
            logger.tls(
                `Node${this.clientId} → Node${this.serverId} : ` +
                `finished (encrypted sessionkey) mac=${mac.slice(0, 16)}...`
            );
        }
        this.state = HandshakeState.CLIENT_FINISHED;
    }

    _step6_serverFinished() {
        const mac = computeFinishedMAC(
            this._sessionKey,
            `server_finished:${this.serverId}→${this.clientId}`,
            this._hsLog.join('|')
        );
        this._serverFinishedMAC = mac;
        if (this.verbose) {
            logger.tls(
                `Node${this.serverId} → Node${this.clientId} : ` +
                `finished (encrypted sessionkey) mac=${mac.slice(0, 16)}...`
            );
        }
        this.state = HandshakeState.SERVER_FINISHED;
    }

    _step7_done() {
        this.clientCipher = new SessionCipher(this._sessionKey);
        this.serverCipher = new SessionCipher(this._sessionKey);
        this.state = HandshakeState.DONE;
        if (this.verbose) {
            logger.success(
                `tls handshake done node${this.clientId} ↔ node${this.serverId} ` +
                `sessionkey=${this._sessionKey.toString('hex').slice(0, 16)}... ` +
                `(${Date.now() - this._startTime}ms)`
            );
        }
    }

    get sessionKeyHex() {
        return this._sessionKey ? this._sessionKey.toString('hex') : null;
    }

    get isDone()  { return this.state === HandshakeState.DONE; }
    get isError() { return this.state === HandshakeState.ERROR; }

    toString() {
        return `TLSHandshake(${this.clientId}↔${this.serverId}, state=${this.state})`;
    }
}

module.exports = { TLSHandshake, HandshakeError, HandshakeState };