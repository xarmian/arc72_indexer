/* 
*   Refreshes the database with the latest transactions and tokens for all collections in the database.
*/
import { arc72 as Contract, mp as MPContract } from "ulujs";
import { isMP, zeroAddress, algodClient, indexerClient, sleep, output } from "./utils.js";
import Database from "./database.js";
import dotenv from 'dotenv';
dotenv.config();

const DB_PATH = process.env.DB_PATH || '../db/db.sqlite';
const db = new Database(DB_PATH);

let useContractId;

// process.argv[0] is the node executable
// process.argv[1] is the script file being run
// So we start at index 2
for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === '-c') {
        if (i + 1 < process.argv.length) {
            useContractId = Number(process.argv[i + 1]);
        }
        break;
    }
}

let collections = [];
// get a list of collections in the database
if (useContractId) {
  collections.push({
    contractId: useContractId,
    createRound: 0,
    lastSyncRound: 0
  });
}
else {
  collections = await db.getMarkets();
}
//const currentRound = (await algodClient.status().do())['last-round'];
const currentRound = (await indexerClient.lookupAccountByID(zeroAddress).do())['current-round'];

console.log(`Current round: ${currentRound}`);

// for each collection, refresh the collection and tokens tables
for (const collection of collections) {
  let { mpContractId, createRound, lastSyncRound } = collection;

  const cctc = new Contract(Number(mpContractId), algodClient, indexerClient);
  const isMPC = await isMP(cctc);

  if (isMPC) {
    console.log(`Refreshing MP Contract ID: ${mpContractId}`);

    const ctc = new MPContract(Number(mpContractId), algodClient, indexerClient);

    // get listing events
    let list_events = [];
    while (true) {
      try {
        list_events = await ctc.ListEvent({ minRound: 4747663});
        break; // If successful, break the loop
      }
      catch(err) {
        console.log(err);
        // Sleep for 3 seconds before trying again
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    console.log(`Processing ${list_events.length} listing events for contract ${mpContractId}`);

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
      
        await db.insertOrUpdateMarketListing({ transactionId, mpContractId: mpContractId, mpListingId, contractId: collectionId, tokenId, seller, price, currency, createRound, createTimestamp, endTimestamp, royalty, sales_id: null, delete_id: null });
    }

    // get buy events
    let buy_events = [];
    while (true) {
      try {
        list_events = await ctc.BuyEvent({});
        break; // If successful, break the loop
      }
      catch(err) {
        console.log(err);
        // Sleep for 3 seconds before trying again
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    console.log(`Processing ${buy_events.length} buy events for contract ${mpContractId}`);
    
    // for each event, record a transaction in the database
    for await (const event of buy_events) {
        const transactionId = event[0];
        const round = event[1];
        const timestamp = event[2];
        const listingId = event[3];
        const buyer = event[4];

        // get market listing
        const listing = await db.getMarketListing(mpContractId, listingId);

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
            console.log(`Listing ${mpContractId} ${listingId} not found in database`);
        }
    }

    // get del events
    let del_events = [];
    while (true) {
      try {
        del_events = await ctc.DeleteListingEvent({});
        break; // If successful, break the loop
      }
      catch(err) {
        console.log(err);
        // Sleep for 3 seconds before trying again
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    console.log(`Processing ${del_events.length} delete events for contract ${mpContractId}`);
    
    // for each event, record a transaction in the database
    for await (const event of del_events) {
        const transactionId = event[0];
        const round = event[1];
        const timestamp = event[2];
        const listingId = event[3];

        // get market listing
        const listing = await db.getMarketListing(mpContractId, listingId);

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
            console.log(`Listing ${mpContractId} ${listingId} not found in database`);
        }
    }

    console.log('Done.');
  }
}
