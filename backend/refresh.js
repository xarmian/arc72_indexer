/* 
*   Refreshes the database with the latest transactions and tokens for all collections in the database.
*/
import { arc72 as Contract } from "ulujs";
import { isARC72, zeroAddress, algodClient, indexerClient, sleep, output, decodeGlobalState } from "./utils.js";
import Database from "./database.js";

const db = new Database('./db.sqlite');

let useContractId;
let updateCollectionOnly = false;

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
    if (process.argv[i] == '--collection-metadata') {
      updateCollectionOnly = true;
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
  collections = await db.getCollections();
}

// const currentRound = (await algodClient.status().do())['last-round'];
const currentRound = (await indexerClient.lookupAccountByID(zeroAddress).do())['current-round'];

console.log(`Current round: ${currentRound}`);

// for each collection, refresh the collection and tokens tables
for (const collection of collections) {
  let { contractId, createRound, lastSyncRound } = collection;

  const ctc = new Contract(Number(contractId), algodClient, indexerClient);
  const isArc72 = await isARC72(ctc);

  if (isArc72) {
    output(`\nRefreshing ARC72 Contract ID: ${contractId}`);

    const totalSupply = (await ctc.arc72_totalSupply()).returnValue;

    if (!updateCollectionOnly) {
      // update tokens table for all tokens from index 0 to totalSupply
      output(`\nUpdating collection ${contractId} tokens from index 0 to ${totalSupply}...`);
      for(let i = 0; i < totalSupply; i++) {
        try {
          const tokenId = (await ctc.arc72_tokenByIndex(i)).returnValue;
          const owner = (await ctc.arc72_ownerOf(tokenId)).returnValue;
          const approved = (await ctc.arc72_getApproved(tokenId)).returnValue;
          const metadataURI = (await ctc.arc72_tokenURI(tokenId)).returnValue;
          const metadata = JSON.stringify(await fetch(metadataURI).then((res) => res.json()));

          await db.insertOrUpdateToken({contractId, tokenId, tokenIndex: i, owner, metadataURI, metadata, approved});
        }
        catch(err) {
          console.log(err);
          continue;
        }
      }

      // update transactions table for all transactions from createRound to currentRound
      output(`\nUpdating collection ${contractId} transactions to ${currentRound}...`);
      
      let events = [];
      while (true) {
        try {
          events = await ctc.arc72_Transfer({});
          break; // If successful, break the loop
        }
        catch(err) {
          console.log(err);
          // Sleep for 3 seconds before trying again
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
      
      // for each event, record a transaction in the database
      for await (const event of events) {
        const [transactionId, round, timestamp, from, to, tokenId] = event;
        await db.insertTransaction({transactionId, contractId, tokenId, round, fromAddr: from, toAddr: to, timestamp});
        //await db.updateTokenOwner(contractId, tokenId, to);

        // if from == zeroAddress, then this is a mint transaction. update tokens table with mintRound
        if (from === zeroAddress) {
          await db.updateTokenMintRound(contractId, tokenId, round);
        }
        if (round > lastSyncRound) lastSyncRound = round;
      }
    }

    // get collection createRound and creator address from indexer
    const app = (await indexerClient.lookupApplications(contractId).do());
    const creator = app.application.params.creator;
    createRound = app.application['created-at-round'];

    const globalState = app.application.params['global-state'];
    const decodedState = JSON.stringify(decodeGlobalState(globalState));

    output(`\nUpdating collection ${contractId} metadata...`);
    output(`\nContract ID: ${contractId}\nTotal Supply: ${totalSupply}\nCreate Round: ${createRound}\nLast Sync Round: ${lastSyncRound}\nCreator: ${creator}\n`);

    await db.insertOrUpdateCollection({contractId, totalSupply, createRound, lastSyncRound, creator: creator, globalState: decodedState});
    output('\nDone.\n');
  }
}
