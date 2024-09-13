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

// process events

const onTemplate = async (ci, events) => {
  const contractId = ci.getContractId();
  const stake = await db.getSCSById(contractId);
  const appEvents = events.find(el => el.name === "Template").events;
  console.log(
    `Processing ${appEvents.length} template events for contract ${contractId}`
  );
  for await (const event of appEvents) {
          const [
		  txid, 
		  round, 
		  ts,
		  periodLimit,
		  vestingDelay,
		  lockupDelay,
		  periodSeconds,
		  messengerId,
		  distributionCount,
		  distributionSeconds,
		  period,
		  deadline,
		  total,
		  initial,
		  delegate
	  ] = event;
          const update = ({
                contractId,
                ...stake,
                global_period_limit: Number(periodLimit),
                global_vesting_delay: Number(vestingDelay),
                global_lockup_delay: Number(lockupDelay),
                global_period_seconds: Number(periodSeconds),
                global_messenger_id: Number(messengerId),
                global_distribution_count: Number(distributionCount),
                global_distribution_seconds: Number(distributionSeconds),
                global_period: Number(period),
                global_deadline: Number(deadline),
		global_total: total.toString(),
                global_initial: initial.toString(),
                global_delegate: delegate
          })
          console.log({update})
          await db.insertOrUpdateSCS(update);
  }
}


const onSetup = async (ci, events) => {
  const contractId = ci.getContractId();
  const stake = await db.getSCSById(contractId);
  const appEvents = events.find(el => el.name === "Setup").events;
  console.log(
    `Processing ${appEvents.length} setup events for contract ${contractId}`
  );
  for await (const event of appEvents) {
          const [txid, round, ts, deployer, owner, funder, initial] = event;
          const update = ({
                contractId,
		...stake,
		global_deployer: deployer,
		global_owner: owner,
		global_funder: funder,
		global_initial: initial.toString()
          })
	  console.log({update})
          await db.insertOrUpdateSCS(update);
  }
};

const onDelegateUpdated = async (ci, events) => {
  const contractId = ci.getContractId();
  const stake = await db.getSCSById(contractId);
  const appEvents = events.find(el => el.name === "DelegateUpdated").events;
  console.log(
    `Processing ${appEvents.length} delegate updated events for contract ${contractId}`
  );
  for await (const event of appEvents) {
          const [txid, round, ts,, delegate] = event;
          const update = ({
                contractId,
		...stake,
                global_delegate: delegate
          })
	  console.log({update})
          await db.insertOrUpdateSCS(update);
  }
};


const onFundingSet = async (ci, events) => {
  const contractId = ci.getContractId();
  const stake = await db.getSCSById(contractId);
  const appEvents = events.find(el => el.name === "FundingSet").events;
  console.log(
    `Processing ${appEvents.length} funding set events for contract ${contractId}`
  );
  for await (const event of appEvents) {
          const [txid, round, ts, funding] = event;
          const update = ({
                contractId,
		...stake,
                global_funding: Number(funding)
          })
	  console.log({update})
	  await db.insertOrUpdateSCS(update);
  }
};

const onFunderGranted = async (ci, events) => {
  const contractId = ci.getContractId();
  const stake = await db.getSCSById(contractId);
  const appEvents = events.find(el => el.name === "FunderGranted").events;
  console.log(
    `Processing ${appEvents.length} funder granted events for contract ${contractId}`
  );
  for await (const event of appEvents) {
          const [txid, round, ts,,funder] = event;
          const update = ({
                contractId,
		...stake,
                global_funder: funder
          })
	  console.log({update})
          await db.insertOrUpdateSCS(update);
  }
};

const onClosed = async (ci, events) => {
  const contractId = ci.getContractId();
  const stake = await db.getSCSById(contractId);
  const appEvents = events.find(el => el.name === "Closed").events;
  console.log(
    `Processing ${appEvents.length} closed events for contract ${contractId}`
  );
  for await (const event of appEvents) {
          const [txid, round, ts,,] = event;
          const update = ({
                contractId,
                ...stake,
		deleted: 1
          })
          console.log({update})
          await db.insertOrUpdateSCS(update);
  }
}

const spec = {
	name: "",
	desc: "",
	methods: [],
	events: [
		{
                        "name": "Setup",
                        "args": [
                                {
                                        "type": "address"
                                },
				{
                                        "type": "address"
                                },
				{
                                        "type": "address"
                                },
				{
                                        "type": "uint64"
                                },
                        ]
                },
		{
                        "name": "DelegateUpdated",
                        "args": [
                                {
                                        "type": "address"
                                },
                                {
                                        "type": "address"
                                },
                        ]
                },
		{
                        "name": "FundingSet",
                        "args": [
                                {
                                        "type": "uint64"
                                },
                        ]
                },
		{
                        "name": "FunderGranted",
                        "args": [
                                {
                                        "type": "address"
                                },
				{
                                        "type": "address"
                                },
                        ]
                },
		{
                        "name": "Closed",
                        "args": [
                                {
                                        "type": "address"
                                },
                                {
                                        "type": "address"
                                },
                        ]
                },
		{
                        "name": "Template",
                        "args": [
                                {
                                        "type": "uint64"
                                },
                                {
                                        "type": "uint64"
                                },
                                {
                                        "type": "uint64"
                                },
                                {
                                        "type": "uint64"
                                },
                                {
                                        "type": "uint64"
                                },
                                {
                                        "type": "uint64"
                                },
                                {
                                        "type": "uint64"
                                },
                                {
                                        "type": "uint64"
                                },
                                {
                                        "type": "uint64"
                                },
                                {
                                        "type": "uint64"
                                },
                                {
                                        "type": "uint64"
				},
                                {
                                        "type": "address"
				}
                        ]
                },
	]
}

