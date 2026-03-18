'use strict';

const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;

class SessionCipherError extends Error {
    constructor(msg) { super(msg); this.name = 'SessionCipherError'; }
}

class SessionCipher {
    constructor(sessionKey) {
        if (!sessionKey) throw new SessionCipherError('sessionkey is required');
        this._key = Buffer.isBuffer(sessionKey)
            ? sessionKey
            : Buffer.from(sessionKey, 'hex');
        if (this._key.length !== KEY_LEN) {
            throw new SessionCipherError(
                `sessionkey must be ${KEY_LEN} bytes, got ${this._key.length}`
            );
        }
        this._encryptCount = 0;
        this._decryptCount = 0;
    }

    encrypt(plaintext) {
        const iv = crypto.randomBytes(IV_LEN);
        const buf = Buffer.isBuffer(plaintext)
            ? plaintext
            : Buffer.from(String(plaintext), 'utf8');
        const cipher = crypto.createCipheriv(ALGO, this._key, iv);
        const encrypted = Buffer.concat([cipher.update(buf), cipher.final()]);
        const tag = cipher.getAuthTag();
        this._encryptCount++;
        return Buffer.concat([iv, tag, encrypted]);
    }

    decrypt(ciphertext) {
        if (!Buffer.isBuffer(ciphertext) || ciphertext.length < IV_LEN + TAG_LEN) {
            throw new SessionCipherError('invalid ciphertext: too short');
        }
        const iv = ciphertext.slice(0, IV_LEN);
        const tag = ciphertext.slice(IV_LEN, IV_LEN + TAG_LEN);
        const encrypted = ciphertext.slice(IV_LEN + TAG_LEN);
        const decipher = crypto.createDecipheriv(ALGO, this._key, iv);
        decipher.setAuthTag(tag);
        try {
            const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
            this._decryptCount++;
            return decrypted;
        } catch (e) {
            throw new SessionCipherError(`decryption failed (auth tag mismatch?): ${e.message}`);
        }
    }

    get keyShort() {
        return this._key.toString('hex').slice(0, 16) + '...';
    }

    get stats() {
        return { encrypted: this._encryptCount, decrypted: this._decryptCount };
    }

    toString() {
        return `SessionCipher(algo=${ALGO}, key=${this.keyShort})`;
    }
}

function deriveSessionKey(clientRandom, serverRandom, preMasterSecret) {
    const ikm = Buffer.isBuffer(preMasterSecret)
        ? preMasterSecret
        : Buffer.from(preMasterSecret, 'hex');
    const salt = Buffer.from(clientRandom + serverRandom, 'hex');
    const prk = crypto.createHmac('sha256', salt).update(ikm).digest();
    const info = Buffer.from('hypercube-session-key-v1', 'utf8');
    const counter = Buffer.from([0x01]);
    const okm = crypto
        .createHmac('sha256', prk)
        .update(Buffer.concat([info, counter]))
        .digest();
    return okm;
}

function computeFinishedMAC(sessionKey, label, handshakeMessages) {
    const keyBuf = Buffer.isBuffer(sessionKey)
        ? sessionKey
        : Buffer.from(sessionKey, 'hex');
    const data = Buffer.from(label + ':' + handshakeMessages, 'utf8');
    return crypto.createHmac('sha256', keyBuf).update(data).digest('hex');
}

module.exports = {
    SessionCipher,
    SessionCipherError,
    deriveSessionKey,
    computeFinishedMAC,
    ALGO,
    IV_LEN,
    TAG_LEN,
    KEY_LEN,
};