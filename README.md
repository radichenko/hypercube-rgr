# РГР з дицсципліни "Системи безпеки програм і даних"

Розподілена система гіперкуб на 8 нод з передачею даних та обмеженням на розмір пакету

## Usage

```bash
git clone https://github.com/radichenko/hypercube-rgr.git

cd hypercube-rgr

npm install

npm start
```

## Project Structure

```
src/
├── core/
│   ├── Packet.js          # Packet structure, fragmentation, reassembly
│   ├── Router.js          # XOR routing, routing table, adjacency matrix
│   ├── Hypercube.js       # Topology manager (8 nodes, 12 edges)
│   └── Node.js            # Network node - channels, inbox, decryption
├── crypto/
│   ├── KeyPair.js         # RSA-2048 key generation, encrypt/decrypt, sign
│   ├── SessionCipher.js   # Encryption + HKDF key derivation
│   └── TLSHandshake.js    # TLS handshake simulation + session cache
├── network/
│   ├── Channel.js         # Physical link with packet size limit and delay
│   └── MessageBroker.js   # Central dispatcher — send, broadcast, stats
└── simulation/
    ├── logger.js           # Colored console output
    ├── scenarios.js        # Demo scenarios
    └── index.js            # Entry point, interactive menu
```