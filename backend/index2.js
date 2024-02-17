/*
    For each block:
    - Iterate through transactions, filter for appcall transactions:
    - if newly created app - check if arc72, and if so add to collections table
        - set mintRound and totalSupply
    
    - else if appid is NOT in the collections table continue

    - update collection data:
        - get transaction history since lastSyncRound
        - for each transaction, set token owner = transaction toAddr
        - for each transaction, if fromAddr == zeroAddress
            - set token mintRound, metadataURI, metadata
        - insertTransaction for token ({transactionId, contractId, tokenId, round, fromAddr: from, toAddr: to, timestamp})

        - get approval history since lastSyncRound
        - for each approval, set token approved = approvedAddr
*/

import { arc72 as Contract } from "ulujs";
import { isARC72, zeroAddress, algodClient, indexerClient, sleep, output } from "./utils.js";
import Database from "./database.js";

const db = new Database('./db.sqlite');

// get last sync round from info table
let last_block = Number((await db.getInfo("syncRound"))?.value ?? 0);
let end_block = (await algodClient.status().do())['last-round'];
console.log(`Database Synced to round: ${last_block}. Current round: ${end_block}`);

//last_block = 3183800;

while (true) {
    if (last_block >= end_block) {
        output(`Reached end of chain, sleeping for 3 seconds...`, true);
        await sleep(3000);
        try {
            end_block = (await algodClient.status().do())['last-round'];
        }
        catch (error) {
            output(`Error retrieving end block from API: ${error.message}, retrying.`, true);
            await sleep(10000); // wait 10 seconds before trying again
        }
        continue;
    }
    let i = last_block + 1;

    output(`Retrieving block ${i} (${end_block - i} behind)`, true);

    try {
        const timeoutPromise = new Promise((resolve, reject) => {
            setTimeout(() => {
                reject(new Error('Request timed out'));
            }, 5000); // 5 second timeout
        });

        const blk = await Promise.race([algodClient.block(i).do(), timeoutPromise]);
        const rnd = blk.block.rnd;

        // get all application transactions from block
        if (blk.block.txns) {
            const appTxns = blk.block.txns.filter((txn) => typeof txn.apid !== 'undefined' || typeof txn.txn?.apid !== 'undefined');

            // for each txn in txns
            for (const txn of appTxns) {
                const contractId = txn.apid ?? txn.txn.apid;
                let lastSyncRound, ctc;

                // if txn is a contract creation, check if it's an ARC72 contract
                if (txn.txn.apap && txn.txn.apsu) {
                    ctc = new Contract(contractId, algodClient, indexerClient);

                    if (await isARC72(ctc)) {
                        console.log(`Adding new contract ${contractId} to collections table`);
                        const mintRound = rnd;
                        const totalSupply = (await ctc.arc72_totalSupply()).returnValue;
                        lastSyncRound = rnd;
                        await db.insertOrUpdateCollection({ contractId, totalSupply, createRound: mintRound, lastSyncRound });
                    }
                    else {
                        console.log(`Contract ${contractId} is not an ARC72 contract, skipping`);
                        continue;
                    }
                }
                else {
                    // check if we have this contractId in the database
                    lastSyncRound = await db.getCollectionLastSync(contractId);
                    if (lastSyncRound == 0) {
                        console.log(`Contract ${contractId} not found in collections table, skipping`);
                        continue;
                    }

                    console.log(`Updating contract ${contractId} in collections table`);
                    ctc = new Contract(contractId, algodClient, indexerClient);
                }

                if (lastSyncRound < rnd) {
                    // get transaction history since lastSyncRound
                    const events = await ctc.arc72_Transfer({ minRound: (lastSyncRound+1), maxRound: rnd });

                    console.log(`Processing ${events.length} events for contract ${contractId} from round ${lastSyncRound} to ${rnd}`);

                    // for each event, record a transaction in the database
                    for await (const event of events) {
                        const [transactionId, round, timestamp, from, to, tokenId] = event;

                        if (from == zeroAddress) {
                            // new token mint
                            const metadataURI = (await ctc.arc72_tokenURI(tokenId)).returnValue;
                            const metadata = JSON.stringify(await fetch(metadataURI).then((res) => res.json()));
                            await db.insertOrUpdateToken({ contractId, tokenId, tokenIndex: 0, owner: to, metadataURI, metadata, approved: zeroAddress, mintRound: round});
                            console.log(`Minted token ${tokenId} for contract ${contractId}`);
                        }
                        else {
                            await db.updateTokenOwner(contractId, tokenId, to);
                            console.log(`Updated token ${tokenId} owner to ${to}`);
                        }

                        await db.insertTransaction({ transactionId, contractId, tokenId, round, fromAddr: from, toAddr: to, timestamp });

                    }
                
                    // get approval history since lastSyncRound
                    const aevents = await ctc.arc72_Approval({ minRound: (lastSyncRound+1), maxRound: rnd });

                    console.log(`Processing ${aevents.length} approval events for contract ${contractId} from round ${lastSyncRound} to ${rnd}`);

                    // for each event, record a transaction in the database
                    for await (const event of aevents) {
                        const [transactionId, round, timestamp, from, to, tokenId] = event;

                        await db.updateTokenApproved(contractId, tokenId, to);
                        console.log(`Updated token ${tokenId} approved to ${to}`);
                    }

                    // update lastSyncRound in collections table
                    await db.updateCollectionLastSync(contractId, rnd);
                    console.log(`Updated lastSyncRound for contract ${contractId} to ${rnd}`);
                }
                else {
                    console.log(`No new events for contract ${contractId} since lastSyncRound ${lastSyncRound}`);
                }
            }

        }
    } catch (error) {
        if (error.message === 'Request timed out') {
            output(`Error retrieving block ${i} from API: request timed out, retrying.`, true);
        } else {
            output(`Error retrieving block ${i} from API: ${error.message}, retrying.`, true);
        }
        await sleep(10000); // wait 10 seconds before trying again
        continue;
    }

    last_block = i;
    await db.setInfo("syncRound", last_block);
}