// doIndex
//  - process new and existing apps
const doIndex = async (app, round) => {
  const contractId = app.apid;
  const ci = makeContract(contractId, spec);
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
    const global_distribution_count = app.globalStateDelta.find(el => el.key === "ZGlzdHJpYnV0aW9uX2NvdW50")?.value?.uint || 0n; 
    const global_distribution_seconds = app.globalStateDelta.find(el => el.key === "ZGlzdHJpYnV0aW9uX3NlY29uZHM=")?.value?.uint || 0n;
    const globalStateDelta = {
	    global_period_seconds, 
	    global_period_limit, 
	    global_lockup_delay, 
	    global_vesting_delay, 
	    global_parent_id, 
	    global_messenger_id, 
	    global_distribution_count, 
	    global_distribution_seconds 
    };
    const update = ({
	contractId,
        contractAddress: algosdk.getApplicationAddress(contractId),
        creator: app.sender,
	createRound: round,
	...globalStateDelta
    });
    console.log({update});
    await db.insertOrUpdateSCS(update);
  } else {
    lastSyncRound = (await db.getSCSLastSync(contractId)) ?? 0;
    // handleMethod
    switch(app.appArgs[0]) {
	    // set_funding(uint64)void
	    case "aA7tQA==": {	
		const stake = await db.getSCSById(contractId);
                const args = app.appArgs.slice(1)
                const [fundingB64] = args;
                const global_funding = algosdk.bytesToBigInt(new Uint8Array(Buffer.from(fundingB64,"base64"))).toString()
                const globalStateDelta = { global_funding };
                console.log(globalStateDelta);
                await db.insertOrUpdateSCS({ ...stake, ...globalStateDelta });
 		break;
	    }
            // fill()void
	    case "XNP3ig==": {
                const stake = await db.getSCSById(contractId);
		const global_total = app.globalStateDelta.find(el => el.key === "dG90YWw=")?.value?.uint || 0n;
                const globalStateDelta = { global_total };
                await db.insertOrUpdateSCS({ ...stake, ...globalStateDelta });
                break;
            }
 	    // set_delegate(address)void
	    case "X36iSA==": {
		const stake = await db.getSCSById(contractId);
                const args = app.appArgs.slice(1)
                const [delegateB64] = args;
                const global_delegate = algosdk.encodeAddress(new Uint8Array(Buffer.from(delegateB64,"base64")))
                const globalStateDelta = { global_delegate };
		console.log(globalStateDelta);
                await db.insertOrUpdateSCS({ ...stake, ...globalStateDelta });
		break;
	    }
	    // preconfigure(uint64,uint64)void
	    case "hqho9g==": {
		const stake = await db.getSCSById(contractId);
                const args = app.appArgs.slice(1)
                const [periodB64, deadlineB64] = args;
                const global_deadline = algosdk.bytesToBigInt(new Uint8Array(Buffer.from(deadlineB64,"base64"))).toString()
                const global_period = algosdk.bytesToBigInt(new Uint8Array(Buffer.from(periodB64,"base64"))).toString()
                const globalStateDelta = { global_deadline, global_period };
                await db.insertOrUpdateSCS({ ...stake, ...globalStateDelta });
		break;
	    }
	    // airdrop
	    // setup(address,address,uint64)void
	    case "u9Dy+A==": {
		const stake = await db.getSCSById(contractId);
                const args = app.appArgs.slice(1)
                const [deployerB64, ownerB64, funderB64, initialB64] = args;
                const global_deployer = algosdk.encodeAddress(new Uint8Array(Buffer.from(deployerB64,"base64")))
                const global_owner = algosdk.encodeAddress(new Uint8Array(Buffer.from(ownerB64,"base64")))
                const global_funder = algosdk.encodeAddress(new Uint8Array(Buffer.from(funderB64,"base64")))
                const global_initial = algosdk.bytesToBigInt(new Uint8Array(Buffer.from(initialB64,"base64"))).toString()
                const globalStateDelta = { global_funder, global_owner, global_initial, global_deployer };
		console.log({globalStateDelta})
                await db.insertOrUpdateSCS({ ...stake, ...globalStateDelta });
                break;
	    }
	    // base
	    // setup(address,address)void
	    // globalStateDelta in funder and owner // depreciate
            //   address funder is sender 
            //   address owner is argv[1]
	    // globalStateDelta in owner, delegate
            //   address owner is argv[1]
            //   address delegate is argv[1]
	    // depreciate
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
		    console.log({globalStateDelta})
                    await db.insertOrUpdateSCS({ ...stake, ...globalStateDelta });
                    break;
	    }
            // reward
	    // fill()void
	    // globalStateDelta in total initial and funding
	    case "XNP3ig==": {
		    const stake = await db.getSCSById(contractId);
                    const global_funding = app.globalStateDelta.find(el => el.key === "ZnVuZGluZw==")?.value?.uint || 0n;
                    const global_initial = app.globalStateDelta.find(el => el.key === "aW5pdGlhbA==")?.value?.uint || 0n;
		    const global_total = app.globalStateDelta.find(el => el.key === "dG90YWw=")?.value?.uint || 0n;
		    break;
	    }
	    // airdrop
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

	    // participate(byte[32],byte[32],uint64,uint64,uint64,byte[64])void
	    case "zSTeiA==": {
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
		    console.log({stake});
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

  if (lastSyncRound <= round) {
    const events = await ci.getEvents({
      minRound: lastSyncRound,
      maxRound: round,
    });
    await onTemplate(ci, events);
    await onSetup(ci, events);
    await onDelegateUpdated(ci, events);
    await onFundingSet(ci, events);
    await onFunderGranted(ci, events);
    await onClosed(ci, events);
    await updateLastSync(contractId, round);
  }
};

export default doIndex;
