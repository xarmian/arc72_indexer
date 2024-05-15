import algosdk from "algosdk";
import { CONTRACT, abi } from "ulujs";
import {
  algodClient,
  indexerClient,
  decodeGlobalState,
  db,
  prepareString,
} from "../../utils.js";
import { ZERO_ADDRESS } from "../../constants.js";

const makeContract = (contractId) =>
  new CONTRACT(contractId, algodClient, indexerClient, abi.arc200);

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

const getToken = async (ci, contractId) => {
  // get application info from read-only functions
  const name = (await ci.arc200_name()).returnValue;
  const symbol = (await ci.arc200_symbol()).returnValue;
  const totalSupply = (await ci.arc200_totalSupply()).returnValue;
  const decimals = (await ci.arc200_decimals()).returnValue;
  // get application info from indexer
  const app = await indexerClient.lookupApplications(contractId).do();
  const creator = app.application.params.creator;
  const createRound = app.application["created-at-round"];
  const accountAssets = await indexerClient.lookupAccountAssets(algosdk.getApplicationAddress(contractId)).do();
  const tokenId = accountAssets.assets.map(el => String(el["asset-id"])).join(",")
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

const onMint = async (ci, event) => {
  const contractId = ci.getContractId();
  const { round, to } = getTransferEvent(event);
  const token = await getToken(ci, contractId);
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

const onTransfer = async (ci, events) => {
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

const onApproval = async (ci, events) => {
  const contractId = ci.getContractId();
  const approvalEvents = events.find(
    (el) => el.name === "arc200_Approval"
  ).events;
  console.log(
    `Processing ${approvalEvents.length} arc200_Approval events for contract ${contractId}`
  );
  for await (const event of approvalEvents) {
    const {
      transactionId, round, timestamp, from, to, amount
    } = getApprovalEvent(event);
    await db.insertOrUpdateAccountApproval0200({
      contractId,
      owner: from,
      spender: to,
      amount
    });
    console.log(
    `[${contractId}] Updated approval${from}:${to} to ${amount}`
    );
    db.insertApproval0200({
      contractId,
      transactionId,
      round,
      timestamp,
      owner: from,
      spender: to,
      amount,
    })
  }
};

// TODO add support for arc72_ApprovalForAll

const updateLastSync = async (contractId, round) => {
  // update lastSyncRound in collections table
  //await db.updateCollectionLastSync(contractId, round);
  console.log(`Updated lastSyncRound for contract ${contractId} to ${round}`);
};

const doIndex = async (app, round) => {
  const contractId = app.apid;
  const ci = makeContract(contractId);
  let lastSyncRound;
  if (app.isCreate) {
    lastSyncRound = round;
    console.log(`Adding new contract ${contractId} to tokens table`);
    const token = await getToken(ci, contractId);
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
    // TODO add support for arc72_ApprovalForAll
    await updateLastSync(contractId, round);
  }
};
export default doIndex;
