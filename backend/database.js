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

    // ARC-0072

    async getCollections() {
        return await this.all("SELECT * FROM collections");
    }

    async insertOrUpdateToken({ contractId, tokenId, tokenIndex, owner, metadataURI, metadata, approved, mintRound }) {
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

    async insertOrUpdateCollection({ contractId, totalSupply, createRound, lastSyncRound, creator, globalState }) {
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

    async insertTransaction({ transactionId, contractId, tokenId, round, fromAddr, toAddr, timestamp }) {
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


    // SCS

    async getPhaseISCSs() {
        const stake = await this.all(`
SELECT global_owner, contractId, contractAddress,  global_period, global_initial, global_period_seconds, global_vesting_delay, global_lockup_delay, global_distribution_count, global_distribution_seconds
FROM contract_scsc
WHERE TRUE 
AND global_initial != '0'
AND global_funder = '62TIVJSZOS4DRSSYYDDZELQAGFYQC5JWKCHRBPPYKTZN2OOOXTGLB5ZJ4E'
AND global_parent_id = 5211;
`);
	return stake;
    }

    async getPhaseIISCSs() {
        const stake = await this.all(`
SELECT global_owner, contractId, contractAddress,  global_period, global_initial, global_period_seconds, global_vesting_delay, global_lockup_delay, global_distribution_count, global_distribution_seconds
FROM contract_scsc 
WHERE TRUE 
AND global_initial = '0'
AND global_funder = '62TIVJSZOS4DRSSYYDDZELQAGFYQC5JWKCHRBPPYKTZN2OOOXTGLB5ZJ4E'
AND global_parent_id = 5211;
`);
        return stake;
    }

    async getSCSs() {
        const stake = await this.all("SELECT * FROM contract_scsc");
        return stake
    }

    async getSCSsById(contractId) {
        const stake = await this.all("SELECT * FROM contract_scsc WHERE contractId = ?", [contractId]);
        return stake
    }

    async getSCSById(contractId) {
        const stake = await this.get("SELECT * FROM contract_scsc WHERE contractId = ?", [contractId]);
        return stake
    }

    async scsExists(contractId) {
        const stake = await this.get("SELECT contractId FROM contract_scsc WHERE contractId = ?", [contractId]);
        return (stake) ? true : false;
    }

    async getSCSLastSync(contractId) {
        const stake = await this.get("SELECT lastSyncRound FROM contract_scsc WHERE contractId = ?", [contractId]);
        return (stake) ? stake.lastSyncRound : 0;
    }

    async updateSCSLastSync(contractId, lastSyncRound) {
        return await this.run("UPDATE contract_scsc SET lastSyncRound = ? WHERE contractId = ?", [lastSyncRound, contractId]);
    }

    async updateSCSPeriod(contractId, period) {
        return await this.run("UPDATE contract_scsc SET global_period = ? WHERE contractId = ?", [period, contractId]);
    }

    async insertOrUpdateSCS({ contractId, contractAddress, creator, createRound, global_funder, global_funding, global_owner, global_period, global_total, global_period_seconds, global_lockup_delay, global_vesting_delay, global_period_limit, part_vote_k, part_sel_k, part_vote_fst, part_vote_lst, part_vote_kd, part_sp_key, deleted, global_parent_id, global_messenger_id, global_delegate, global_deadline, global_initial, global_deployer, global_distribution_count, global_distribution_seconds }) {
        const result = await this.run(
            `
            UPDATE contract_scsc
            SET global_funder = ?, global_funding = ?, global_owner = ?, global_period = ?, global_total = ?, 
	    	part_vote_k = ?, part_sel_k = ?, part_vote_fst = ?, part_vote_lst = ?, part_vote_kd = ?, part_sp_key = ?, 
		deleted = ?, global_delegate = ?, global_deadline = ?, global_initial = ?, global_deployer = ?,
		global_vesting_delay = ?, global_distribution_count = ?, global_period_seconds = ?, global_lockup_delay = ?,
		global_period_limit = ?, global_distribution_seconds = ?, global_messenger_id = ?
            WHERE contractId = ?
            `,
            [	
		global_funder, global_funding, global_owner, global_period, global_total,
 		part_vote_k, part_sel_k, part_vote_fst, part_vote_lst, part_vote_kd, part_sp_key, 
		deleted, global_delegate, global_deadline, global_initial, global_deployer, 
		global_vesting_delay, global_distribution_count, global_period_seconds, global_lockup_delay,global_period_limit, global_distribution_seconds,
		global_messenger_id,
	     	contractId
	    ]
        );

        if (result.changes === 0) {                                
	    console.log("NEW");
            return await this.run(                                                                       
                `
                INSERT INTO contract_scsc (contractId, contractAddress, creator, createRound, global_period_seconds, global_lockup_delay, global_vesting_delay, global_period_limit, global_parent_id, global_messenger_id, global_distribution_count, global_distribution_seconds) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `,                                                                                       
                [contractId, contractAddress, creator, createRound, global_period_seconds, global_lockup_delay, global_vesting_delay, global_period_limit, global_parent_id, global_messenger_id, global_distribution_count, global_distribution_seconds]
            );
        }
        return result;
    }

    // Stake

    async stakeExists(contractId) {
	const stake = await this.get("SELECT contractId FROM stake_contracts WHERE contractId = ?", [contractId]);
        return (stake) ? true : false;
    }

    async getStakeLastSync(contractId) {
        const stake = await this.get("SELECT lastSyncRound FROM stake_contracts WHERE contractId = ?", [contractId]);
        return (stake) ? stake.lastSyncRound : 0; 
    }   

    async updateStakeLastSync(contractId, lastSyncRound) {
        return await this.run("UPDATE stake_contracts SET lastSyncRound = ? WHERE contractId = ?", [lastSyncRound, contractId]);
    }


    async getStakePool(contractId, poolId) {
	return await this.get(`
SELECT 
    sp.contractId,
    sp.poolId,
    sp.poolProviderAddress,
    sp.poolStakeTokenId,
    sp.poolStakedAmount,
    sp.poolStart,
    sp.poolEnd,
    GROUP_CONCAT(sr.rewardTokenId, ', ') AS rewardTokenIds,
    GROUP_CONCAT(sr.rewardAmount, ', ') AS rewardAmounts,
    GROUP_CONCAT(sr.rewardRemaining, ', ') AS rewardRemainings
FROM 
    stake_pools sp
INNER JOIN 
    stake_rewards sr
ON 
    sp.contractId = sr.contractId AND sp.poolId = sr.poolId
WHERE 
    sp.contractId = ? AND sp.poolId = ?
GROUP BY 
    sp.contractId, sp.poolId;
	`, [contractId, poolId]);
    }

    async insertOrUpdateStakePool({ contractId, poolId, poolProviderAddress, poolStakeTokenId, poolStakedAmount, poolStart, poolEnd, createRound }) {
        const result = await this.run(
            `
            UPDATE stake_pools
            SET poolStakedAmount = ?
            WHERE contractId = ? and poolId = ?
            `,
            [poolStakedAmount, contractId, poolId]
        );

        if (result.changes === 0) {
            return await this.run(
                `
                INSERT INTO stake_pools (contractId, poolId, poolProviderAddress, poolStakeTokenId, poolStakedAmount, poolStart, poolEnd, createRound) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `,
                [contractId, poolId, poolProviderAddress, poolStakeTokenId, poolStakedAmount, poolStart, poolEnd, createRound]
            );
        }
        return result;
    }

    async insertOrUpdateStakeRewards({ contractId, poolId, rewardTokenId, rewardAmount, rewardRemaining }) {
        const result = await this.run(
            `
            UPDATE stake_rewards
            SET rewardRemaining = ?                                                                                      
            WHERE contractId = ? AND poolId = ? AND rewardTokenId = ?
            `,
            [rewardRemaining, contractId, poolId, rewardTokenId]                                                                                
        );
            
        if (result.changes === 0) {                                                                                       
            return await this.run(                                                                                        
                `
                INSERT INTO stake_rewards (contractId, poolId, rewardTokenId, rewardAmount, rewardRemaining) VALUES (?, ?, ?, ?, ?)
                `,                                                                                                        
                [contractId, poolId, rewardTokenId, rewardAmount, rewardRemaining]
            );
        }
        return result;
    }

    async insertEventStakePool({ transactionId, contractId, timestamp, round, poolId, providerAddress, stakeTokenId, rewardTokenIds, rewardsAmounts, poolStart, poolEnd }) {
        return await this.run(
            `
            INSERT OR IGNORE INTO event_stake_pool (transactionId, contractId, timestamp, round, poolId, providerAddress, stakeTokenId, rewardTokenIds, rewardsAmounts, poolStart, poolEnd)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [transactionId, contractId, timestamp, round, poolId, providerAddress, stakeTokenId, rewardTokenIds, rewardsAmounts, poolStart, poolEnd]
        );
    }

    async insertOrUpdateStakeAccount({ contractId, poolId, stakeAccountAddress, stakeAmount }) {
        const result = await this.run(
            `
            UPDATE stake_accounts
            SET stakeAmount = ?
            WHERE contractId = ? AND poolId = ? AND stakeAccountAddress = ?
            `,
            [stakeAmount, contractId, poolId, stakeAccountAddress]
        );

        if (result.changes === 0) {
            return await this.run(
                `
                INSERT INTO stake_accounts (contractId, poolId, stakeAccountAddress, stakeAmount) VALUES (?, ?, ?, ?)
                `,
                [contractId, poolId, stakeAccountAddress, stakeAmount]
            );
        }
        return result;
    }

    async insertEventStake({ transactionId, contractId, timestamp, round, poolId, stakeAddress, stakeAmount, newUserStake, newAllStake }) {
        return await this.run(
            `
            INSERT OR IGNORE INTO event_stake_stake (transactionId, contractId, timestamp, round, poolId, stakeAddress, stakeAmount, newUserStake, newAllStake)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [transactionId, contractId, timestamp, round, poolId, stakeAddress, stakeAmount, newUserStake, newAllStake]
        );
    }


    async insertOrUpdateStakeAccountRewards({ contractId, poolId, stakeAccountAddress, stakeTokenId, stakeRewardAmount }) {
        const result = await this.run(
            `
            UPDATE stake_account_rewards
            SET stakeRewardAmount = ?                                                                                      
            WHERE contractId = ? AND poolId = ? AND stakeAccountAddress = ? AND stakeTokenId = ?
            `,  
            [stakeRewardAmount, contractId, poolId, stakeAccountAddress, stakeTokenId]
        );
            
        if (result.changes === 0) { 
            return await this.run(
                `
                INSERT INTO stake_account_rewards (contractId, poolId, stakeAccountAddress, stakeTokenId, stakeRewardAmount) VALUES (?, ?, ?, ?, ?)
                `,
                [contractId, poolId, stakeAccountAddress, stakeTokenId, stakeRewardAmount]
            );
        }
        return result;
    }

    async insertEventStakeHarvest({ transactionId, contractId, timestamp, round, poolId, rewarderAddress, userReceived, totalRemaining, receiverAddress }) {
        return await this.run(
            `
            INSERT OR IGNORE INTO event_stake_harvest (transactionId, contractId, timestamp, round, poolId, rewarderAddress, userReceived, totalRemaining, receiverAddress)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [transactionId, contractId, timestamp, round, poolId, rewarderAddress, userReceived, totalRemaining, receiverAddress]
        );
    }

    async insertStakeDelete({ contractId, poolId, stakePoolDeleteAddress }) {
        return await this.run(
            `           
            INSERT OR IGNORE INTO stake_deletes (contractId, poolId, stakePoolDeleteAddress) VALUES (?, ?, ?)
            `,
            [contractId, poolId, stakePoolDeleteAddress]
        );
    }

    async insertEventStakeDeletePool({ transactionId, contractId, timestamp, round, poolId, deleteAddress }) {
        return await this.run(
            `
            INSERT OR IGNORE INTO event_stake_delete_pool (transactionId, contractId, timestamp, round, poolId, deleteAddress)
            VALUES (?, ?, ?, ?, ?, ?)
            `,
            [transactionId, contractId, timestamp, round, poolId, deleteAddress]
        );
    }

    async insertEventStakeWithdraw({ transactionId, contractId, timestamp, round, poolId, stakeAddress, stakeAmount, newUserStake, newAllStake, receiverAddress }) {
        return await this.run(
            `
            INSERT OR IGNORE INTO event_stake_withdraw (transactionId, contractId, timestamp, round, poolId, stakeAddress, stakeAmount, newUserStake, newAllStake, receiverAddress)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [transactionId, contractId, timestamp, round, poolId, stakeAddress, stakeAmount, newUserStake, newAllStake, receiverAddress]
        );
    }

    async insertEventStakeEmergencyWithdraw({ transactionId, contractId, timestamp, round, poolId, stakeAddress, stakeAmount, newUserStake, newAllStake, receiverAddress }) {
        return await this.run(
            `
            INSERT OR IGNORE INTO event_stake_emergency_withdraw (transactionId, contractId, timestamp, round, poolId, stakeAddress, stakeAmount, newUserStake, newAllStake, receiverAddress)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [transactionId, contractId, timestamp, round, poolId, stakeAddress, stakeAmount, newUserStake, newAllStake, receiverAddress]
        ); 
    }

    // STUBS

    async insertOrUpdateContractStub({ contractId, hash, creator, active }) {
        const result = await this.run(
            `
            UPDATE contract_stubs
            SET active = ?                                                                                      
            WHERE contractId = ?
            `,
            [active, contractId]
        );

        if (result.changes === 0) {
            return await this.run(
                `
                INSERT INTO contract_stubs (contractId, hash, creator) VALUES (?, ?, ?)
                `,
                [contractId, hash, creator]
            );
        }
        return result;
    }

    // MP-0206

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

    async insertOrUpdateMarket({ contractId, escrowAddr, createRound, lastSyncRound, isBlacklisted }) {
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

    async insertOrUpdateMarketListing({ transactionId, mpContractId, mpListingId, contractId, tokenId, seller, price, currency, createRound, createTimestamp, endTimestamp, royalty, sales_id, delete_id }) {
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

    async insertOrUpdateMarketSale({ transactionId, mpContractId, mpListingId, contractId, tokenId, seller, buyer, currency, price, round, timestamp }) {
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

    async insertOrUpdateMarketDelete({ transactionId, mpContractId, mpListingId, contractId, tokenId, owner, round, timestamp }) {
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

    // ARC-0200

    async getContracts0200() {
	return await this.all("SELECT * from contracts_0200");
    }

    async getContract0200ById(contractId) {
        return await this.get(`
SELECT 
    c.*,
    group_concat(t.tokenId) as tokenId,
    p.price as price
FROM 
    contracts_0200 c
LEFT JOIN 
    contract_tokens_0200 t 
ON 
    c.contractId = t.contractId
LEFT JOIN 
    prices_0200 p 
ON 
    c.contractId = p.contractId
WHERE c.contractId = ?
GROUP BY c.contractId;
`, [contractId])   
    }

    async getContract0200ContractIdByTokenId(tokenId) {
	return (await this.all(`
WITH aggregated_tokens AS (
    SELECT 
        t.contractId, 
        group_concat(t.tokenId) as tokenId
    FROM
        contract_tokens_0200 t 
    GROUP BY  
        t.contractId
)
SELECT 
    at.contractId
FROM 
    aggregated_tokens at
WHERE 
    at.tokenId = ?;
`, [tokenId])).map(({ contractId }) => contractId)
    }

    async getContract0200LastSync(contractId) {
        const contract = await this.get("SELECT lastSyncRound FROM contracts_0200 WHERE contractId = ?", [contractId]);
        return (contract) ? contract.lastSyncRound : 0;
    }

    async updateContract0200LastSync(contractId, lastSyncRound) {
        return await this.run("UPDATE contracts_0200 SET lastSyncRound = ? WHERE contractId = ?", [lastSyncRound, contractId]);
    }

    async updateContract0200TokenId(contractId, tokenId) {
        return await this.run("UPDATE contracts_0200 SET tokenId = ? WHERE contractId = ?", [tokenId, contractId]);
    }

    async softDeleteContract0200(contractId) {
       return await this.run("UPDATE contracts_0200 SET deleted = 1 WHERE contractId = ?", [contractId]);

    }

    async insertOrUpdateContract0200({ contractId, name, symbol, decimals, totalSupply, createRound, lastSyncRound, creator }) {
        const result = await this.run(
            `
            UPDATE contracts_0200
            SET totalSupply = ?, lastSyncRound = ?, creator = ?, name = ?, symbol = ?, decimals = ?, totalSupply = ?
            WHERE contractId = ?
            `,
            [totalSupply, lastSyncRound, creator, name, symbol, decimals, totalSupply, contractId]
        );

        if (result.changes === 0) {
            return await this.run(
                `
                INSERT INTO contracts_0200 (contractId, name, symbol, decimals, totalSupply, creator, createRound, lastSyncRound, isBlacklisted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `,
                [contractId, name, symbol, Number(decimals), totalSupply, creator, createRound, lastSyncRound, 0]
            );
        }
        return result;
    }

    async insertContractToken0200({ contractId, tokenId }) {
            return await this.run(
                `
                INSERT OR IGNORE INTO contract_tokens_0200 (contractId, tokenId) VALUES (?, ?)
                `,
                [contractId, tokenId]
        );
    }

    async insertOrUpdatePool({ contractId, providerId, poolId, tokAId, tokBId, symbolA, symbolB, poolBalA, poolBalB, tvlA, tvlB, volA, volB, apr, supply }) {
        const result = await this.run(
            `
            UPDATE dex_pool
            SET poolBalA = ?, poolBalB = ?, tvlA = ?, tvlB = ?, volA = ?, volB = ?, apr = ?, supply = ?
            WHERE contractId = ?
            `,
            [poolBalA, poolBalB, tvlA, tvlB, volA, volB, apr, supply, contractId]
        );
                
        if (result.changes === 0) {
            return await this.run(
                `
                INSERT INTO dex_pool (contractId, providerId, poolId, tokAId, tokBId, symbolA, symbolB, poolBalA, poolBalB, tvlA, tvlB, volA, volB, apr, supply) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `,
                [contractId, providerId, poolId, tokAId, tokBId, symbolA, symbolB, poolBalA, poolBalB, tvlA, tvlB, supply]
            );
        }
        return result;
    }


    // delete these, use arc200 token last sync round

    async updatePoolLastSync(contractId, lastSyncRound) {
        return await this.run("UPDATE dex_pool SET lastSyncRound = ? WHERE contractId = ?", [lastSyncRound, contractId]);
    }

    async getPoolLastSync(contractId) {
        const contract = await this.get("SELECT lastSyncRound FROM dex_pool WHERE contractId = ?", [contractId]);
        return (contract) ? contract.lastSyncRound : 0;
    }

    async insertOrUpdatePrice0200({ contractId, price }) {
        const result = await this.run(
            `
            UPDATE prices_0200
            SET price = ?
            WHERE contractId = ?
            `,
            [price, contractId]
        );

        if (result.changes === 0) {
            return await this.run(
                `
                INSERT INTO prices_0200 (contractId, price) VALUES (?, ?)
                `,
                [contractId, price]
            );
        }
        return result;
    }


    async insertOrUpdatePriceHistory0200({ contractId, price, round, timestamp }) {
        const result = await this.run(
            `
            UPDATE price_history_0200
            SET price = ?
            WHERE contractId = ? AND round = ?
            `,
            [price, contractId, round]
        );

        if (result.changes === 0) {
            return await this.run(
                `
                INSERT INTO price_history_0200 (contractId, price, round, timestamp) VALUES (?, ?, ?, ?)
                `,
                [contractId, price, round, timestamp]
            );
        }
        return result;
    }


    async insertOrUpdateAccountBalance0200({ accountId, contractId, balance }) {
        const result = await this.run(
            `
            UPDATE account_balances_0200
            SET balance = ?
            WHERE accountId = ? AND contractId = ?
            `,
            [balance, accountId, contractId]
        );

        if (result.changes === 0) {
            return await this.run(
                `
                INSERT INTO account_balances_0200 (accountId, contractId, balance) VALUES (?, ?, ?)
                `,
                [accountId, contractId, balance]
            );
        }
        return result;
    }

    async insertOrUpdateAccountApproval0200({ contractId, owner, spender, approval }) {
        const result = await this.run(
            `
            UPDATE account_approvals_0200
            SET approval = ?
            WHERE contractId = ? AND owner = ? AND spender = ?
            `,
            [approval, contractId, owner, spender]
        );

        if (result.changes === 0) {
            return await this.run(
                `
                INSERT INTO account_approvals_0200 (contractId, owner, spender, approval) VALUES (?, ?, ?, ?)
                `,
                [contractId, owner, spender, approval]
            );
        }
        return result;
    }

    async insertTransfer0200({ transactionId, contractId, timestamp, round, sender, receiver, amount }) {
        return await this.run(
            `
            INSERT OR IGNORE INTO transfers_0200 (transactionId, contractId, timestamp, round, sender, receiver, amount) VALUES (?, ?, ?, ?, ?, ?, ?)
            `,
            [transactionId, contractId, timestamp, round, sender, receiver, amount]
        );
    }

    async insertApproval0200({ transactionId, contractId, timestamp, round, owner, spender, amount }) {
        return await this.run(
            `
            INSERT OR IGNORE INTO approvals_0200 (transactionId, contractId, timestamp, round, owner, spender, amount) VALUES (?, ?, ?, ?, ?, ?, ?)
            `,
            [transactionId, contractId, timestamp, round, owner, spender, amount]
        );
    }

    async insertEventDexDeposit({ transactionId, contractId, timestamp, round, inBalA, inBalB, lpOut, poolBalA, poolBalB }) {
        return await this.run(
            `
            INSERT OR IGNORE INTO event_dex_deposits (transactionId, contractId, timestamp, round, inBalA, inBalB, lpOut, poolBalA, poolBalB)
	    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [transactionId, contractId, timestamp, round, inBalA, inBalB, lpOut, poolBalA, poolBalB]
        );
    }

    async insertEventDexWithdraw({ transactionId, contractId, timestamp, round, lpIn, outBalA, outBalB, poolBalA, poolBalB }) {
        return await this.run(
            `
            INSERT OR IGNORE INTO event_dex_withdrawals (transactionId, contractId, timestamp, round, lpIn, outBalA, outBalB, poolBalA, poolBalB)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [transactionId, contractId, timestamp, round, lpIn, outBalA, outBalB, poolBalA, poolBalB]
        );
    }

    async insertEventDexSwap({ transactionId, contractId, timestamp, round, inBalA, inBalB, outBalA, outBalB, poolBalA, poolBalB }) {
        return await this.run(
            `
            INSERT OR IGNORE INTO event_dex_swaps (transactionId, contractId, timestamp, round, inBalA, inBalB, outBalA, outBalB, poolBalA, poolBalB)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [transactionId, contractId, timestamp, round, inBalA, inBalB, outBalA, outBalB, poolBalA, poolBalB]
        );
    }


    async getPoolVolume(contractId, timestamp = 0) {
	return await this.get(
		`
		SELECT contractId, SUM(inBalA) as volA, SUM(inBalB) as volB
		FROM event_dex_swaps
		WHERE contractId = ? AND timestamp >= ?
		GROUP BY contractId
		`,
		[contractId, timestamp]
	);
    }

    // TODO add arc-0200 
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
            `
            CREATE TABLE IF NOT EXISTS contracts_0200 (
                contractId TEXT PRIMARY KEY,
                tokenId TEXT,
                name TEXT,
                symbol TEXT,
                decimals INTEGER,
                totalSupply INTEGER,
                creator TEXT,
                metadata BLOB,
                createRound INTEGER,
                lastSyncRound INTEGER,
                isBlacklisted INTEGER
            )`,
            `
            CREATE TABLE IF NOT EXISTS account_balances_0200 (
                accountId TEXT,
                contractId TEXT,
                balance TEXT,
                PRIMARY KEY (accountId, contractId)
            )
            `,
            `
            CREATE TABLE IF NOT EXISTS account_approvals_0200 (
                contractId TEXT,
                owner TEXT,
                spender TEXT,
		approval TEXT,
                PRIMARY KEY (contractId, owner, spender)
            )
            `,
            `
            CREATE TABLE IF NOT EXISTS transfers_0200 (
                transactionId TEXT,
                contractId TEXT,
                timestamp INTEGER,
                round INTEGER,
                sender TEXT,
                receiver TEXT,
                amount TEXT,
                PRIMARY KEY (transactionId)
            )
            `,
            `
            CREATE TABLE IF NOT EXISTS approvals_0200 (
                transactionId TEXT,
                contractId TEXT,
                timestamp INTEGER,
                round INTEGER,
                sender TEXT,
                receiver TEXT,
                amount TEXT,
                PRIMARY KEY (transactionId)
            )
            `,
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
