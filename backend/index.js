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
  output,
  sleep,
} from "./utils.js";
import {
  DELAY_END_BLOCK,
  DELAY_FAILED_HEALTH_CHECK,
  DELAY_LOOKUP_BLOCK,
  DELAY_ERROR,
  CONTRACT_TYPE_UNKNOWN,
  CONTRACT_TYPE_ARC72,
  CONTRACT_TYPE_MP,
  ZERO_ADDRESS,
} from "./constants.js";
import onARC72 from "./router/task/arc72.js";
import onMP206 from "./router/task/mp206.js";
import Database from "./database.js";
import dotenv from "dotenv";
dotenv.config();

const DB_PATH = process.env.DB_PATH || "../db/db.sqlite";

const db = new Database(DB_PATH);

const getEndBlock = async () => {
  // end_block = (await algodClient.status().do())['last-round'];
  // end_block = (await indexerClient.lookupAccountByID(ZERO_ADDRESS).do())['current-round'];
  const end_block = (await indexerClient.makeHealthCheck().do())["round"];
  return end_block;
};

let last_block; // last block in table
let end_block; // end of chain

console.log(
  `Database Synced to round: ${last_block}. Current round: ${end_block}`
);

// get last sync round from info table, otherwise start from block zero
last_block = Number((await db.getInfo("syncRound"))?.value ?? 1) - 1;

end_block = await getEndBlock();

while (true) {
  if (last_block >= end_block) {
    //output(`Reached end of chain, sleeping for 3 seconds...`, true);
    await sleep(DELAY_END_BLOCK);
    try {
      end_block = await getEndBlock();
    } catch (error) {
      output(
        `Error retrieving end block from API: ${error.message}, retrying.`,
        true
      );
      await sleep(DELAY_FAILED_HEALTH_CHECK); // wait 10 seconds before trying again
    }
    continue;
  }

  let i = last_block + 1;

  if (
    !process.env.DOCKER_MODE ||
    process.env.DOCKER_MODE !== "true" ||
    i % 100 === 0
  ) {
    output(`Retrieving block ${i} (${end_block - i} behind)`, true);
  }

  try {
    const timeoutPromise = new Promise((resolve, reject) => {
      setTimeout(() => {
        reject(new Error("Request timed out"));
      }, DELAY_LOOKUP_BLOCK); // 5 second timeout
    });

    const blk = await Promise.race([
      indexerClient.lookupBlock(last_block).do(),
      timeoutPromise,
    ]);
    const rnd = blk["round"];

    // get all app calls from block
    const apps = getAllAppIdsIdx(blk.transactions);
    if (apps.length > 0) {
      console.log(`Found ${apps.length} apps in block ${i}`);
    }
    // for each app, run contract specific indexer task
    for (const app of apps) {
      const contractId = app.apid;
      const contractType = await getContractType(contractId);
      switch (contractType) {
        case CONTRACT_TYPE_ARC72: {
          await onARC72(app, rnd);
          break;
        }
        case CONTRACT_TYPE_MP /*206*/: {
          await onMP206(app, rnd);
	  break;
        }
        case CONTRACT_TYPE_UNKNOWN:
        default: {
          console.log(`Contract ${contractId} type unknown, skipping`);
        }
      }
    }
  } catch (error) {
    if (error.message === "Request timed out") {
      output(
        `Error retrieving block ${i} from API: request timed out, retrying.`,
        true
      );
    } else {
      output(
        `Error retrieving block ${i} from API: ${error.message}, retrying.`,
        true
      );
    }
    await sleep(DELAY_ERROR); // wait 10 seconds before trying again
    continue;
  }
  last_block = i;
  await db.setInfo("syncRound", last_block);
}
