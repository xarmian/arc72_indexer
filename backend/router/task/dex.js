import algosdk from "algosdk";
import { CONTRACT, abi, swap } from "ulujs";
import BigNumber from "bignumber.js";
import {
  algodClient,
  indexerClient,
  decodeGlobalState,
  db,
  prepareString,
} from "../../utils.js";
import { ZERO_ADDRESS } from "../../constants.js";
import { getMetadata, onTransfer, onApproval } from "./arc200.js";

const makeContract = (contractId, spec) =>
  new CONTRACT(contractId, algodClient, indexerClient, spec);

// checks if lpt
const isLPT = async (contractId, globalState) => {
  const accountAssets = await indexerClient.lookupAccountAssets(algosdk.getApplicationAddress(contractId)).do();
  const isLPT = globalState.find(el => el.key === "cmF0aW8=" /*ratio*/) && accountAssets.assets.length === 0;
  return isLPT;
}

const onSwap = async (ci, events) => {
  const contractId = ci.getContractId();
  const swapEvents = (events.find(
    (el) => ["Swap", "SwapEvent"].includes(el.name) && el.events.length > 0
  )?.events || []).map(swap.decodeSwapEvent);
  console.log(
    `Processing ${swapEvents.length} Swap events for contract ${contractId}`
  );
  console.log(swapEvents);
  const token = await db.getContract0200ById(contractId)
  console.log(token);
}

const onDeposit = async (ci, events) => {
  const contractId = ci.getContractId();
  const depositEvents = (events.find(
    (el) => ["Deposit", "DepositEvent"].includes(el.name) && el.events.length > 0
  )?.events || []).map(swap.decodeDepositEvent);
  console.log(
    `Processing ${depositEvents.length} Deposit events for contract ${contractId}`
  );
  console.log(depositEvents);
  const token = await db.getContract0200ById(contractId)
  console.log(token);
  // for each event, record a transaction in the database
  // for await (const event of withdrawEvents) {
  //   await db.insertEventDexWithdraw(event);
  //   const { poolBalA, poolBalB, round, timestamp } = event;
  //   const balABn = new BigNumber(poolBalA).dividedBy(new BigNumber(10).pow(decA));
  //   const balBBn = new BigNumber(poolBalB).dividedBy(new BigNumber(10).pow(decB));
  //   const price = balABn.dividedBy(balBBn);
  //   const decA = (await (makeContract(tokA, abi.arc200).arc200_decimals())).returnValue;
  //   const decB = (await (makeContract(tokB, abi.arc200).arc200_decimals())).returnValue;
  //   await db.insertOrUpdatePriceHistory0200({
  //     contractId,
  //     price,
  //     round,
  //     timestamp
  //   })
  // }
}


const onWithdraw = async (ci, events) => {
  const contractId = ci.getContractId();
  const withdrawEvents = (events.find(
    (el) => ["Withdraw", "WithdrawEvent"].includes(el.name) && el.events.length > 0
  )?.events || []).map(swap.decodeWithdrawEvent);
  console.log(
    `Processing ${withdrawEvents.length} Withdraw events for contract ${contractId}`
  );
  console.log(withdrawEvents);
  const token = await db.getContract0200ById(contractId)
  console.log(token);
  // for each event, record a transaction in the database
  // for await (const event of withdrawEvents) {
  //   await db.insertEventDexWithdraw(event);
  //   const { poolBalA, poolBalB, round, timestamp } = event;
  //   const balABn = new BigNumber(poolBalA).dividedBy(new BigNumber(10).pow(decA));
  //   const balBBn = new BigNumber(poolBalB).dividedBy(new BigNumber(10).pow(decB));
  //   const price = balABn.dividedBy(balBBn);
  //   await db.insertOrUpdatePriceHistory0200({
  //     contractId,
  //     price,
  //     round,
  //     timestamp
  //   })
  // }
}

