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
                        console.log('Database does not exist.');
                    }
                });
            }
        });

        this.db.configure('busyTimeout', 10000);
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

    async insertOrUpdateToken({contractId, tokenId, tokenIndex, owner, metadataURI, metadata, approved, mintRound}) {
        let result = undefined;
        if (metadataURI) {
            result = await this.run(
                `
                UPDATE tokens 
                SET tokenIndex = ?, owner = ?, metadataURI = ?, metadata = ?, approved = ?
                WHERE contractId = ? AND tokenId = ?
                `,
                [tokenIndex, owner, metadataURI, metadata, String(approved), contractId, String(tokenId)]
            );
        }
        else {
            result = await this.run(
                `
                UPDATE tokens 
                SET tokenIndex = ?, owner = ?, approved = ?
                WHERE contractId = ? AND tokenId = ?
                `,
                [tokenIndex, owner, approved, contractId, String(tokenId)]
            );
        }


        if (result.changes === 0) {
            return await this.run(
                `
                INSERT INTO tokens (contractId, tokenId, tokenIndex, owner, metadataURI, metadata, approved, mintRound) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `,
                [contractId, String(tokenId), tokenIndex, owner, metadataURI, metadata, approved, mintRound]
            );
        }

        return result;
    }

    async insertOrUpdateCollection({contractId, totalSupply, createRound, lastSyncRound, creator, globalState}) {
        const result = await this.run(
            `
            UPDATE collections 
            SET totalSupply = ?, lastSyncRound = ?, creator = ?, globalState = ?
            WHERE contractId = ?
            `,
            [Number(totalSupply), lastSyncRound, creator, globalState, contractId]
        );

        if (result.changes === 0) {
            return await this.run(
                `
                INSERT INTO collections (contractId, totalSupply, createRound, lastSyncRound, isBlacklisted, creator, globalState) VALUES (?, ?, ?, ?, ?, ?, ?)
                `,
                [contractId, Number(totalSupply), createRound, lastSyncRound, 0, creator, globalState]
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

    // NOTE: only update mintRound if null
    async updateTokenMintRound(contractId, tokenId, mintRound) {
        return await this.run("UPDATE tokens SET mintRound = ? WHERE contractId = ? AND tokenId = ? AND mintRound IS NULL", [mintRound, contractId, String(tokenId)]);
    }

    async updateTokenOwner(contractId, tokenId, owner) {
        return await this.run("UPDATE tokens SET owner = ? WHERE contractId = ? AND tokenId = ?", [owner, contractId, String(tokenId)]);
    }

    async updateTokenApproved(contractId, tokenId, approved) {
        return await this.run("UPDATE tokens SET approved = ? WHERE contractId = ? AND tokenId = ?", [approved, contractId, String(tokenId)]);
    }

    // marketplace queries
    async marketExists(contractId) {
        const market = await this.get("SELECT mpContractId FROM markets WHERE mpContractId = ?", [contractId]);
        return (market) ? true : false;
    }

    async getMarketLastSync(contractId) {
        const market = await this.get("SELECT lastSyncRound FROM markets WHERE mpContractId = ?", [contractId]);
        return (market) ? market.lastSyncRound : 0;
    }

    async updateMarketLastSync(contractId, lastSyncRound) {
        return await this.run("UPDATE markets SET lastSyncRound = ? WHERE mpContractId = ?", [lastSyncRound, contractId]);
    }

    async getMarkets() {
        return await this.all("SELECT * FROM markets");
    }

    async insertOrUpdateMarket({contractId, escrowAddr, createRound, lastSyncRound, isBlacklisted}) {
        const result = await this.run(
            `
            UPDATE markets
            SET escrowAddr = ?, createRound = ?, lastSyncRound = ?, isBlacklisted = ?
            WHERE mpContractId = ?
            `,
            [escrowAddr, createRound, lastSyncRound, isBlacklisted, contractId]
        );

        if (result.changes === 0) {
            return await this.run(
                `
                INSERT INTO markets (mpContractId, escrowAddr, createRound, lastSyncRound, isBlacklisted) VALUES (?, ?, ?, ?, ?)
                `,
                [contractId, escrowAddr, createRound, lastSyncRound, isBlacklisted]
            );
        }
        return result;
    }

    async insertOrUpdateMarketListing({transactionId, mpContractId, mpListingId, contractId, tokenId, seller, price, currency, createRound, createTimestamp, endTimestamp, royalty, sales_id, delete_id}) {
        const updateSQL = `UPDATE listings
                            SET mpContractId = ?, mpListingId = ?, contractId = ?, tokenId = ?, seller = ?, price = ?, currency = ?, createRound = ?, createTimestamp = ?, endTimestamp = ?, royalty = ?, sales_id = ?, delete_id = ?
                            WHERE transactionId = ?`;
        // console.log(`insertOrUpdateMarketListing updateSQL: ${updateSQL}`);

        const result = await this.run(
            updateSQL,
            [String(mpContractId), String(mpListingId), String(contractId), String(tokenId), seller, price, currency, createRound, createTimestamp, endTimestamp, royalty, sales_id, delete_id, transactionId]
        );
    
        if (result.changes === 0) {
            const insertSQL = `INSERT INTO listings (transactionId, mpContractId, mpListingId, contractId, tokenId, seller, price, currency, createRound, createTimestamp, endTimestamp, royalty, sales_id, delete_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
            // console.log(`insertOrUpdateMarketListing insertSQL: ${insertSQL}`);
            return await this.run(
                insertSQL,
                [transactionId, String(mpContractId), String(mpListingId), String(contractId), String(tokenId), seller, price, currency, createRound, createTimestamp, endTimestamp, royalty, sales_id, delete_id]
            );
        }
        return result;
    }

    async insertOrUpdateMarketSale({transactionId, mpContractId, mpListingId, contractId, tokenId, seller, buyer, currency, price, round, timestamp}) {
        const result = await this.run(
            `
            UPDATE sales
            SET contractId = ?, tokenId = ?, seller = ?, buyer = ?, currency = ?, price = ?, round = ?, timestamp = ?
            WHERE transactionId = ?
            `,
            [contractId, String(tokenId), seller, buyer, String(currency), String(price), Number(round), Number(timestamp), transactionId]
        );

        if (result.changes === 0) {
            return await this.run(
                `
                INSERT INTO sales (transactionId, mpContractId, mpListingId, contractId, tokenId, seller, buyer, currency, price, round, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `,
                [transactionId, String(mpContractId), String(mpListingId), String(contractId), String(tokenId), seller, buyer, String(currency), String(price), Number(round), Number(timestamp)]
            );
        }
        // console.log([transactionId, String(mpContractId), String(mpListingId), String(contractId), String(tokenId), seller, buyer, String(currency), String(price), Number(round), Number(timestamp)]);
        return result;
    }

    async insertOrUpdateMarketDelete({transactionId, mpContractId, mpListingId, contractId, tokenId, owner, round, timestamp}) {
        const result = await this.run(
            `
            UPDATE deletes
            SET contractId = ?, tokenId = ?, owner = ?, round = ?, timestamp = ?
            WHERE transactionId = ?
            `,
            [contractId, String(tokenId), owner, round, timestamp, transactionId]
        );

        if (result.changes === 0) {
            return await this.run(
                `
                INSERT INTO deletes (transactionId, mpContractId, mpListingId, contractId, tokenId, owner, round, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `,
                [transactionId, String(mpContractId), String(mpListingId), String(contractId), String(tokenId), owner, round, timestamp]
            );
        }
        return result;
    }

    // get listing by contractId and listingId
    async getMarketListing(mpContractId, mpListingId) {
        return await this.get("SELECT * FROM listings WHERE mpContractId = ? AND mpListingId = ?", [String(mpContractId), String(mpListingId)]);
    }

    // get sale by mpContractId and mpListingId
    async getMarketSale(mpContractId, mpListingId) {
        return await this.get("SELECT * FROM sales WHERE mpContractId = ? AND mpListingId = ?", [String(mpContractId), String(mpListingId)]);
    }

    // get delete by mpContractId and mpListingId
    async getMarketDelete(mpContractId, mpListingId) {
        return await this.get("SELECT * FROM deletes WHERE mpContractId = ? AND mpListingId = ?", [String(mpContractId), String(mpListingId)]);
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
                lastSyncRound INTEGER,
                isBlacklisted INTEGER,
                creator TEXT,
                globalState TEXT
            )`,
            `
            CREATE TABLE IF NOT EXISTS tokens (
                contractId TEXT,
                tokenId TEXT,
                tokenIndex INTEGER,
                owner TEXT,
                approved TEXT,
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
                amount TEXT,
                timestamp INTEGER,
                FOREIGN KEY (contractId, tokenId) REFERENCES tokens (contractId, tokenId),
                FOREIGN KEY (contractId) REFERENCES collections (contractId)
            )`,
            `
            CREATE TABLE IF NOT EXISTS markets (
                mpContractId TEXT PRIMARY KEY,
                escrowAddr TEXT,
                createRound INTEGER,
                version INTEGER,
                lastSyncRound INTEGER,
                isBlacklisted INTEGER
            )`,
            `
            CREATE TABLE IF NOT EXISTS listings (
                transactionId TEXT PRIMARY KEY,
                mpContractId TEXT,
                mpListingId TEXT,
                contractId TEXT,
                tokenId TEXT,
                seller TEXT,
                price TEXT,
                currency TEXT,
                createRound INTEGER,
                createTimestamp INTEGER,
                endTimestamp INTEGER,
                royalty TEXT,
                sales_id TEXT,
                delete_id TEXT,
                FOREIGN KEY (mpContractId) REFERENCES markets (mpContractId),
                FOREIGN KEY (contractId, tokenId) REFERENCES tokens (contractId, tokenId),
                FOREIGN KEY (contractId) REFERENCES collections (contractId),
                FOREIGN KEY (sales_id) REFERENCES sales (transactionId),
                FOREIGN KEY (delete_id) REFERENCES deletes (transactionId)
            )`,
            `
            CREATE TABLE IF NOT EXISTS sales (
                transactionId TEXT PRIMARY KEY,
                mpContractId TEXT,
                mpListingId TEXT,
                contractId TEXT,
                tokenId TEXT,
                seller TEXT,
                buyer TEXT,
                currency TEXT,
                price TEXT,
                round INTEGER,
                timestamp INTEGER,
                FOREIGN KEY (mpContractId) REFERENCES markets (mpContractId),
                FOREIGN KEY (contractId, tokenId) REFERENCES tokens (contractId, tokenId),
                FOREIGN KEY (contractId) REFERENCES collections (contractId)
            )`,
            `
            CREATE TABLE IF NOT EXISTS deletes (
                transactionId TEXT PRIMARY KEY,
                mpContractId TEXT,
                mpListingId TEXT,
                contractId TEXT,
                tokenId TEXT,
                owner TEXT,
                round INTEGER,
                timestamp INTEGER,
                FOREIGN KEY (mpContractId) REFERENCES markets (mpContractId),
                FOREIGN KEY (contractId, tokenId) REFERENCES tokens (contractId, tokenId),
                FOREIGN KEY (contractId) REFERENCES collections (contractId)
            )`,
        ];

        for (let table of tables) {
            await this.run(table);
        }
    }
}

/*
-- /markets
CREATE INDEX idx_markets_createRound ON markets(createRound);
CREATE INDEX idx_markets_version ON markets(version);
CREATE INDEX idx_markets_escrowAddr ON markets(escrowAddr);

-- /listings
CREATE INDEX idx_listings_contractId ON listings(contractId);
CREATE INDEX idx_listings_seller ON listings(seller);
CREATE INDEX idx_listings_price ON listings(price);
CREATE INDEX idx_listings_currency ON listings(currency);
CREATE INDEX idx_listings_createRound ON listings(createRound);
CREATE INDEX idx_listings_sales_id ON listings(sales_id);
CREATE INDEX idx_listings_delete_id ON listings(delete_id);
CREATE INDEX idx_listings_createTimestamp ON listings(createTimestamp);

-- sales
CREATE INDEX idx_sales_transactionId ON sales(transactionId);
CREATE INDEX idx_sales_contractId ON sales(contractId);
CREATE INDEX idx_sales_buyer ON sales(buyer);
CREATE INDEX idx_sales_currency ON sales(currency);
CREATE INDEX idx_sales_price ON sales(price);
CREATE INDEX idx_sales_round ON sales(round);
CREATE INDEX idx_sales_timestamp ON sales(timestamp);

-- /deletes
CREATE INDEX idx_deletes_transactionId ON deletes(transactionId);
CREATE INDEX idx_deletes_contractId ON deletes(contractId);
CREATE INDEX idx_deletes_owner ON deletes(owner);
CREATE INDEX idx_deletes_round ON deletes(round);
CREATE INDEX idx_deletes_timestamp ON deletes(timestamp);

-- /collections
CREATE INDEX idx_collections_createRound ON collections(createRound);
CREATE INDEX idx_collections_creator ON collections(creator);

-- / tokens
CREATE INDEX idx_tokens_contractId ON tokens(contractId, tokenId);
CREATE INDEX idx_tokens_owner ON tokens(owner);
CREATE INDEX idx_tokens_approved ON tokens(approved);
CREATE INDEX idx_tokens_mintRound ON tokens(mintRound);


*/