/*
    For each block:
    - Iterate through transactions, filter for appcall transactions:
    - if newly created app - check if arc72, and if so add to collections table
        - set mintRound and totalSupply
    
    - else if appid is NOT in the collections table continue

    - update collection data:
        - get transaction history since lastSyncRound
        - for each transaction, set token owner = transaction toAddr
        - for each transaction, if fromAddr == ZERO_ADDRESS
            - set token mintRound, metadataURI, metadata
        - insertTransaction for token ({transactionId, contractId, tokenId, round, fromAddr: from, toAddr: to, timestamp})

        - get approval history since lastSyncRound
        - for each approval, set token approved = approvedAddr
*/

import algosdk from "algosdk";
import { arc72 as Contract, mp as MPContract } from "ulujs";
import { 
  algodClient,
  decodeGlobalState,
  decodeMpCurrencyData,
  getAllAppIdsIdx,
  getContractType,
  indexerClient,
  isARC72,
  isMP,
  output,
  sleep
} from "./utils.js";
import {
  DELAY_END_BLOCK,
  DELAY_FAILED_HEALTH_CHECK,
  DELAY_LOOKUP_BLOCK,
  DELAY_ERROR,
  CONTRACT_TYPE_UNKNOWN,
  CONTRACT_TYPE_ARC72,
  CONTRACT_TYPE_MP,
  ZERO_ADDRESS
} from "./constants.js";
import Database from "./database.js";
import dotenv from 'dotenv';
dotenv.config();

const DB_PATH = process.env.DB_PATH || '../db/db.sqlite';

const db = new Database(DB_PATH);

const getEndBlock = async () => {
  // end_block = (await algodClient.status().do())['last-round'];
  // end_block = (await indexerClient.lookupAccountByID(ZERO_ADDRESS).do())['current-round'];
  const end_block = (await indexerClient.makeHealthCheck().do())['round'];
  return end_block;
}


let last_block; // last block in table
let end_block; // end of chain

console.log(`Database Synced to round: ${last_block}. Current round: ${end_block}`);

// get last sync round from info table, otherwise start from block zero
last_block = Number((await db.getInfo("syncRound"))?.value ?? 1) - 1;

end_block = await getEndBlock()

