import algosdk from "algosdk";
import { CONTRACT, abi } from "ulujs";
import BigNumber from "bignumber.js";
import { algodClient, indexerClient, db } from "../../utils.js";

const makeContract = (contractId, spec) =>
  new CONTRACT(contractId, algodClient, indexerClient, spec);

const decodePoolEvent = (evt) => {
  const [txId, round, ts, poolId, who, stakeToken, rewardTokens, rewards, start, end] = evt;
  return {
    txId,
    round,
    ts,
    poolId,
    providerAddress: who,
    stakeTokenId: stakeToken,
    rewardTokens,
    rewards,
    start,
    end
  }
}

const decodeStakeEvent = (evt) => {
  const [txId, round, ts, poolId, who, stakeAmount, [newUserStake, newEveryoneStake]] = evt;
  return {
    txId,
    round,
    ts,
    poolId,
    stakeAddress: who,
    stakeAmount,
    newUserStake,
    newEveryoneStake
  }
}

const decodeHarvestEvent = (evt) => {
  const [txId, round, ts, poolId, who, [userReceived, totalRemaining], receiverAddr] = evt;
  // userReceived totalRemaining are arrays
  return {
    txId,
    round,
    ts,
    poolId,
    harvestAddress: who,
    userReceived,
    totalRemaining,
    receiverAddress: receiverAddr
  }
}

const decodeDeletePoolEvent = (evt) => {
  const [txId, round, ts, poolId, who] = evt;
  return {
    txId,
    round,
    ts,
    poolId,
    deleteAddress: who
  }
}

const decodeWithdrawEvent = (evt) => {
  const [txId, round, ts, poolId, who, withdrawAmount, [newUserStake, newEveryoneStake], receiverAddr] = evt;
  return {
    txId,
    round,
    ts,
    poolId,
    withdrawAddress: who,
    withdrawAmount,
    newUserStake,
    newEveryoneStake,
    receiverAddress: receiverAddr
  }
}

const decodeEventByName = (eventName) => (evt) => {
  switch(eventName) {
    case "Pool": return decodePoolEvent(evt);
    case "Stake": return decodeStakeEvent(evt);
    case "Harvest": return decodeHarvestEvent(evt);
    case "DeletePool": return decodeDeletePoolEvent(evt);
    case "Withdraw": return decodeWithdrawEvent(evt);
    case "EmergencyWithdraw": return decodeWithdrawEvent(evt);
    default: throw new Error(`Unsupported event name '${eventName}'`);
  }
}

const onPool = async (ci, events) => {
  const contractId = ci.getContractId();
  const eventName = "Pool";
  const selectedEvents = (
    events.find(
      (el) => [eventName].includes(el.name) && el.events.length > 0
    )?.events || []
  ).map(decodeEventByName(eventName));
  console.log(
    `Processing ${selectedEvents.length} ${eventName} events for contract ${contractId}`
  );
  if (selectedEvents.length > 0) {
    for await (const evt of selectedEvents) {
	// initialize stake pool
	await db.insertOrUpdateStakePool({
		contractId,
		poolId: Number(evt.poolId),
		poolProviderAddress: evt.providerAddress,
		poolStakeTokenId: Number(evt.stakeTokenId),
		poolStakedAmount: 0,
		poolStart: Number(evt.start),
		poolEnd: Number(evt.end),
		createRound: Number(evt.round)
	})
	// initialize rewards
	for (let i=0;i<evt.rewards.length;i++) {
		const rewardTokenId = evt.rewardTokens[i];
		const rewardAmount = evt.rewards[i];
	 	await db.insertOrUpdateStakeRewards({
			contractId,
			poolId: Number(evt.poolId),
			rewardTokenId: Number(rewardTokenId),
			rewardAmount: rewardAmount.toString(),
			rewardRemaining: rewardAmount.toString()
		})
	}

	// save event
	await db.insertEventStakePool({
		transactionId: evt.txId,
		contractId, 
		timestamp: Number(evt.ts),
		round: Number(evt.round),
		poolId: Number(evt.poolId),
		providerAddress: evt.providerAddress,
		stakeTokenId: Number(evt.stakeTokenId),
		rewardTokenIds: evt.rewardTokens.map(el => el.toString()).join(","),
		rewardsAmounts: evt.rewards.map(el => el.toString()).join(","),
		poolStart: Number(evt.start),
		poolEnd: Number(evt.end)
	})
    }
  }
};

