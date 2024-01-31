/* 
*   Refreshes the database with the latest transactions and tokens for all collections in the database.
*/
import { arc72 as Contract } from "ulujs";
import { isARC72, zeroAddress, algodClient, indexerClient, sleep, output } from "./utils.js";
import Database from "./database.js";

const db = new Database('./db.sqlite');

// get a list of collections in the database
const collections = await db.getCollections();
const currentRound = (await algodClient.status().do())['last-round'];

// for each collection, refresh the collection and tokens tables
for (const collection of collections) {
  let { contractId, createRound, lastSyncRound } = collection;

  const ctc = new Contract(Number(contractId), algodClient, indexerClient);
  const isArc72 = await isARC72(ctc);

  if (isArc72) {
    output(`\nRefreshing ARC72 Contract ID: ${contractId}`);

    const totalSupply = (await ctc.arc72_totalSupply()).returnValue;

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
    
    const events = await ctc.arc72_Transfer({});

    // for each event, record a transaction in the database
    for await (const event of events) {
      const [transactionId, round, timestamp, from, to, tokenId] = event;
      await db.insertTransaction({transactionId, contractId, tokenId, round, fromAddr: from, toAddr: to, timestamp});
      await db.updateTokenOwner(contractId, tokenId, to);

      // if from == zeroAddress, then this is a mint transaction. update tokens table with mintRound
      if (from === zeroAddress) {
        await db.updateTokenMintRound(contractId, tokenId, round);
      }
      if (round > lastSyncRound) lastSyncRound = round;
    }

    await db.insertOrUpdateCollection({contractId, totalSupply, createRound: createRound, lastSyncRound: currentRound});

    output('Done.\n');
  }
}
