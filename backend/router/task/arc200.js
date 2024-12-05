import algosdk from "algosdk";
import { CONTRACT, abi } from "ulujs";
import {
  algodClient,
  indexerClient,
  db,
  prepareString,
} from "../../utils.js";
import { ZERO_ADDRESS } from "../../constants.js";
import axios from "axios";

// makeContract
//  - returns contract instance
const makeContract = (contractId, spec) =>
  new CONTRACT(contractId, algodClient, indexerClient, spec);

// From, To, Amt
const getTransferEvent = (event) => {
  const [transactionId, round, timestamp, from, to, amount] = event;
  return {
    transactionId,
    round,
    timestamp,
    from,
    to,
    amount: String(amount),
  };
};

// Owner, Spender, Amt
const getApprovalEvent = (event) => {
  const [transactionId, round, timestamp, from, to, amount] = event;
  return {
    transactionId,
    round,
    timestamp,
    from,
    to,
    amount: String(amount),
  };
};

// getMetadata
//  - returns metadata for token
export const getMetadata = async (ci, contractId) => {
  // get application info from read-only functions
  const name = (await ci.arc200_name()).returnValue;
  const symbol = (await ci.arc200_symbol()).returnValue;
  const totalSupply = (await ci.arc200_totalSupply()).returnValue;
  const decimals = (await ci.arc200_decimals()).returnValue;
  return {
    name,
    symbol,
    totalSupply,
    decimals,
  };
};