const onStake = async (ci, events) => {
  const contractId = ci.getContractId();
  const eventName = "Stake";
  const selectedEvents = (
    events.find(
      (el) => [eventName].includes(el.name) && el.events.length > 0
    )?.events || []
  ).map(decodeEventByName(eventName));
  console.log(
    `Processing ${selectedEvents.length} ${eventName} events for contract ${contractId}`
  );
  if (selectedEvents.length > 0) {
    for await (const evt of selectedEvents) {
    	// update stake_pools table
    	await db.insertOrUpdateStakePool({
		contractId,
		poolId: Number(evt.poolId), 
		poolStakedAmount: evt.newEveryoneStake.toString()
	})
    	// update stake_accounts table
	await db.insertOrUpdateStakeAccount({
		contractId,
		poolId:Number(evt.poolId),
		stakeAccountAddress: evt.stakeAddress,
		stakeAmount: evt.newUserStake.toString()
	})
    	// save events
	await db.insertEventStake({
		transactionId: evt.txId,
		contractId, 
		timestamp: Number(evt.ts),
		round: Number(evt.round),
		poolId: Number(evt.poolId),
		stakeAddress: evt.stakeAddress,
		stakeAmount: evt.stakeAmount.toString(),
		newUserStake: evt.newUserStake.toString(),
		newAllStake: evt.newEveryoneStake.toString()
	})
    }
  }
};

const onHarvest = async (ci, events) => {
  const contractId = ci.getContractId();
  const eventName = "Harvest";
  const selectedEvents = (
    events.find(
      (el) => [eventName].includes(el.name) && el.events.length > 0
    )?.events || []
  ).map(decodeEventByName(eventName));
  console.log(
    `Processing ${selectedEvents.length} ${eventName}  events for contract ${contractId}`
  );
  if (selectedEvents.length > 0) {
    for await (const evt of selectedEvents) {
	const poolId = Number(evt.poolId);
    	const stakePool = await db.getStakePool(contractId, poolId)
	if(!stakePool) continue;
	const tokenIds = stakePool.rewardTokenIds.split(",").map(Number);
	for await (const tokenId of tokenIds) {
    		// update stake_rewards table
		await db.insertOrUpdateStakeRewards({
			contractId, 
			poolId,
			rewardTokenId: tokenId,
			rewardRemaining: evt.totalRemaining.toString()
		})
    		// update stake_account_rewards table
		await db.insertOrUpdateStakeAccountRewards({
			contractId, 
			poolId, 
			stakeAccountAddress: evt.harvestAddress,
			stakeTokenId: tokenId,
			stakeRewardAmount:evt.userReceived.toString()
		})
    		// save events
		await db.insertEventStakeHarvest({
			transactionId: evt.txId,
			contractId, 
			timestamp: evt.ts,
			round: evt.round,
			poolId,
			rewarderAddress: evt.harvestAddress,
			userReceived: evt.userReceived.toString(),
			totalRemaining: evt.totalRemaining.toString(),
			receiverAddress: evt.receiverAddress
		})
	}
    }
  }
};

const onDeletePool = async (ci, events) => {
  const contractId = ci.getContractId(); 
  const eventName = "DeletePool";
  const selectedEvents = (
    events.find(
      (el) => [eventName].includes(el.name) && el.events.length > 0
    )?.events || []
  ).map(decodeEventByName(eventName));
  console.log(
    `Processing ${selectedEvents.length} ${eventName} events for contract ${contractId}`
  );
  if (selectedEvents.length > 0) {
    console.log(selectedEvents);
    for await (const evt of selectedEvents) {
    	const poolId = Number(evt.poolId);
    	// update stake_deletes tables
    	await db.insertStakeDelete({
		contractId, 
		poolId, 
		stakePoolDeleteAddress: evt.deleteAddress
    	})
    	// save events
	await db.insertEventStakeDeletePool({
		transactionId: evt.txId,
		contractId,
		timestamp: evt.ts,
		round: evt.round,
		poolId, 
		deleteAddress: evt.deleteAddress
	})
    }
  }
};

