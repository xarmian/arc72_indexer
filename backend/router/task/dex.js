import algosdk from "algosdk";
import { CONTRACT, abi, swap } from "ulujs";
import BigNumber from "bignumber.js";
import { algodClient, indexerClient, db, prepareString } from "../../utils.js";
import { getMetadata, onTransfer, onApproval } from "./arc200.js";

const getTimestampOneWeekBefore = () => {
    // Get the current date and time
    let now = new Date();
    // Subtract 7 days (7 * 24 * 60 * 60 * 1000 milliseconds) to get the date one week before
    let oneWeekBefore = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return Math.round(oneWeekBefore.getTime() / 1000);
}

const makeContract = (contractId, spec) =>
  new CONTRACT(contractId, algodClient, indexerClient, spec);


const nts = await db.getContract0200ContractIdByTokenId('0');
    
const tokenId = (token) => nts.includes(token.contractId) ? 0 : Number(token.contractId);
const symbol = (token) => nts.includes(token.contractId) ? "VOI" : token.symbol;
const poolId = (tokenA, tokenB) => ((tokA, tokB) => tokA > tokB ? `${tokB}-${tokA}` : `${tokA}-${tokB}`)(tokenId(tokenA),tokenId(tokenB));

// isLPT
//  - checks if lpt
const isLPT = async (contractId, globalState) => {
  const accountAssets = await indexerClient
    .lookupAccountAssets(algosdk.getApplicationAddress(contractId))
    .do();
  
  const isLPT = globalState.find(el => el.key === "cmF0aW8=" /*ratio*/) &&
                !globalState.find(el => el.key === "dG9rZW5feV9hcHBfaWQ=" /*token_y_app_id*/) &&
                accountAssets.assets.length === 0;
  return isLPT;
};

