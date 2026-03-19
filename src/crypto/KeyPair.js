'use strict';

const crypto = require('crypto');

class KeyPairError extends Error {
    constructor(msg) { super(msg); this.name = 'KeyPairError'; }
}

class KeyPair {
    constructor(options = {}) {
        this.modulusLength = options.modulusLength || 2048;
        this._publicKey = null;
        this._privateKey = null;
        this._generated = false;
        this.nodeId = options.nodeId !== undefined ? options.nodeId : null;
    }

    generate() {
        const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
            modulusLength: this.modulusLength,
            publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
        });
        this._publicKey = publicKey;
        this._privateKey = privateKey;
        this._generated = true;
        return this;
    }

    get publicKey() {
        this._assertGenerated();
        return this._publicKey;
    }

    get privateKey() {
        this._assertGenerated();
        return this._privateKey;
    }

    get isGenerated() { return this._generated; }

    get publicKeyShort() {
        if (!this._generated) return '(none)';
        const body = this._publicKey
            .replace(/-----[^-]+-----/g, '')
            .replace(/\s/g, '');
        return body.slice(0, 16) + '...';
    }

    encrypt(data, externalPublicKey) {
        const key = externalPublicKey || this._publicKey;
        if (!key) throw new KeyPairError('no public key available for encryption');
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
        return crypto.publicEncrypt(
            { key, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING },
            buf
        );
    }

    decrypt(encryptedData) {
        this._assertGenerated();
        return crypto.privateDecrypt(
            { key: this._privateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING },
            encryptedData
        );
    }

    sign(data) {
        this._assertGenerated();
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
        return crypto.sign('sha256', buf, this._privateKey);
    }

    verify(data, signature, externalPublicKey) {
        const key = externalPublicKey || this._publicKey;
        if (!key) throw new KeyPairError('no public key available for verification');
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
        return crypto.verify('sha256', buf, key, signature);
    }

    static generateRandom(bytes = 32) {
        return crypto.randomBytes(bytes).toString('hex');
    }

    static generatePreMasterSecret() {
        return crypto.randomBytes(48);
    }

    _assertGenerated() {
        if (!this._generated) {
            throw new KeyPairError('keypair not generated yet. call .generate() first.');
        }
    }

    toString() {
        return `KeyPair(node=${this.nodeId}, bits=${this.modulusLength}, `
            + `generated=${this._generated}, pub=${this.publicKeyShort})`;
    }
}

function createKeyPair(nodeId, modulusLength = 2048) {
    return new KeyPair({ nodeId, modulusLength }).generate();
}

module.exports = { KeyPair, KeyPairError, createKeyPair };