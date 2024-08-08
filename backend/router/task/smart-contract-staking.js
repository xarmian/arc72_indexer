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
    // expect globalStateDelta
    const global_period_seconds = app.globalStateDelta.find(el => el.key === "cGVyaW9kX3NlY29uZHM=")?.value?.uint || 0n;
    const global_period_limit = app.globalStateDelta.find(el => el.key === "cGVyaW9kX2xpbWl0")?.value?.uint || 0n;
    const global_lockup_delay = app.globalStateDelta.find(el => el.key === "bG9ja3VwX2RlbGF5")?.value?.uint || 0n;
    const global_vesting_delay = app.globalStateDelta.find(el => el.key === "dmVzdGluZ19kZWxheQ==")?.value?.uint || 0n;
    const global_parent_id = app.globalStateDelta.find(el => el.key === "cGFyZW50X2lk")?.value?.uint || 0n;
    const global_messenger_id = app.globalStateDelta.find(el => el.key === "bWVzc2VuZ2VyX2lk")?.value?.uint || 0n;
    const globalStateDelta = { global_period_seconds, global_period_limit, global_lockup_delay, global_vesting_delay, global_parent_id, global_messenger_id };
    await db.insertOrUpdateSCS({
	contractId,
	contractAddress: algosdk.getApplicationAddress(contractId),
	creator: app.sender,
	createRound: round,
	global_period_seconds,
	global_lockup_delay,
	global_vesting_delay,
	global_period_limit,
	global_parent_id,
	global_messenger_id
    })
  } else {
    lastSyncRound = (await db.getSCSLastSync(contractId)) ?? 0;
    // handleMethod
    switch(app.appArgs[0]) {
	    // setup(address,address,uint64,uint64)void
	    // isAirdrop
	    case "8i/zjQ==": {
		const stake = await db.getSCSById(contractId);
		const args = app.appArgs.slice(1)
                const [ownerB64, funderB64, deadlineB64, initialB64] = args;
		const global_owner = algosdk.encodeAddress(new Uint8Array(Buffer.from(ownerB64,"base64")))
                const global_funder = algosdk.encodeAddress(new Uint8Array(Buffer.from(funderB64,"base64")))
		const global_deadline = Number(algosdk.bytesToBigInt(new Uint8Array(Buffer.from(deadlineB64,"base64"))))
		const global_initial = algosdk.bytesToBigInt(new Uint8Array(Buffer.from(initialB64,"base64"))).toString()
                const globalStateDelta = { global_funder, global_owner, global_deadline, global_initial };
                await db.insertOrUpdateSCS({ ...stake, ...globalStateDelta });
		break;
	    }
	    // setup(address,address)void
	    // globalStateDelta in funder and owner // depreciate
            //   address funder is sender 
            //   address owner is argv[1]
	    // globalStateDelta in owner, delegate
            //   address owner is argv[1]
            //   address delegate is argv[1]
	    case "rHzvGw==": {
		    const stake = await db.getSCSById(contractId);
		    const isAirdrop = [
			stake.global_period_seconds,
		    	stake.global_lockup_delay,
			stake.global_vesting_delay
		    ].every(t => t > 0);
		    // !funder
		    const args = app.appArgs.slice(1)
		    const [addressB64, address2B64] = args;
		    if(isAirdrop) {
		    	const global_owner = algosdk.encodeAddress(new Uint8Array(Buffer.from(addressB64,"base64")))
		    	const global_funder = algosdk.encodeAddress(new Uint8Array(Buffer.from(address2B64,"base64")))
		    	const globalStateDelta = { global_funder, global_owner };
		    	await db.insertOrUpdateSCS({ ...stake, ...globalStateDelta });
		    } else {
			const global_owner = algosdk.encodeAddress(new Uint8Array(Buffer.from(addressB64,"base64")))
                        const global_delegate = algosdk.encodeAddress(new Uint8Array(Buffer.from(address2B64,"base64")))
                        const globalStateDelta = { global_owner, global_delegate };
                        await db.insertOrUpdateSCS({ ...stake, ...globalStateDelta });
		    }
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
                    await db.insertOrUpdateSCS({ ...stake, ...globalStateDelta });
		    break;
	    }

	    // participate(byte[],byte[],uint64,uint64,uint64,byte[])void
	    case "eTLtXg==": {
		    const stake = await db.getSCSById(contractId);
		    const [{
        		["keyreg-transaction"]: keyRegTxn
		    }] = app.innerTxns;
		    const {
        		["selection-participation-key"]: sel_k,
        		["state-proof-key"]: sp_key,
        		["vote-first-valid"]: part_vote_fst,
        		["vote-last-valid"]: part_vote_lst,
        		["vote-key-dilution"]: part_vote_kd,
        		["vote-participation-key"]: vote_k
		    } = keyRegTxn;
		    const globalStateDelta = {
        		part_vote_k: vote_k,
        		part_sel_k: sel_k,
        		part_vote_fst: part_vote_fst,
        		part_vote_lst: part_vote_lst,
        		part_vote_kd: part_vote_kd,
        		part_sp_key: sp_key
		    }
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
