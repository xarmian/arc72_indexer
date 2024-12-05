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

import minimist from 'minimist'; // import minimist to parse command line arguments
import {
    db,
    getAllAppIdsIdx,
    getContractType,
    algodClient,
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
    CONTRACT_TYPE_ARC200,
    CONTRACT_TYPE_LPT,
    CONTRACT_TYPE_STAKE,
    CONTRACT_TYPE_SCS,
} from "./constants.js";
import onARC72 from "./router/task/arc72.js";
import onMP206 from "./router/task/mp206.js";
import onARC200 from "./router/task/arc200.js";
import onDex from "./router/task/dex.js";
import onStake from "./router/task/stake.js";
import onSCS from "./router/task/smart-contract-staking.js";
import dotenv from "dotenv";
dotenv.config();

const keypress = async () => {
  process.stdin.setRawMode(true)
  return new Promise(resolve => process.stdin.once('data', () => {
    process.stdin.setRawMode(false)
    resolve()
  }))
}

const args = minimist(process.argv.slice(2));

const isDebugMode = args.debug;

if (isDebugMode) {
    console.log("Debug mode enabled");
}


export const getStatus = async () => {
    const status = await algodClient.status().do();
    console.log("status", status);
    return status;
}

export const getEndBlock = async () => {
    // end_block = (await algodClient.status().do())['last-round'];
    // end_block = (await indexerClient.lookupAccountByID(ZERO_ADDRESS).do())['current-round'];
    // use algod
    const status = await getStatus();
    const end_block = Number(status['last-round']);
    // use indexer
    // const hc = await indexerClient.makeHealthCheck().do();
    // const end_block = hc.round;
    return end_block;
};

let last_block; // last block in table
let end_block; // end of chain


// get last sync round from info table, otherwise start from block zero
last_block = args.block ? Number(args.block) : Number((await db.getInfo("syncRound"))?.value ?? 1) - 1;

end_block = await getEndBlock();

console.log(
    `Database Synced to round: ${last_block}. Current round: ${end_block}`
);

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

	console.log({last_block});

        const blk = await Promise.race([
            indexerClient.lookupBlock(last_block).do(),
            timeoutPromise,
        ]);


	console.log(blk);

        const rnd = blk["round"];

	const transactions = blk.transactions || blk.block?.txns || [];

	console.log(transactions);

        // get all app calls from block
        const apps = getAllAppIdsIdx(blk.transactions);
        if (apps.length > 0) {
            console.log(`Found ${apps.length} apps in block ${i}`);
        }
        // for each app, run contract specific indexer task
        for (const app of apps) {

	    // skip blacklist accounts
	    if(app.isCreate && [
		//"FZPGANXMQIHVSWYN6ZXS63QO5A5X4LEYCB4O52IP37HR6LY5RJY6FRC3LA"
	    ].includes(app.creator)) {
		console.log(`skip blacklist addr ${app.creator}`);
		continue;
	    }

            const contractType = await getContractType(app);

	    console.log({contractType});

            switch (contractType) {
                case CONTRACT_TYPE_SCS: {
                    console.log("SCS", app, rnd);
		    await onSCS(app, rnd);
		    break;
		}
		case CONTRACT_TYPE_ARC200: {
                    console.log("ARC200", app, rnd);
                    await onARC200(app, rnd);
                    break;
                }
                case CONTRACT_TYPE_ARC72: {
                    console.log("ARC72", app, rnd);
                    await onARC72(app, rnd);
                    break;
                }
                case CONTRACT_TYPE_MP: { // 206
                    console.log("MP206", app, rnd);
                    await onMP206(app, rnd);
                    break;
                }
		case CONTRACT_TYPE_LPT: {
                    console.log("LPT", app, rnd);
                    await onDex(app, rnd);
                    break;
                }
		case CONTRACT_TYPE_STAKE: {
                    console.log("STAKE", app, rnd);
                    await onStake(app, rnd);
		    break;
		}
                case CONTRACT_TYPE_UNKNOWN:
                default: {
                    console.log(`Contract ${app.apid} type unknown, skipping`);
                }
            }
        }
    } catch (error) {
        if (isDebugMode) {
            console.log(error);
        }
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

    if(args.once) {
	break;
    }

    if(args.step) {
	await keypress();
    }
}