const saveEvents = async (contractId, events, f) => {
  console.log("Saving events");
  const token = await db.getContract0200ById(String(contractId));
  console.log({ token });
  const tokens = String(token.tokenId).split(",");
  console.log({ tokens });
  if (tokens.length !== 2) {
    console.log("Token missing tokens. Abort!");
    return; // abort
  }
  const [tokA, tokB] = tokens;
  const tokenA = await db.getContract0200ById(tokA);
  const tokenB = await db.getContract0200ById(tokB);
  const nts = ["0", ...(await db.getContract0200ContractIdByTokenId("0"))];
  console.log({ nts });
  const decA = tokA === "0" ? 6 : tokenA?.decimals || 0
  const decB = tokB === "0" ? 6 : tokenB?.decimals || 0
  // for each event, record a transaction in the database
  for await (const event of events) {
    await f(event);
    continue;
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
    console.log({ ratio, whichToken, tokA, tokB, decA, decB, tokenA, tokenB, balABn, balBBn });
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
    await saveEvents(contractId, swapEvents, (e) => {
	const dexSwapEvent = {
		contractId,
        	transactionId: e.txId,
        	timestamp: e.ts,
        	round: e.round,
        	inBalA: e.inBals.A,
        	inBalB: e.inBals.B,
        	outBalA: e.outBals.A,
        	outBalB: e.outBals.B,
        	poolBalA: e.poolBals.A,
        	poolBalB: e.poolBals.B
	}
	db.insertEventDexSwap(dexSwapEvent);
    })
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
  const { name, symbol: tokenSymbol, totalSupply, decimals } = await getMetadata(
    ci,
    contractId
  );

  // get application info from indexer
  const app = await indexerClient.lookupApplications(contractId).do();
  const globalState = app.application.params["global-state"];

  console.log(globalState);

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
    console.log(info);
    const { tokA, tokB, poolBals, lptBals } = info;
    const { A: poolBalA, B: poolBalB } = poolBals;
    const { lpMinted: supply } = lptBals

    // update pool bals (just poolBals and tvl);
    do {
    const tokAId = String(tokA);
    const tokBId = String(tokB);
    const providerId = "01";
    const tokenA = await db.getContract0200ById(tokAId)
    const tokenB = await db.getContract0200ById(tokBId)
    console.log({ tokenA, tokenB });
    if(!tokenA || !tokenB || poolBalA === "0" || poolBalB === "0") break;
    const symbolA = symbol(tokenA);
    const symbolB = symbol(tokenB);
    const priceABn = new BigNumber(tokenA?.price || "0");
    const priceBBn = new BigNumber(tokenB?.price || "0");
    const poolBalABn = new BigNumber(poolBalA).dividedBy(new BigNumber(10).pow(tokenA.decimals))
    const poolBalBBn = new BigNumber(poolBalB).dividedBy(new BigNumber(10).pow(tokenB.decimals))
    const poolBalAN = poolBalABn.toFixed(tokenA.decimals);
    const poolBalBN = poolBalBBn.toFixed(tokenB.decimals);
    const tvlA = poolBalABn.multipliedBy(priceABn)
    const tvlB = poolBalBBn.multipliedBy(priceBBn)
    // get volumes
    const volumes = await db.getPoolVolume(contractId, getTimestampOneWeekBefore());
    const inBalABn = volumes
	    ? new BigNumber(volumes.volA).dividedBy(new BigNumber(10).pow(tokenA.decimals))
	    : new BigNumber(0);
    const inBalBBn = volumes
            ? new BigNumber(volumes.volB).dividedBy(new BigNumber(10).pow(tokenB.decimals))
            : new BigNumber(0);
    const volA = inBalABn.multipliedBy(priceABn)
    const volB = inBalBBn.multipliedBy(priceBBn)
    // calculate apr
    const vol = volA.plus(volB);
    const tvl = tvlA.plus(tvlB);
    const weeklyFees = vol.multipliedBy(new BigNumber(30)).dividedBy(new BigNumber(10000)) // using 0.3% fee
    const fees = weeklyFees.multipliedBy(52); // annualized
    const apr = fees.dividedBy(tvl).multipliedBy(new BigNumber(100)).toFixed(2);
    // get supply
    const supplyBn = new BigNumber(supply).dividedBy(new BigNumber(10).pow(6))
    // update pool
    const poolBalsUpdate = { 
	    contractId, 
	    tokAId, 
	    tokBId, 
	    poolBalA: poolBalAN, 
	    poolBalB: poolBalBN, 
	    tvlA: tvlA.toFixed(6),
	    tvlB: tvlB.toFixed(6),
	    symbolA, 
	    symbolB, 
	    providerId, 
	    poolId: poolId(tokenA, tokenB),
	    volA: volA.toFixed(6),
	    volB: volB.toFixed(6),
	    apr,
	    supply: supplyBn.toFixed(6)
    }
    console.log(`Updating pool bals for contract ${contractId}`);
    console.log({poolBalsUpdate});
    await db.insertOrUpdatePool(poolBalsUpdate)
    } while(0);

    // update contract tokens
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
      const decA = (await makeContract(tokA, abi.arc200).arc200_decimals())
        .returnValue;
      const decB = (await makeContract(tokB, abi.arc200).arc200_decimals())
        .returnValue;
      const { A: balA, B: balB } = poolBals;
      // update price
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
    return null;
  }
  const token = {
    contractId,
    name: prepareString(name),
    symbol: prepareString(tokenSymbol),
    decimals: Number(decimals),
    totalSupply: String(totalSupply),
    createRound,
    creator,
    tokenId
  }
  console.log({token});
  return token;
};

// update lastSyncRound in collections table
const updateLastSync = async (contractId, round) => {
  await db.updateContract0200LastSync(contractId, round);
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
    console.log({ lastSyncRound });
    console.log(`Adding new contract ${contractId} to tokens table`);

    const token = await getToken(ci, contractId);
    if(token) {
    	await db.insertOrUpdateContract0200(token);
   	console.log(
    	  `Minted token ${contractId} by ${token.creator} on round ${round}`
    	);
	await db.insertOrUpdateContractStub({ contractId, hash: app.appApprovalHash, creator: app.creator, active: 0 });
    } else {
	await db.insertOrUpdateContractStub({ contractId, hash: app.appApprovalHash, creator: app.creator, active: 0 });
    }
  } else {
    lastSyncRound = await db.getContract0200LastSync(contractId);
    console.log({ lastSyncRound });
    await db.insertOrUpdateContractStub({ contractId, hash: "", creator: "", active: 1 });
    console.log(`Updating contract ${contractId} in tokens table`);
    const token = await getToken(ci, contractId);
    console.log({ token });
    await db.insertOrUpdateContract0200(token); // ideally we would not need this
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