const getToken = async (ci, contractId) => {

  const {
    name,
    symbol,
    totalSupply,
    decimals
  } = await getMetadata(ci, contractId);

  // get application info from indexer
  const app = await indexerClient.lookupApplications(contractId).do();
  const globalState = app.application.params["global-state"];
  const creator = app.application.params.creator;
  const createRound = app.application["created-at-round"];

  // checks if arc200 lt
  const ciSwap = new swap(contractId, algodClient, indexerClient)
  const infoR = await ciSwap.Info();
  const isARC200LT = infoR.success;

  // for each lp type set tokenId and maybe update price
  let tokenId = null;
  // case: ARC200LT (Humble)
  if (isARC200LT) {
    const info = infoR.returnValue;
    const { tokA, tokB } = info
    tokenId = `${tokA},${tokB}`
    // if nt pair then update price
    const nts = [
      ...(await db.getContract0200ContractIdByTokenId('0'))
    ].map(Number)
    console.log({ tokA, tokB, nts })
    if (nts.some(el => [tokA, tokB].includes(el))) {
      const { poolBals } = info;
      const decA = (await (makeContract(tokA, abi.arc200).arc200_decimals())).returnValue;
      const decB = (await (makeContract(tokB, abi.arc200).arc200_decimals())).returnValue;
      const { A: balA, B: balB } = poolBals;
      const balABn = new BigNumber(balA).dividedBy(new BigNumber(10).pow(decA));
      const balBBn = new BigNumber(balB).dividedBy(new BigNumber(10).pow(decB));
      let ratio;
      let whichToken;
      if (nts.some(el => el === tokA)) {
        ratio = balABn.dividedBy(balBBn)
        whichToken = tokB;
      } else {
        ratio = balBBn.dividedBy(balABn)
        whichToken = tokA;
      }
      if (!isNaN(ratio)) {
        await db.insertOrUpdatePrice0200({
          contractId: String(whichToken),
          price: String(ratio)
        })
      } else {
        await db.insertOrUpdatePrice0200({
          contractId: String(whichToken),
          price: ''
        })

      }
      console.log({ ratio });
    }
  }
  // case: LPT (NomadexAmmPublic AlgoArc200PoolV02)
  else if (await await isLPT(contractId, globalState)) {
    const scalesq = new BigNumber("100000000000000").pow(2)
    const ratioBytes = globalState.find(el => el.key === "cmF0aW8=" /*ratio*/)?.value?.bytes || "0"
    const ratio = new BigNumber("0x" + Buffer.from(ratioBytes, "base64").toString("hex")).dividedBy(scalesq)
    const boxName = Buffer.from("token_y_app_id");
    const boxResponse = await indexerClient
      .lookupApplicationBoxByIDandName(contractId, boxName)
      .do();
    const tokenId1 = 0;
    const tokenId2 = Number("0x" + Buffer.from(boxResponse.value).toString("hex"));
    tokenId = `${tokenId1},${tokenId2}`
    const ciARC200 = makeContract(tokenId2, abi.arc200);
    const arc200_decimals = (await ciARC200.arc200_decimals()).returnValue;
    const nRatio = ratio.multipliedBy(new BigNumber(10).pow(arc200_decimals)).dividedBy(new BigNumber(10).pow(6))
    console.log("ratio", nRatio);
    await db.insertOrUpdatePrice0200({
      contractId: String(tokenId2),
      price: String(nRatio)
    })
  }
  else {
    // unhandled case
  }
  return {
    contractId,
    name: prepareString(name),
    symbol: prepareString(symbol),
    decimals: Number(decimals),
    totalSupply: String(totalSupply),
    createRound,
    creator,
    tokenId
  };
};

// onEvents

const updateLastSync = async (contractId, round) => {
  // update lastSyncRound in collections table
  //await db.updateCollectionLastSync(contractId, round);
  console.log(`Updated lastSyncRound for contract ${contractId} to ${round}`);
};


const doIndex = async (app, round) => {
  const contractId = app.apid;
  const ci = makeContract(contractId, abi.swap);
  let lastSyncRound;
  if (app.isCreate) {
    lastSyncRound = round;
    console.log(`Adding new contract ${contractId} to tokens table`);
    const token = await getToken(ci, contractId)
    console.log({ token });
    await db.insertOrUpdateContract0200(token);
    console.log(`Minted token ${contractId} by ${token.creator} on round ${round}`);
  } else {
    //lastSyncRound = await db.getTokenLastSync(contractId);
    lastSyncRound = round;
    console.log(`Updating contract ${contractId} in tokens table`);
    const token = await getToken(ci, contractId);
    console.log({ token });
    // TODO update token
    /*
    await db.insertOrUpdateCollection({
      ...collection,
      lastSyncRound,
    });
    */
  }
  if (lastSyncRound <= round) {
    // get transaction history since lastSyncRound
    const events = await ci.getEvents({
      minRound: lastSyncRound,
      maxRound: round,
    });
    await onTransfer(ci, events);
    await onApproval(ci, events);
    await onSwap(ci, events);
    await onDeposit(ci, events);
    await onWithdraw(ci, events);
    // TODO add support for arc72_ApprovalForAll
    await updateLastSync(contractId, round);
  }
};
export default doIndex;