while (true) {

    if (last_block >= end_block) {
        //output(`Reached end of chain, sleeping for 3 seconds...`, true);
        await sleep(DELAY_END_BLOCK);
        try {
	  end_block = await getEndBlock()
        }
        catch (error) {
            output(`Error retrieving end block from API: ${error.message}, retrying.`, true);
            await sleep(DELAY_FAILED_HEALTH_CHECK); // wait 10 seconds before trying again
        }
        continue;
    }

    let i = last_block + 1;

    if (!process.env.DOCKER_MODE || process.env.DOCKER_MODE !== 'true' || i % 100 === 0) {
        output(`Retrieving block ${i} (${end_block - i} behind)`, true);
    }

    try {
        const timeoutPromise = new Promise((resolve, reject) => {
            setTimeout(() => {
                reject(new Error('Request timed out'));
            }, DELAY_LOOKUP_BLOCK); // 5 second timeout
        });

        const blk = await Promise.race([indexerClient.lookupBlock(last_block).do(), timeoutPromise]);
        const rnd = blk['round'];

        // get all app calls from block
        const apps = getAllAppIdsIdx(blk.transactions);
        if (apps.length > 0) {
            console.log(`Found ${apps.length} apps in block ${i}`);
        }

	// TODO add router
        // for each app, check if it's an ARC72 contract
        for (const app of apps) {

            const contractId = app.apid;

	    // ------------------------------------------
            let lastSyncRound; 
	    let ctc; 
            let contractType;
	    // set lastSyncRound, ctc, contractType for newly created and recorded contracts
            if (app.isCreate) {
            	// if txn is a contract creation, check if it's an ARC72 contract
                ctc = new Contract(contractId, algodClient, indexerClient);
		contractType = getContractType(ctc)
		switch(contractType) {
		  case CONTRACT_TYPE_ARC72: {
			console.log(`Adding new contract ${contractId} to collections table`);
                  	const totalSupply = (await ctc.arc72_totalSupply()).returnValue;
                 	lastSyncRound = rnd;
                  	// get creator from indexer
                  	const app = (await indexerClient.lookupApplications(contractId).do());
                  	const creator = app.application.params.creator;
                  	const createRound = app.application['created-at-round'];
                   	const globalState = app.application.params['global-state'];
                  	const decodedState = JSON.stringify(decodeGlobalState(globalState));
			const collection = {
			  contractId, totalSupply, createRound, lastSyncRound, creator, globalState: decodedState
			};
                   	await db.insertOrUpdateCollection(collection);
		  	break;
		  }
		  case CONTRACT_TYPE_MP: {
			console.log(`Adding new contract ${contractId} to markets table`);
			const createRound = rnd;
			lastSyncRound = rnd;
                     	const escrowAddr = algosdk.getApplicationAddress(Number(contractId));
                     	await db.insertOrUpdateMarket({ contractId, escrowAddr, createRound, lastSyncRound, isBlacklisted: 0 });
		  	break;
		  }
		  case CONTRACT_TYPE_UNKNOWN:
		  default:
		 	console.log(`Contract ${contractId} is not an ARC72 or MP contract, skipping`);
                  	continue;
		}
            } else {
		// TODO query db once for contractId return contract type and lastSync
                // check if we have this contractId in the database
                lastSyncRound = await db.getCollectionLastSync(contractId);
                if (lastSyncRound == 0) {
                    console.log(`\nContract ${contractId} not found in collections table, skipping`);
                } else {
                    contractType = CONTRACT_TYPE_ARC72;
                    ctc = new Contract(contractId, algodClient, indexerClient);
                    console.log(`Updating contract ${contractId} in collections table`);

                    const totalSupply = (await ctc.arc72_totalSupply()).returnValue;

                    const app = (await indexerClient.lookupApplications(contractId).do());
                    const creator = app.application.params.creator;
                    const createRound = app.application['created-at-round'];
                
                    const globalState = app.application.params['global-state'];
                    const decodedState = JSON.stringify(decodeGlobalState(globalState));

		    const collection = { contractId, totalSupply, createRound, lastSyncRound, creator, globalState: decodedState };

                    await db.insertOrUpdateCollection(collection)
                }

                if (contractType == CONTRACT_TYPE_UNKNOWN) {
                    lastSyncRound = await db.getMarketLastSync(contractId);
                    if (lastSyncRound == 0) {
                        console.log(`Contract ${contractId} not found in markets table, skipping`);
                    }
                    else {
                        contractType = CONTRACT_TYPE_MP;
                        ctc = new MPContract(contractId, algodClient, indexerClient);
                        console.log(`Updating contract ${contractId} in markets table from round ${lastSyncRound} to ${rnd}`);
			// TODO update contract in market table
                    }
                }
            }
	    // ------------------------------------------

            if (lastSyncRound <= rnd) {
		switch(contractType) {
		    case CONTRACT_TYPE_ARC72: {
			// requires ctc, lastSyncRound, rnd 
			// TODO turn into function
			 
			// get transaction history since lastSyncRound
			const events = await ctc.arc72.getEvents({ minRound: lastSyncRound, maxRound: rnd });
			const transferEvents = events.find(el => el.name === 'arc72_Transfer')
			const approvalEvents = events.find(el => el.name === 'arc72_Approval')

			console.log(`Processing ${transferEvents.length} arc72_Transfer events for contract ${contractId} from round ${lastSyncRound} to ${rnd}`);

                    	// for each event, record a transaction in the database
                    	for await (const event of transferEvents) {
                            const [transactionId, round, timestamp, from, to, tokenId] = event;
			    if (from == ZERO_ADDRESS) {
				// new token mint
				const tokenIndex = 0;
				const owner = to;
				const metadataURI = (await ctc.arc72_tokenURI(tokenId)).returnValue; // TODO strip null bytes ???
				const metadata = JSON.stringify(await fetch(metadataURI).then((res) => res.json()));
				const totalSupply = (await ctc.arc72_totalSupply()).returnValue;
				const approved = ZERO_ADDRESS;
				const mintRound = round;
				const token = { contractId, tokenId, tokenIndex, owner, metadataURI, metadata, approved, mintRound }
				await db.insertOrUpdateToken(token)
				await db.updateCollectionTotalSupply(contractId, totalSupply);
                                console.log(`Minted token ${tokenId} for contract ${contractId}`);
                            } else {
                            	await db.updateTokenOwner(contractId, tokenId, to);
                            	// check token approval
                            	const approved = (await ctc.arc72_getApproved(tokenId)).returnValue??null;
			    	// TODO set approved to zero address
			        await db.updateTokenApproved(contractId, tokenId, approved);
                                console.log(`Updated token ${tokenId} owner to ${to}, approval to ${approved}`);
                            }
                        	await db.insertTransaction({ transactionId, contractId, tokenId, round, fromAddr: from, toAddr: to, timestamp });
                    	}

			console.log(`Processing ${approvalEvents.length} arc72_Approval events for contract ${contractId} from round ${lastSyncRound} to ${rnd}`);

			// for each event, record a transaction in the database
			for await (const event of approvalEvents) {
			    const [transactionId, round, timestamp, from, to, tokenId] = event;
			    const approved = (await ctc.arc72_getApproved(tokenId)).returnValue??null;
			    await db.updateTokenApproved(contractId, tokenId, approved);
			    console.log(`Updated token ${tokenId} approved to ${approved}`);
                        }

			// TODO add support for arc72_ApprovalForAll
                    
			// update lastSyncRound in collections table
			await db.updateCollectionLastSync(contractId, rnd);
			console.log(`Updated lastSyncRound for contract ${contractId} to ${rnd}`);

		        break;
		    }
		    case CONTRACT_TYPE_MP: { // Nautilus Marketplace Contract (MP206)
		        // get listing events since lastSyncRound
		        const events = await ctc.getEvents({ minRound: (lastSyncRound), maxRound: rnd });
			const listEvents = events.find(el = el.name === 'e_sale_ListEvent')
			const buyEvents = events.find(el = el.name === 'e_sale_BuyEvent')
			const deleteEvents = events.find(el = el.name === 'e_sale_DeleteListingEvent')

			console.log(`Processing ${listEvents.length} listing events for contract ${contractId} from round ${lastSyncRound} to ${rnd}`);

			// for each event, record a transaction in the database
                        for await (const event of listEvents) {
			    // ListId, CollectionId, TokenId, ListAddr, ListPrice, EndTime, Royalties
			    const [
		              transactionId,
			      createRound,
			      createTimestamp,
			      mpListingId,
			      collectionId,
			      tokenId,
			      seller,
			      currencyData,
			      endTimestamp,
			      royalty,
			    ] = event;
			    const { currency, price } = decodeMpCurrencyData(currencyData)
			    const listing = {
		              transactionId,
                              createRound,
                              createTimestamp,
                              mpListingId,
                              collectionId,
                              tokenId,
                              seller,
                              endTimestamp,
                              royalty,
			      currency, 
			      price,
			      sales_id: null,
			      delete_id: null
			    }
			    await db.insertOrUpdateMarketListing(listing)
			}

			console.log(`Processing ${buyEvents.length} buy events for contract ${contractId} from round ${lastSyncRound} to ${rnd}`);

			// for each event, record a transaction in the database
			for await (const event of buyEvents) {
		           // ListId BuyAddr
			   const [
                              transactionId,
			      round,
			      timestamp,
                              listingId,
			      buyer
			   ] = event;
			   // get market listing
                           const listing = await db.getMarketListing(contractId, listingId);
			   if (listing) {
			       const {
			           mpContractId,
				   mpListingId,
				   contractId,
				   tokenId,
				   seller,
				   currency,
				   price,
				   royalty,
				   createRound,
				   createTimestamp,
				   endTimestamp,
				   delete_id
			       } = listing;
			       const mpSale = {
			           transactionId,
				   mpContractId,
                                   mpListingId,
                                   contractId,
				   tokenId,
                                   seller,
				   buyer,
                                   currency,
                                   price,
				   round,
				   timestamp
			       }
			       const mpListing = {
				   transactionId,
				   mpContractId,
				   mpListingId,
				   contractId,
				   tokenId,
				   seller,
				   price,
				   currency,
				   createRound,
				   createTimestamp,
				   endTimestamp,
				   royalty,
				   delete_id,
				   sales_id: transactionId
			       }
			       await db.insertOrUpdateMarketSale(mpSale);
			       await db.insertOrUpdateMarketListing(mpListing);
			   } else {
			        console.log(`Listing ${contractId} ${listingId} not found in database`);
			   }
			}


			console.log(`Processing ${deleteEvents.length} delete events for contract ${contractId} from round ${lastSyncRound} to ${rnd}`);

			// for each event, record a transaction in the database
			 for await (const event of deleteEvents) {
			   // ListId
                           const [
                              transactionId,
                              round,
                              timestamp,
                              listingId
                           ] = event;
			   // get market listing
			   const listing = await db.getMarketListing(contractId, listingId);
			   if(listing) {
			        const {
				   transactionId: listingTxId,
                                   mpContractId,
                                   mpListingId,
                                   contractId,
                                   tokenId,
                                   seller,
                                   currency,
                                   price,
                                   royalty,
                                   createRound,
                                   createTimestamp,
                                   endTimestamp,
                                   sales_id
                               } = listing;
			       const mpDelete = {
			           transactionId,
                                   mpContractId,
                                   mpListingId,
                                   contractId,
                                   tokenId,
                                   owner,
                                   round,
                                   timestamp
			       }
			       const mpListing = {
			           transactionId: listingTxId,
                                   mpContractId,
                                   mpListingId,
                                   contractId,
                                   tokenId,
                                   seller,
                                   price,
                                   currency,
                                   createRound,
                                   createTimestamp,
                                   endTimestamp,
                                   royalty,
                                   sales_id,
                              	   delete_id: transactionId,
			       }
			       await db.insertOrUpdateMarketDelete(mpDelete)
			       await db.insertOrUpdateMarketListing(mpListing)
			   } else {
		               console.log(`Listing ${contractId} ${listingId} not found in database`);

			   }
			}

			// update lastSyncRound for market
                    	await db.updateMarketLastSync(contractId, rnd);
                    	console.log(`Updated lastSyncRound for market contract ${contractId} to ${rnd}`);

		        break;
		    }
		    default:
		    case CONTRACT_TYPE_UNKNOWN: {
			console.log(`No new events for contract ${contractId} since lastSyncRound ${lastSyncRound}`);
		        break;
		    }
		}
	    }
	}
    } catch (error) {
        if (error.message === 'Request timed out') {
            output(`Error retrieving block ${i} from API: request timed out, retrying.`, true);
        } else {
            output(`Error retrieving block ${i} from API: ${error.message}, retrying.`, true);
        }
        await sleep(DELAY_ERROR); // wait 10 seconds before trying again
        continue;
    }

    last_block = i;
    await db.setInfo("syncRound", last_block);
}