const onWithdraw = async (ci, events) => {
  const contractId = ci.getContractId();
  const eventName = "Withdraw";
  const selectedEvents = (
    events.find(
      (el) => [eventName].includes(el.name) && el.events.length > 0
    )?.events || []
  ).map(decodeEventByName(eventName));
  console.log(
    `Processing ${selectedEvents.length} ${eventName} events for contract ${contractId}`
  );
  if (selectedEvents.length > 0) {
    for await(const evt of selectedEvents) {
	const poolId = Number(evt.poolId);
    	// update stake_pools table
	await db.insertOrUpdateStakePool({
		contractId,
		poolId,
		poolStakedAmount: evt.newEveryoneStake.toString()
	})
    	// update stake_accounts table
	await db.insertOrUpdateStakeAccount({
		contractId,
		poolId,
		stakeAccountAddress: evt.withdrawAddress,
		stakeAmount: evt.newUserStake.toString()
	})
    	// save events
	await db.insertEventStakeWithdraw({
		transactionId: evt.txId,
		contractId, 
		timestamp: evt.ts, 
		round: evt.round,
		poolId, 
		stakeAddress: evt.withdrawAddress,
		stakeAmount: evt.withdrawAmount.toString(),
		newUserStake: evt.newUserStake.toString(),
		newAllStake: evt.newEveryoneStake.toString(),
		receiverAddress: evt.receiverAddress
	})
    }
  }
};

const onEmergencyWithdraw = async (ci, events) => {
  const contractId = ci.getContractId();
  const eventName = "EmergencyWithdraw";
  const selectedEvents = (
    events.find(
      (el) => [eventName].includes(el.name) && el.events.length > 0
    )?.events || []
  ).map(decodeEventByName(eventName));
  console.log(
    `Processing ${selectedEvents.length} ${eventName} events for contract ${contractId}`
  );
  if (selectedEvents.length > 0) {
	for await(const evt of selectedEvents) {
        const poolId = Number(evt.poolId);
        // update stake_pools table
        await db.insertOrUpdateStakePool({
                contractId,
                poolId,
                poolStakedAmount: evt.newEveryoneStake.toString()
        })
        // update stake_accounts table
        await db.insertOrUpdateStakeAccount({
                contractId,
                poolId,
                stakeAccountAddress: evt.withdrawAddress,
                stakeAmount: evt.newUserStake.toString()
        })
        // save events
        await db.insertEventStakeEmergencyWithdraw({
                transactionId: evt.txId,
                contractId, 
                timestamp: evt.ts, 
                round: evt.round,
                poolId, 
                stakeAddress: evt.withdrawAddress,
                stakeAmount: evt.withdrawAmount.toString(),
                newUserStake: evt.newUserStake.toString(),
                newAllStake: evt.newEveryoneStake.toString(),
                receiverAddress: evt.receiverAddress
        })      
    } 
  }
};

// update lastSyncRound in collections table
const updateLastSync = async (contractId, round) => {
  await db.updateStakeLastSync(contractId, round);
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
  } else {
    lastSyncRound = (await db.getStakeLastSync(contractId)) ?? 0;
  }
  console.log({lastSyncRound})
  if (lastSyncRound <= round) {
    const events = await ci.getEvents({
      minRound: lastSyncRound,
      maxRound: round,
    })
    console.log(events);
    await onPool(ci, events);
    await onStake(ci, events);
    await onHarvest(ci, events);
    await onDeletePool(ci, events);
    await onWithdraw(ci, events);
    await onEmergencyWithdraw(ci, events);
    await updateLastSync(contractId, round);
  }
};

export default doIndex;
