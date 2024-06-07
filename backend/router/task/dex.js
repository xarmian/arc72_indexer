import algosdk from "algosdk";
import { CONTRACT, abi, swap } from "ulujs";
import BigNumber from "bignumber.js";
import { algodClient, indexerClient, db, prepareString } from "../../utils.js";
import { getMetadata, onTransfer, onApproval } from "./arc200.js";

const makeContract = (contractId, spec) =>
  new CONTRACT(contractId, algodClient, indexerClient, spec);

// isLPT
//  - checks if lpt
const isLPT = async (contractId, globalState) => {
  const accountAssets = await indexerClient
    .lookupAccountAssets(algosdk.getApplicationAddress(contractId))
    .do();
  const isLPT =
    globalState.find((el) => el.key === "cmF0aW8=" /*ratio*/) &&
    accountAssets.assets.length === 0;
  return isLPT;
};

const saveEvents = async (contractId, events, f) => {
  console.log("Saving events");
  const token = await db.getContract0200ById(String(contractId));
  console.log({ token });
  const tokens = String(token.tokenId).split(",");
  if (tokens.length !== 2) {
    console.log("Token missing tokens. Abort!");
    console.log({ tokens });
    return; // abort
  }
  const [tokA, tokB] = tokens;
  const tokenA = await db.getContract0200ById(tokA);
  const tokenB = await db.getContract0200ById(tokB);
  const nts = ["0", ...(await db.getContract0200ContractIdByTokenId("0"))];
  console.log({ nts });
  const decA = tokenA?.decimals || 6;
  const decB = tokenB?.decimals || 6;
  // for each event, record a transaction in the database
  for await (const event of events) {
    await f(event);
    const { poolBals, round, ts } = event;
    console.log(event);
    const { A, B } = poolBals;
    const balABn = new BigNumber(A).dividedBy(new BigNumber(10).pow(decA));
    const balBBn = new BigNumber(B).dividedBy(new BigNumber(10).pow(decB));
    let ratio;
    let whichToken;
    if (nts.some((el) => el === tokA)) {
      ratio = balABn.dividedBy(balBBn);
      whichToken = tokB;
    } else {
      ratio = balBBn.dividedBy(balABn);
      whichToken = tokA;
    }
    console.log({ ratio, whichToken, tokA, tokB });
    if (!isNaN(ratio)) {
      await db.insertOrUpdatePrice0200({
        contractId: String(whichToken),
        price: String(ratio),
      });
      await db.insertOrUpdatePriceHistory0200({
        contractId: String(whichToken),
        price: String(ratio),
        round,
        timestamp: ts,
      });
    }
  }
};

const onSwap = async (ci, events) => {
  const contractId = ci.getContractId();
  const swapEvents = (
    events.find(
      (el) => ["Swap", "SwapEvent"].includes(el.name) && el.events.length > 0
    )?.events || []
  ).map(swap.decodeSwapEvent);
  console.log(
    `Processing ${swapEvents.length} Swap events for contract ${contractId}`
  );
  if (swapEvents.length > 0) {
    console.log(swapEvents);
    await saveEvents(contractId, swapEvents, (e) => db.insertEventDexSwap(e));
  }
};

const onDeposit = async (ci, events) => {
  const contractId = ci.getContractId();
  const depositEvents = (
    events.find(
      (el) =>
        ["Deposit", "DepositEvent"].includes(el.name) && el.events.length > 0
    )?.events || []
  ).map(swap.decodeDepositEvent);
  console.log(
    `Processing ${depositEvents.length} Deposit events for contract ${contractId}`
  );
  console.log(depositEvents);
  if (depositEvents.length > 0) {
    await saveEvents(contractId, depositEvents, (e) =>
      db.insertEventDexDeposit(e)
    );
  }
};

const onWithdraw = async (ci, events) => {
  const contractId = ci.getContractId();
  const withdrawEvents = (
    events.find(
      (el) =>
        ["Withdraw", "WithdrawEvent"].includes(el.name) && el.events.length > 0
    )?.events || []
  ).map(swap.decodeWithdrawEvent);
  console.log(
    `Processing ${withdrawEvents.length} Withdraw events for contract ${contractId}`
  );
  console.log(withdrawEvents);
  if (withdrawEvents.length > 0) {
    await saveEvents(contractId, withdrawEvents, (e) =>
      db.insertEventDexWithdraw(e)
    );
  }
};