// getToken
//  - returns token object and updates stored token
const getToken = async (ci, contractId) => {
  const { name, symbol, totalSupply, decimals } = await getMetadata(
    ci,
    contractId
  );
  // get application info from indexer
  const app = await indexerClient.lookupApplications(contractId).do();
  console.log(app);
  const creator = app.application.params.creator;
  const createRound = app.application["created-at-round"];
  const accountAssets = await indexerClient
    .lookupAccountAssets(algosdk.getApplicationAddress(contractId))
    .do();
  // check if wrapped network token
  //   wVOI has a method called circulatingSupply
  // TODO get from ulujs abi
  const ciNT200 = makeContract(contractId, {
    name: "",
    desc: "",
    methods: [
      {
        name: "circulatingSupply",
        args: [],
        returns: {
          type: "uint256",
        },
      },
    ],
    events: [],
  });
  const circulatingSupplyR = await ciNT200.circulatingSupply();
  const iswNT = circulatingSupplyR.success && accountAssets.assets.length === 0;

  let tokenId = null;
  // case: wVOI
  if (iswNT) {
    tokenId = "0";
    const price = "1.000000";
    console.log(`Adding contract token ${contractId} ${tokenId}`);
    await db.insertContractToken0200({
      contractId: String(contractId),
      tokenId: String(tokenId),
    });
    console.log(`Updating price ${contractId} ${price}`);
    await db.insertOrUpdatePrice0200({
      contractId: String(contractId),
      price: String(price),
    });
  }
  // case: wVSA or other
  else if (accountAssets.assets.length > 0) {
    const tokenIds = accountAssets.assets.map((el) => String(el["asset-id"]));
    tokenId = tokenIds.join(",");
    for (const tokenId of tokenIds) {
      console.log(`Adding contract token ${contractId} ${tokenId}`);
      await db.insertContractToken0200({
        contractId: String(contractId),
        tokenId: String(tokenId),
      });
    }
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

const onMint = async (ci, event) => {
  const contractId = ci.getContractId();
  const { round, timestamp, to } = getTransferEvent(event);
  const token = await getToken(ci, contractId);
  console.log({token});
  await db.insertOrUpdateAccountBalance0200({
    contractId: String(contractId),
    accountId: to,
    balance: token.totalSupply,
  });
  await db.insertOrUpdateContract0200(token);
  console.log(`Minted token ${contractId} by ${to} on round ${round}`);
};

const onAssetTransfer = async (ci, event) => {
  const contractId = String(ci.getContractId());
  const { to, from } = getTransferEvent(event);
  const balanceTo = String((await ci.arc200_balanceOf(to)).returnValue);
  const balanceFrom = String((await ci.arc200_balanceOf(from)).returnValue);
  await db.insertOrUpdateAccountBalance0200({
    contractId,
    accountId: from,
    balance: balanceFrom,
  });
  await db.insertOrUpdateAccountBalance0200({
    contractId,
    accountId: to,
    balance: balanceTo,
  });
  console.log(
    `[${contractId}] Updated balance of ${from} to ${balanceFrom}`,
    `[${contractId}] Updated balance of ${to} to ${balanceTo}`
  );
};

const saveTransaction = async (ci, event) => {
  const contractId = ci.getContractId();
  const { transactionId, round, timestamp, to, from, amount } =
    getTransferEvent(event);
  await db.insertTransfer0200({
    contractId,
    transactionId,
    round,
    timestamp,
    sender: from,
    receiver: to,
    amount,
  });
};

export const onTransfer = async (ci, events) => {
  const contractId = ci.getContractId();
  const transferEvents = events.find(
    (el) => el.name === "arc200_Transfer"
  ).events;
  console.log(
    `Processing ${transferEvents.length} arc200_Transfer events for contract ${contractId}`
  );
  // for each event, record a transaction in the database
  for await (const event of transferEvents) {
    const { transactionId, round, timestamp, from, to, amount } =
      getTransferEvent(event);
    console.log({
      transactionId,
      round,
      timestamp,
      from,
      to,
      amount,
    });
    if (from == ZERO_ADDRESS) {
      await onMint(ci, event);
    } else {
      await onAssetTransfer(ci, event);
    }
    await saveTransaction(ci, event);
  }
};

export const onApproval = async (ci, events) => {
  const contractId = ci.getContractId();
  const approvalEvents = events.find(
    (el) => el.name === "arc200_Approval"
  ).events;
  console.log(
    `Processing ${approvalEvents.length} arc200_Approval events for contract ${contractId}`
  );
  for await (const event of approvalEvents) {
    const { transactionId, round, timestamp, from, to, amount } =
      getApprovalEvent(event);
    await db.insertOrUpdateAccountApproval0200({
      contractId,
      owner: from,
      spender: to,
      approval: amount,
    });
    console.log(`[${contractId}] Updated approval${from}:${to} to ${amount}`);
    db.insertApproval0200({
      contractId,
      transactionId,
      round,
      timestamp,
      owner: from,
      spender: to,
      approval: amount,
    });
  }
};

// TODO add support for arc72_ApprovalForAll

const updateLastSync = async (contractId, round) => {
  // update lastSyncRound in collections table
  await db.updateContract0200LastSync(contractId, Number(round));
  console.log(`Updated lastSyncRound for contract ${contractId} to ${round}`);
};

const doIndex = async (app, round) => {
  const contractId = app.apid;
  const ci = makeContract(contractId, abi.arc200);
  let lastSyncRound;
  if (app.isDelete) {
    await db.softDeleteContract0200(contractId)
  } else if (app.isCreate) {
    lastSyncRound = round;
    console.log({lastSyncRound});
    console.log(`Adding new contract ${contractId} to tokens table`);
    const token = await getToken(ci, contractId);
    await db.insertOrUpdateContract0200(token);
    console.log(
      `Minted token ${contractId} by ${token.creator} on round ${round}`
    );
    await db.insertOrUpdateContractStub({ contractId, hash: app.appApprovalHash, creator: app.creator, active: 0 });
  } else {
    const stubUpdate = { contractId, hash: "", creator: "", active: 1 };
    await db.insertOrUpdateContractStub(stubUpdate);
    lastSyncRound = (await db.getContract0200LastSync(contractId)) ?? 0;
    lastSyncRound = round;
    console.log(`Updating contract ${contractId} in tokens table`);
    const token = await getToken(ci, contractId); 
    await db.insertOrUpdateContract0200(token); // ideally we would not need this step
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
    await updateLastSync(contractId, round);
  }
};

export default doIndex;
