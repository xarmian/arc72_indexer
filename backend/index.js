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

import { arc72 as Contract, mp as MPContract } from "ulujs";
import { isARC72, zeroAddress, algodClient, indexerClient, sleep, output, getAllAppIds, isMP } from "./utils.js";
import Database from "./database.js";

const db = new Database('./db.sqlite');

// get last sync round from info table
let last_block = Number((await db.getInfo("syncRound"))?.value ?? 0);
// let end_block = (await algodClient.status().do())['last-round'];
let end_block = (await indexerClient.lookupAccountByID(zeroAddress).do())['current-round'];

console.log(`Database Synced to round: ${last_block}. Current round: ${end_block}`);

//last_block = 4636660;

while (true) {
    if (last_block >= end_block) {
        output(`Reached end of chain, sleeping for 3 seconds...`, true);
        await sleep(3000);
        try {
            // end_block = (await algodClient.status().do())['last-round'];
            end_block = (await indexerClient.lookupAccountByID(zeroAddress).do())['current-round'];
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

        // get all app calls from block
        const apps = getAllAppIds(blk.block.txns);
        //console.log(`Found ${apps.length} app calls in block ${i}`);

        // for each app, check if it's an ARC72 contract
        for (const app of apps) {
            const contractId = app.apid;
            let lastSyncRound, ctc;
            let contractType = 0;

            // if txn is a contract creation, check if it's an ARC72 contract
            if (app.isCreate) {
                ctc = new Contract(contractId, algodClient, indexerClient);

                if (await isARC72(ctc)) {
                    console.log(`Adding new contract ${contractId} to collections table`);
                    const mintRound = rnd;
                    const totalSupply = (await ctc.arc72_totalSupply()).returnValue;
                    lastSyncRound = rnd;
                    await db.insertOrUpdateCollection({ contractId, totalSupply, createRound: mintRound, lastSyncRound });
                    contractType = 1;
                }
                else if (await isMP(ctc)) {
                    console.log(`Adding new contract ${contractId} to markets table`);
                    const createRound = rnd;
                    lastSyncRound = rnd;
                    await db.insertOrUpdateMarket({ contractId, createRound, lastSyncRound, isBlacklisted: 0 });
                    contractType = 2;
                }
                else {
                    console.log(`Contract ${contractId} is not an ARC72 or MP contract, skipping`);
                    continue;
                }
            }
            else {
                // check if we have this contractId in the database
                lastSyncRound = await db.getCollectionLastSync(contractId);
                if (lastSyncRound == 0) {
                    console.log(`\nContract ${contractId} not found in collections table, skipping`);
                }
                else {
                    contractType = 1;
                    ctc = new Contract(contractId, algodClient, indexerClient);
                    console.log(`Updating contract ${contractId} in collections table`);
                }

                if (contractType == 0) {
                    lastSyncRound = await db.getMarketLastSync(contractId);
                    if (lastSyncRound == 0) {
                        console.log(`Contract ${contractId} not found in markets table, skipping`);
                    }
                    else {
                        contractType = 2;
                        ctc = new MPContract(contractId, algodClient, indexerClient);
                        console.log(`Updating contract ${contractId} in markets table from round ${lastSyncRound} to ${rnd}`);
                    }
                }
            }

            if (lastSyncRound <= rnd) {
                if (contractType == 1) { // NFT Collection
                    // get transaction history since lastSyncRound
                    const events = await ctc.arc72_Transfer({ minRound: (lastSyncRound), maxRound: rnd });

                    console.log(`Processing ${events.length} events for contract ${contractId} from round ${lastSyncRound} to ${rnd}`);

                    // for each event, record a transaction in the database
                    for await (const event of events) {
                        const [transactionId, round, timestamp, from, to, tokenId] = event;

                        if (from == zeroAddress) {
                            // new token mint
                            const metadataURI = (await ctc.arc72_tokenURI(tokenId)).returnValue;
                            const metadata = JSON.stringify(await fetch(metadataURI).then((res) => res.json()));
                            const totalSupply = (await ctc.arc72_totalSupply()).returnValue;

                            await db.insertOrUpdateToken({ contractId, tokenId, tokenIndex: 0, owner: to, metadataURI, metadata, approved: zeroAddress, mintRound: round});
                            await db.updateCollectionTotalSupply(contractId, totalSupply);

                            console.log(`Minted token ${tokenId} for contract ${contractId}`);
                        }
                        else {
                            await db.updateTokenOwner(contractId, tokenId, to);
                            console.log(`Updated token ${tokenId} owner to ${to}`);
                        }

                        await db.insertTransaction({ transactionId, contractId, tokenId, round, fromAddr: from, toAddr: to, timestamp });

                    }
                
                    // get approval history since lastSyncRound
                    const aevents = await ctc.arc72_Approval({ minRound: (lastSyncRound), maxRound: rnd });

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
                else if (contractType == 2) { // Nautilus Marketplace Contract
                    // get listing events since lastSyncRound
                    const list_events = await ctc.ListEvent({ minRound: (lastSyncRound), maxRound: rnd });
                    console.log(`Processing ${list_events.length} listing events for contract ${contractId} from round ${lastSyncRound} to ${rnd}`);

                    // for each event, record a transaction in the database
                    for await (const event of list_events) {
                        const transactionId = event[0];
                        const createRound = event[1];
                        const createTimestamp = event[2];
                        const mpListingId = event[3];
                        const collectionId = event[4];
                        const tokenId = event[5];
                        const seller = event[6];
                        const endTimestamp = event[8];
                        const royalty = event[9];

                        const currencyData = event[7];
                        const ct = currencyData[0];
                        const currency = (ct == '00') ? 0 : parseInt(currencyData[1],16);
                        const price = (ct == '00') ? Number(currencyData[1]) : parseInt(currencyData[2], 16);
                      
                        await db.insertOrUpdateMarketListing({ transactionId, mpContractId: contractId, mpListingId, contractId: collectionId, tokenId, seller, price, currency, createRound, createTimestamp, endTimestamp, royalty, sales_id: null, delete_id: null });
                    }

                    const buy_events = await ctc.BuyEvent({ minRound: (lastSyncRound), maxRound: rnd });

                    console.log(`Processing ${buy_events.length} buy events for contract ${contractId} from round ${lastSyncRound} to ${rnd}`);

                    // for each event, record a transaction in the database
                    for await (const event of buy_events) {
                        const transactionId = event[0];
                        const round = event[1];
                        const timestamp = event[2];
                        const listingId = event[3];
                        const buyer = event[4];

                        // get market listing
                        const listing = await db.getMarketListing(contractId, listingId);

                        if (listing) {
                            // insert or update sale
                            await db.insertOrUpdateMarketSale({ transactionId, 
                                                                mpContractId: listing.mpContractId, 
                                                                mpListingId: listing.mpListingId, 
                                                                contractId: listing.contractId,
                                                                tokenId: listing.tokenId, 
                                                                seller: listing.seller,
                                                                buyer, 
                                                                currency: listing.currency, 
                                                                price: listing.price, 
                                                                round, 
                                                                timestamp });

                            await db.insertOrUpdateMarketListing({ transactionId: listing.transactionId, 
                                                                    mpContractId: listing.mpContractId, 
                                                                    mpListingId: listing.mpListingId, 
                                                                    tokenId: listing.tokenId, 
                                                                    contractId: listing.contractId,
                                                                    seller: listing.seller,
                                                                    price: listing.price, 
                                                                    currency: listing.currency, 
                                                                    createRound: listing.createRound, 
                                                                    createTimestamp: listing.createTimestamp,
                                                                    endTimestamp: listing.endTimestamp,
                                                                    royalty: listing.royalty,
                                                                    sales_id: transactionId,
                                                                    delete_id: listing.delete_id,
                                                                });
                        }
                        else {
                            console.log(`Listing ${contractId} ${listingId} not found in database`);
                        }
                    }

                    const del_events = await ctc.DeleteListingEvent({ minRound: (lastSyncRound), maxRound: rnd });

                    console.log(`Processing ${del_events.length} delete events for contract ${contractId} from round ${lastSyncRound} to ${rnd}`);

                    // for each event, record a transaction in the database
                    for await (const event of del_events) {
                        const transactionId = event[0];
                        const round = event[1];
                        const timestamp = event[2];
                        const listingId = event[3];

                        // get market listing
                        const listing = await db.getMarketListing(contractId, listingId);

                        if (listing) {
                            await db.insertOrUpdateMarketDelete({ transactionId: transactionId, 
                                mpContractId: listing.mpContractId, 
                                mpListingId: listing.mpListingId, 
                                contractId: listing.contractId,
                                tokenId: listing.tokenId, 
                                owner: listing.seller,
                                round, 
                                timestamp 
                            });

                            await db.insertOrUpdateMarketListing({ transactionId: listing.transactionId, 
                                mpContractId: listing.mpContractId, 
                                mpListingId: listing.mpListingId, 
                                tokenId: listing.tokenId, 
                                contractId: listing.contractId,
                                seller: listing.seller,
                                price: listing.price, 
                                currency: listing.currency, 
                                createRound: listing.createRound, 
                                createTimestamp: listing.createTimestamp,
                                endTimestamp: listing.endTimestamp,
                                royalty: listing.royalty,
                                sales_id: listing.sales_id,
                                delete_id: transactionId,
                            });
                        }
                        else {
                            console.log(`Listing ${contractId} ${listingId} not found in database`);
                        }
                    }

                    // update lastSyncRound for market
                    await db.updateMarketLastSync(contractId, rnd);
                    console.log(`Updated lastSyncRound for market contract ${contractId} to ${rnd}`);
                }
            }
            else {
                console.log(`No new events for contract ${contractId} since lastSyncRound ${lastSyncRound}`);
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
