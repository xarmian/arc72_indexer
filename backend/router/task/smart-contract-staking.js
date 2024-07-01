import algosdk from "algosdk";
import { CONTRACT, abi } from "ulujs";
import BigNumber from "bignumber.js";
import { algodClient, indexerClient, db } from "../../utils.js";

const makeContract = (contractId, spec) =>
  new CONTRACT(contractId, algodClient, indexerClient, spec);

// update lastSyncRound in collections table
const updateLastSync = async (contractId, round) => {
  await db.updateSCSLastSync(contractId, round);
  console.log(`Updated lastSyncRound for contract ${contractId} to ${round}`);
};

// doIndex
//  - process new and existing apps
const doIndex = async (app, round) => {
  const contractId = app.apid;
  const ci = makeContract(contractId, abi.stakr200);
  let lastSyncRound;
  if (app.isCreate) {
    lastSyncRound = round;
    await db.insertOrUpdateSCS({
	contractId,
	contractAddress: algosdk.getApplicationAddress(contractId),
	creator: app.sender,
	createRound: round
    })
  } else {
    lastSyncRound = (await db.getSCSLastSync(contractId)) ?? 0;
    // handleMethod
    switch(app.appArgs[0]) {
	    // setup(address,address)void
	    // globalStateDelta in funder and owner
            //   address funder is sender 
            //   address owner is argv[1]
	    case "rHzvGw==": {
		    const stake = await db.getSCSById(contractId);
		    const args = app.appArgs.slice(1)
		    const [addressB64] = args;
		    const global_owner = algosdk.encodeAddress(new Uint8Array(Buffer.from(addressB64,"base64")))
		    const global_funder = app.sender;
		    const globalStateDelta = { global_funder, global_owner };
		    console.log({ globalStateDelta })
		    await db.insertOrUpdateSCS({ ...stake, ...globalStateDelta });
		    break;
	    }
	    // configure(uint64)void
	    // globalStateDelta in period
	    case "ZxVD+Q==": {
		    const stake = await db.getSCSById(contractId);
                    const args = app.appArgs.slice(1)
                    const [periodB64] = args;
                    const global_period = algosdk.bytesToBigInt(new Uint8Array(Buffer.from(periodB64,"base64")))
                    const globalStateDelta = { global_period: Number(global_period) };
		    console.log({ globalStateDelta })
                    await db.insertOrUpdateSCS({ ...stake, ...globalStateDelta });
                    break;
	    }
	    // fill(uint64)void
	    // globalStateDelta in total and funding
	    case "358UvA==": {
		    const stake = await db.getSCSById(contractId);
                    const args = app.appArgs.slice(1)
                    const [fundingB64] = args;
                    const global_funding = algosdk.bytesToBigInt(new Uint8Array(Buffer.from(fundingB64,"base64")))
		    const global_total = app.globalStateDelta.find(el => el.key === "dG90YWw=")?.value?.uint || 0n;
                    const globalStateDelta = { global_funding: Number(global_funding), global_total: global_total.toString() };
                    console.log({ globalStateDelta })
                    await db.insertOrUpdateSCS({ ...stake, ...globalStateDelta });
		    break;
	    }

	    // participate(byte[],byte[],uint64,uint64,uint64,byte[])void
	    case "eTLtXg==": {
		    const stake = await db.getSCSById(contractId);
                    const args = app.appArgs.slice(1)
                    const [vote_kB64, sel_kB64, vote_fstB64, vote_lstB64, vote_kdB64, sp_keyB64] = args;
                    const part_vote_fst = algosdk.bytesToBigInt(new Uint8Array(Buffer.from(vote_fstB64,"base64")))
                    const part_vote_lst = algosdk.bytesToBigInt(new Uint8Array(Buffer.from(vote_lstB64,"base64")))
                    const part_vote_kd = algosdk.bytesToBigInt(new Uint8Array(Buffer.from(vote_kdB64,"base64")))
                    const globalStateDelta = { 
			part_vote_k: vote_kB64,
			part_sel_k: sel_kB64,
			part_vote_fst: Number(part_vote_fst),
			part_vote_lst: Number(part_vote_lst),
			part_vote_kd: Number(part_vote_kd),
			part_sp_key: sp_keyB64
		    };
		    console.log({ globalStateDelta })
                    await db.insertOrUpdateSCS({ ...stake, ...globalStateDelta });
		    break;
	    }
	    // withdraw(uint64)uint64
	    case "MSFBdg==": {
		    const stake = await db.getSCSById(contractId);
                    const args = app.appArgs.slice(1)
                    const [amountB64] = args;
                    const amount = algosdk.bytesToBigInt(new Uint8Array(Buffer.from(amountB64,"base64")))
		    break;
	    }
	    // transfer(address)void
	    // globalStateDelta owner
	    case "rfkq5A==": {
		    const stake = await db.getSCSById(contractId);
                    const args = app.appArgs.slice(1)
                    const [addressB64] = args;
                    const global_owner = algosdk.encodeAddress(new Uint8Array(Buffer.from(addressB64,"base64")))
                    const globalStateDelta = { global_owner };
                    console.log({ globalStateDelta })
                    await db.insertOrUpdateSCS({ ...stake, ...globalStateDelta });
		    break;
	    }
	    // close()void
	    case "llYEeg==": {
		    const stake = await db.getSCSById(contractId);
                    await db.insertOrUpdateSCS({ ...stake, deleted: 1 });
		    break;
	    }
      }
  }
  console.log({ lastSyncRound })
  if (lastSyncRound <= round) {
    // handleEvents
    await updateLastSync(contractId, round);
  }
};

export default doIndex;