const getToken = async (ci, contractId) => {
  const { name, symbol, totalSupply, decimals } = await getMetadata(
    ci,
    contractId
  );

  // get application info from indexer
  const app = await indexerClient.lookupApplications(contractId).do();
  const globalState = app.application.params["global-state"];
  const creator = app.application.params.creator;
  const createRound = app.application["created-at-round"];

  // checks if arc200 lt
  const ciSwap = new swap(contractId, algodClient, indexerClient);
  const infoR = await ciSwap.Info();
  const isARC200LT = infoR.success;

  // for each lp type set tokenId and maybe update price
  let tokenId = null;
  // case: ARC200LT (Humble)
  if (isARC200LT) {
    const info = infoR.returnValue;
    const { tokA, tokB } = info;
    tokenId = `${tokA},${tokB}`;
    for (const tokenId of [tokA, tokB]) {
      await db.insertContractToken0200({
        contractId: String(contractId),
        tokenId: String(tokenId),
      });
    }
    // if nt pair then update price
    const nts = [...(await db.getContract0200ContractIdByTokenId("0"))].map(
      Number
    );
    console.log({ tokA, tokB, nts });
    if (nts.some((el) => [tokA, tokB].includes(el))) {
      const { poolBals } = info;
      const decA = (await makeContract(tokA, abi.arc200).arc200_decimals())
        .returnValue;
      const decB = (await makeContract(tokB, abi.arc200).arc200_decimals())
        .returnValue;
      const { A: balA, B: balB } = poolBals;
      const balABn = new BigNumber(balA).dividedBy(new BigNumber(10).pow(decA));
      const balBBn = new BigNumber(balB).dividedBy(new BigNumber(10).pow(decB));
      let ratio;
      let whichToken;
      if (nts.some((el) => el === tokA)) {
        ratio = balABn.dividedBy(balBBn);
        whichToken = tokB;
      } else {
        ratio = balBBn.dividedBy(balABn);
        whichToken = tokA;
      }
      if (!isNaN(ratio)) {
        await db.insertOrUpdatePrice0200({
          contractId: String(whichToken),
          price: String(ratio),
        });
      } else {
        await db.insertOrUpdatePrice0200({
          contractId: String(whichToken),
          price: "",
        });
      }
      console.log({ ratio });
    }
  }
  // case: LPT (NomadexAmmPublic AlgoArc200PoolV02)
  else if (await isLPT(contractId, globalState)) {
    const scalesq = new BigNumber("100000000000000").pow(2);
    const ratioBytes =
      globalState.find((el) => el.key === "cmF0aW8=" /*ratio*/)?.value?.bytes ||
      "0";
    const ratio = new BigNumber(
      "0x" + Buffer.from(ratioBytes, "base64").toString("hex")
    ).dividedBy(scalesq);
    const boxName = Buffer.from("token_y_app_id");
    const boxResponse = await indexerClient
      .lookupApplicationBoxByIDandName(contractId, boxName)
      .do();
    const tokenId1 = 0;
    const tokenId2 = Number(
      "0x" + Buffer.from(boxResponse.value).toString("hex")
    );
    tokenId = `${tokenId1},${tokenId2}`;
    for (const tokenId of [tokenId1, tokenId2]) {
      console.log(`Adding contract token ${contractId} ${tokenId}`);
      await db.insertContractToken0200({
        contractId: String(contractId),
        tokenId: String(tokenId),
      });
    }
    const ciARC200 = makeContract(tokenId2, abi.arc200);
    const arc200_decimals = (await ciARC200.arc200_decimals()).returnValue;
    const nRatio = ratio
      .multipliedBy(new BigNumber(10).pow(arc200_decimals))
      .dividedBy(new BigNumber(10).pow(6));
    console.log("ratio", nRatio);
    await db.insertOrUpdatePrice0200({
      contractId: String(tokenId2),
      price: String(nRatio),
    });
  } else {
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
    tokenId,
  };
};

// update lastSyncRound in collections table
const updateLastSync = async (contractId, round) => {
  await db.updateCollectionLastSync(contractId, round);
  console.log(`Updated lastSyncRound for contract ${contractId} to ${round}`);
};

// doIndex
//  - process new and existing apps
const doIndex = async (app, round) => {
  const contractId = app.apid;
  const ci = makeContract(contractId, abi.swap);
  let lastSyncRound;
  if (app.isCreate) {
    lastSyncRound = round;
    console.log(`Adding new contract ${contractId} to tokens table`);
    const token = await getToken(ci, contractId);
    console.log({ token });
    await db.insertOrUpdateContract0200(token);
    console.log(
      `Minted token ${contractId} by ${token.creator} on round ${round}`
    );
  } else {
    lastSyncRound = await db.getTokenLastSync(contractId);
    lastSyncRound = round;
    console.log(`Updating contract ${contractId} in tokens table`);
    const token = await getToken(ci, contractId);
    await db.insertOrUpdateContract0200(token); // ideally we would not need this
    console.log({ token });
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
    await updateLastSync(contractId, round);
  }
};

export default doIndex;
