/* TODO
  - Listen only for new contract creation and check if ARC72
  - Listen only for appCalls of ARC72 contracts that have already been added to database

  - When see a transfer from Zero address, add the token to the database and pull the metadata
  - 

*/
import { arc72 as Contract } from "ulujs";
import { isARC72, zeroAddress, algodClient, indexerClient, sleep, output } from "./utils.js";
import Database from "./database.js";

const db = new Database('./db.sqlite');

// get last sync round from info table
let last_block = Number((await db.getInfo("syncRound"))?.value??0);
let end_block = (await algodClient.status().do())['last-round'];
console.log(`Database Synced to round: ${last_block}. Current round: ${end_block}`);

// last_block = 4419072;

// update collection (async to allow multithread). if fails, reset syncRound to rnd
// if contract is null it's a new contract (not in database yet)
const updateCollection = async (contractId, rnd, contract) => {
  try {
    const ctc = new Contract(contractId, algodClient, indexerClient);
    const isArc72 = await isARC72(ctc);
    
    if (isArc72) {
      output(`\nFound ARC72 contract AppCall at ${contractId}, in block ${rnd}`);

      let lastSyncRound = await db.getCollectionLastSync(contractId);
      if (rnd < lastSyncRound) lastSyncRound = rnd;

      // if this is a new contract
      if (!contract) {
        output(`\nAdding new collection ${contractId}...`);
        await db.insertOrUpdateCollection({contractId, createRound: rnd, lastSyncRound: rnd});
      }

      const totalSupply = (await ctc.arc72_totalSupply()).returnValue;

      await db.insertOrUpdateCollection({contractId, totalSupply, createRound: rnd, lastSyncRound: rnd});

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

      output(`\nUpdating collection ${contractId} transactions from round ${lastSyncRound} to ${rnd}...`);

      // get events since lastSyncRound
      // [ transactionId: string, round: number, timestamp: number, from: string, to: string, tokenId: number ]
      const events = await ctc.arc72_Transfer({ minRound: lastSyncRound, maxRound: rnd });

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

      output('Done.\n');

      // set lastSyncRound in collections table
      await db.updateCollectionLastSync(contractId, lastSyncRound);

    }
  }
  catch(err) {
    console.log(err);
    await db.setInfo("syncRound", rnd);
  }
}

while(true) {
  if (last_block >= end_block) {
      output(`Reached end of chain, sleeping for 10 seconds...`, true);
      await sleep(10000);
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

        // if txn is a contract creation, check if it's an ARC72 contract
        if (txn.apap && txn.apsu) {
          updateCollection(contractId, rnd, null);
        }
        else {
          // check if we have this contractId in the database
          const contract = await db.getContract(contractId);

          if (contract) {
            await updateCollection(contractId, rnd, contract);
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
    await sleep(10000); // wait 10 seconds before trying again
    continue;
  }

  last_block = i;
  await db.setInfo("syncRound", last_block);
}
