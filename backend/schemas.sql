------------------------------------------
-- Base Tables
------------------------------------------

CREATE TABLE IF NOT EXISTS info (
    key TEXT PRIMARY KEY,
    value TEXT
);

------------------------------------------
-- ARC-0072 Tables
------------------------------------------

CREATE TABLE IF NOT EXISTS collections (
    contractId TEXT PRIMARY KEY,
    createRound INTEGER,
    totalSupply INTEGER,
    lastSyncRound INTEGER,
    isBlacklisted INTEGER,
    creator TEXT,
    globalState TEXT
);

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
);

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
);

------------------------------------------
-- ARC-0072 Indexes
------------------------------------------

-- /collections
CREATE INDEX IF NOT EXISTS idx_collections_createRound ON collections(createRound);
CREATE INDEX IF NOT EXISTS idx_collections_creator ON collections(creator);

-- / tokens
CREATE INDEX IF NOT EXISTS idx_tokens_contractId ON tokens(contractId, tokenId);
CREATE INDEX IF NOT EXISTS idx_tokens_owner ON tokens(owner);
CREATE INDEX IF NOT EXISTS idx_tokens_approved ON tokens(approved);
CREATE INDEX IF NOT EXISTS idx_tokens_mintRound ON tokens(mintRound);

------------------------------------------
-- Marketplace Tables
------------------------------------------

CREATE TABLE IF NOT EXISTS markets (
    mpContractId TEXT PRIMARY KEY,
    escrowAddr TEXT,
    createRound INTEGER,
    version INTEGER,
    lastSyncRound INTEGER,
    isBlacklisted INTEGER
);

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
);

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
);

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
);

------------------------------------------
-- Marketplace Indexes
------------------------------------------

-- /markets
CREATE INDEX IF NOT EXISTS idx_markets_createRound ON markets(createRound);
CREATE INDEX IF NOT EXISTS idx_markets_version ON markets(version);
CREATE INDEX IF NOT EXISTS idx_markets_escrowAddr ON markets(escrowAddr);

-- /listings
CREATE INDEX IF NOT EXISTS idx_listings_contractId ON listings(contractId);
CREATE INDEX IF NOT EXISTS idx_listings_seller ON listings(seller);
CREATE INDEX IF NOT EXISTS idx_listings_price ON listings(price);
CREATE INDEX IF NOT EXISTS idx_listings_currency ON listings(currency);
CREATE INDEX IF NOT EXISTS idx_listings_createRound ON listings(createRound);
CREATE INDEX IF NOT EXISTS idx_listings_sales_id ON listings(sales_id);
CREATE INDEX IF NOT EXISTS idx_listings_delete_id ON listings(delete_id);
CREATE INDEX IF NOT EXISTS idx_listings_createTimestamp ON listings(createTimestamp);

-- sales
CREATE INDEX IF NOT EXISTS idx_sales_transactionId ON sales(transactionId);
CREATE INDEX IF NOT EXISTS idx_sales_contractId ON sales(contractId);
CREATE INDEX IF NOT EXISTS idx_sales_buyer ON sales(buyer);
CREATE INDEX IF NOT EXISTS idx_sales_currency ON sales(currency);
CREATE INDEX IF NOT EXISTS idx_sales_price ON sales(price);
CREATE INDEX IF NOT EXISTS idx_sales_round ON sales(round);
CREATE INDEX IF NOT EXISTS idx_sales_timestamp ON sales(timestamp);

-- /deletes
CREATE INDEX IF NOT EXISTS idx_deletes_transactionId ON deletes(transactionId);
CREATE INDEX IF NOT EXISTS idx_deletes_contractId ON deletes(contractId);
CREATE INDEX IF NOT EXISTS idx_deletes_owner ON deletes(owner);
CREATE INDEX IF NOT EXISTS idx_deletes_round ON deletes(round);
CREATE INDEX IF NOT EXISTS idx_deletes_timestamp ON deletes(timestamp);

------------------------------------------
-- ARC-0200 Contract Tables
------------------------------------------
/*
-- contract metadata for arc-0200 contracts
CREATE TABLE contracts_0200 (
    contractId TEXT,
    name TEXT,
    symbol TEXT,
    decimals INTEGER,
    totalSupply TEXT,
    minter TEXT,
    metadata BLOB,
    PRIMARY KEY (contractId, tokenId)
);

-- map of account balances for arc-0200 contracts
CREATE TABLE accounts_0200 {
    accountId TEXT,
    contractId TEXT,
    tokenId TEXT,
    balance TEXT,
    PRIMARY KEY (accountId, contractId, tokenId)
};

-- transfer history for arc-0200 contracts
CREATE TABLE transfers_0200 {
    transactionId TEXT,
    contractId TEXT,
    tokenId TEXT,
    from TEXT,
    to TEXT,
    amount TEXT,
    timestamp TEXT,
    PRIMARY KEY (transferId)
};

-- approval history for arc-0200 contracts
CREATE TABLE approvals_0200 {
    transactionId TEXT,
    contractId TEXT,
    tokenId TEXT,
    owner TEXT,
    approved TEXT,
    timestamp TEXT,
    PRIMARY KEY (transactionId)
};
*/
-- Path: backend/schemas.sql
