import sqlite3 from 'sqlite3';

export default class Database {
    db;

    constructor(dbFilePath) {
        this.db = new sqlite3.Database(dbFilePath, (err) => {
            if (err) {
                console.log('Could not connect to database', err);
            } else {
                console.log('Connected to database');
                this.db.get("SELECT value FROM info WHERE key='syncRound'", (err, row) => {
                    if (err || !row) {
                        console.log('Database is new, initializing...');
                        this.initDB();
                    }
                });
            }
        });
    }

    run(query, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(query, params, function (err) {
                if (err) {
                    console.log('Error running sql ' + query);
                    console.log(err);
                    reject(err);
                } else {
                    resolve(this);
                    //resolve({ id: this.lastID });
                }
            });
        });
    }

    get(query, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(query, params, (err, result) => {
                if (err) {
                    console.log('Error running sql: ' + query);
                    console.log(err);
                    reject(err);
                } else {
                    resolve(result);
                }
            });
        });
    }

    all(query, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(query, params, (err, rows) => {
                if (err) {
                    console.log('Error running sql: ' + query);
                    console.log(err);
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    close() {
        return new Promise((resolve, reject) => {
            this.db.close((err) => {
                if (err) {
                    console.log('error during database connection close', err);
                    reject(err);
                } else {
                    console.log('Database connection closed');
                    resolve();
                }
            });
        });
    }

    async getInfo(key) {
        return await this.get(
            `
            SELECT value FROM info WHERE key = ?
            `,
            [key]
        );
    }

    async setInfo(key, value) {
        return await this.run(
            `
            INSERT OR REPLACE INTO info (key, value) VALUES (?, ?)
            `,
            [key, value]
        );
    }

    async getCollections() {
        return await this.all("SELECT * FROM collections");
    }

    async insertOrUpdateToken({contractId, tokenId, tokenIndex, owner, metadataURI, metadata}) {
        const result = await this.run(
            `
            UPDATE tokens 
            SET tokenIndex = ?, owner = ?, metadataURI = ?, metadata = ?
            WHERE contractId = ? AND tokenId = ?
            `,
            [tokenIndex, owner, metadataURI, metadata, contractId, String(tokenId)]
        );

        if (result.changes === 0) {
            return await this.run(
                `
                INSERT INTO tokens (contractId, tokenId, tokenIndex, owner, metadataURI, metadata) VALUES (?, ?, ?, ?, ?, ?)
                `,
                [contractId, String(tokenId), tokenIndex, owner, metadataURI, metadata]
            );
        }

        return result;
    }

    async insertOrUpdateCollection({contractId, totalSupply, createRound, lastSyncRound}) {
        const result = await this.run(
            `
            UPDATE collections 
            SET totalSupply = ?, lastSyncRound = ?
            WHERE contractId = ?
            `,
            [Number(totalSupply), lastSyncRound, contractId]
        );

        if (result.changes === 0) {
            return await this.run(
                `
                INSERT INTO collections (contractId, totalSupply, createRound, lastSyncRound) VALUES (?, ?, ?, ?)
                `,
                [contractId, Number(totalSupply), createRound, lastSyncRound]
            );
        }
        return result;
    }

    async collectionExists(contractId) {
        const collection = await this.get("SELECT contractId FROM collections WHERE contractId = ?", [contractId]);
        return (collection) ? true : false;
    }

    async getCollectionLastSync(contractId) {
        const collection = await this.get("SELECT lastSyncRound FROM collections WHERE contractId = ?", [contractId]);
        return (collection) ? collection.lastSyncRound : 0;
    }

    async updateCollectionLastSync(contractId, lastSyncRound) {
        return await this.run("UPDATE collections SET lastSyncRound = ? WHERE contractId = ?", [lastSyncRound, contractId]);
    }

    async updateCollectionTotalSupply(contractId, totalSupply) {
        return await this.run("UPDATE collections SET totalSupply = ? WHERE contractId = ?", [Number(totalSupply), contractId]);
    }

    async updateCollectionCreateRound(contractId, createRound) {
        return await this.run("UPDATE collections SET createRound = ? WHERE contractId = ?", [createRound, contractId]);
    }

    async insertTransaction({transactionId, contractId, tokenId, round, fromAddr, toAddr, timestamp}) {
        return await this.run("INSERT OR IGNORE INTO transfers (transactionId, contractId, tokenId, round, fromAddr, toAddr, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)", [transactionId, contractId, String(tokenId), round, fromAddr, toAddr, timestamp]);
    }

    async updateTokenMintRound(contractId, tokenId, mintRound) {
        return await this.run("UPDATE tokens SET mintRound = ? WHERE contractId = ? AND tokenId = ?", [mintRound, contractId, String(tokenId)]);
    }

    async updateTokenOwner(contractId, tokenId, owner) {
        return await this.run("UPDATE tokens SET owner = ? WHERE contractId = ? AND tokenId = ?", [owner, contractId, String(tokenId)]);
    }

    async initDB() {
        const tables = [
            `
            CREATE TABLE IF NOT EXISTS info (
                key TEXT PRIMARY KEY,
                value TEXT
            )`,
            `
            CREATE TABLE IF NOT EXISTS collections (
                contractId TEXT PRIMARY KEY,
                createRound INTEGER,
                totalSupply INTEGER,
                lastSyncRound INTEGER
            )`,
            `
            CREATE TABLE IF NOT EXISTS tokens (
                contractId TEXT,
                tokenId TEXT,
                tokenIndex INTEGER,
                owner TEXT,
                metadataURI TEXT,
                mintRound INTEGER,
                metadata BLOB,
                PRIMARY KEY (contractId, tokenId)
            )`,
            `
            CREATE TABLE IF NOT EXISTS transfers (
                transactionId TEXT PRIMARY KEY,
                contractId TEXT,
                tokenId TEXT,
                round INTEGER,
                fromAddr TEXT,
                toAddr TEXT,
                timestamp INTEGER,
                FOREIGN KEY (contractId, tokenId) REFERENCES tokens (contractId, tokenId),
                FOREIGN KEY (contractId) REFERENCES collections (contractId)
            )`
        ];

        for (let table of tables) {
            await this.run(table);
        }
    }
}