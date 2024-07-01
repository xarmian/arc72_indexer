import { CONTRACT, abi } from "ulujs";
import {
  algodClient,
  indexerClient,
  decodeGlobalState,
  db,
} from "../../utils.js";
import { ZERO_ADDRESS } from "../../constants.js";

// makeContract
//  - returns arc72 contract instance
const makeContract = (contractId) =>
  new CONTRACT(contractId, algodClient, indexerClient, abi.arc72);

// getTransferEvent
//  - convert event tuple to object
const getTransferEvent = (event) => {
  const [transactionId, round, timestamp, from, to, tokenId] = event;
  return {
    transactionId,
    round,
    timestamp,
    from,
    to,
    tokenId,
  };
};

// getApprovalEvent
//  - convert event tuple to object
const getApprovalEvent = (event) => {
  const [transactionId, round, timestamp, from, to, tokenId] = event;
  return {
    transactionId,
    round,
    timestamp,
    from,
    to,
    tokenId,
  };
};

// getCollection
// - returns collection with updated total supply and global state if any
const getCollection = async (ci, contractId) => {
  // get application info from read-only functions
  const totalSupply = (await ci.arc72_totalSupply()).returnValue;
  // get application info from indexer
  const app = await indexerClient.lookupApplications(contractId).do();
  const creator = app.application.params.creator;
  const createRound = app.application["created-at-round"];
  const globalState = app.application.params["global-state"];
  const decodedState = JSON.stringify(decodeGlobalState(globalState));
  return {
    contractId,
    totalSupply,
    createRound,
    creator,
    globalState: decodedState,
  };
};

// onMint
//  - asset is minted, update token and collection
const onMint = async (ci, event) => {
  const contractId = ci.getContractId();
  const { round, to, tokenId } = getTransferEvent(event);
  const tokenIndex = 0; // not sure what this does
  const owner = to;

  // metadataURI could be undefined
  const metadataURI = (await ci.arc72_tokenURI(tokenId)).returnValue; // TODO strip null bytes ???
  console.log({metadataURI})

  const metadata = metadataURI ? await fetch(metadataURI).then((res) => res.json()).catch(() => {}) || "{}" : "{}";
  console.log({metadata})
  
  const totalSupply = (await ci.arc72_totalSupply()).returnValue;
  const approved = ZERO_ADDRESS;
  const mintRound = round;
  const token = {
    contractId,
    tokenId,
    tokenIndex,
    owner,
    metadataURI,
    metadata: JSON.stringify(metadata),
    approved,
    mintRound,
  };
  await db.insertOrUpdateToken(token);
  await db.updateCollectionTotalSupply(contractId, totalSupply);
  console.log(`Minted token ${tokenId} for contract ${contractId}`);
};

// onAssetTransfer
//  - not a mint, do least amount of work
const onAssetTransfer = async (ci, event) => {
  const contractId = ci.getContractId();
  const { tokenId, to } = getTransferEvent(event);
  await db.updateTokenOwner(contractId, tokenId, to);
  // check token approval
  //const approved = (await ci.arc72_getApproved(tokenId)).returnValue ?? null;
  const approved = ZERO_ADDRESS; // on asset transfer approved should be reset
  await db.updateTokenApproved(contractId, tokenId, approved);
  console.log(
    `Updated token ${tokenId} owner to ${to}, approval to ${approved}`
  );
};

// saveTransaction
//  - save transfer event as is
const saveTransaction = async (ci, event) => {
  const contractId = ci.getContractId();
  const { transactionId, round, timestamp, from, to, tokenId } =
    getTransferEvent(event);
  await db.insertTransaction({
    transactionId,
    contractId,
    tokenId,
    round,
    fromAddr: from,
    toAddr: to,
    timestamp,
  });
};

// onTransfer
//  - update owner, approved, and save transaction
const onTransfer = async (ci, events) => {
  const contractId = ci.getContractId();
  const transferEvents = events.find(
    (el) => el.name === "arc72_Transfer"
  ).events;
  console.log(
    `Processing ${transferEvents.length} arc72_Transfer events for contract ${contractId}`
  );
  // for each event, record a transaction in the database
  for await (const event of transferEvents) {
    const { from } = getTransferEvent(event);
    if (from == ZERO_ADDRESS) {
      await onMint(ci, event);
    } else {
      await onAssetTransfer(ci, event);
    }
    await saveTransaction(ci, event);
  }
};

// onApproval
//  - set approval for each approval event
const onApproval = async (ci, events) => {
  const contractId = ci.getContractId();
  const approvalEvents = events.find(
    (el) => el.name === "arc72_Approval"
  ).events;
  console.log(
    `Processing ${approvalEvents.length} arc72_Approval events for contract ${contractId}`
  );
  // for each event, record a transaction in the database
  for await (const event of approvalEvents) {
    const { tokenId } = getApprovalEvent(event);
    const approved = (await ci.arc72_getApproved(tokenId)).returnValue ?? null;
    await db.updateTokenApproved(contractId, tokenId, approved);
    console.log(`Updated token ${tokenId} approved to ${approved}`);
  }
};

// TODO add support for arc72_ApprovalForAll

// updateLastSync
//  - update lastSyncRound in collections table
const updateLastSync = async (contractId, round) => {
  await db.updateCollectionLastSync(contractId, round);
  console.log(`Updated lastSyncRound for contract ${contractId} to ${round}`);
};

// doIndex
//  - updates collection info and transactin history
// precondition:
//  - contract is arc72 contract
// postcondition:
//  - update stored collection immutable properties
const doIndex = async (app, round) => {
  const contractId = app.apid;
  const ci = makeContract(contractId);
  let lastSyncRound;
  if (app.isCreate) {
    lastSyncRound = round;
    console.log(`Adding new contract ${contractId} to collections table`);
  } else {
    lastSyncRound = await db.getCollectionLastSync(contractId);
    console.log(`Updating contract ${contractId} in collections table`);
  }
  // following block mostly for retrieving mutable attibutes of collection namely:
  // - total supply
  //     total supply can be computed by adding tokens sent to and from zero address
  // - decoded state
  //     global state of collection (mutable + immutable)
  const collection = await getCollection(ci, contractId);
  await db.insertOrUpdateCollection({
    ...collection,
    lastSyncRound,
  });
  // get transaction history since lastSyncRound
  if (lastSyncRound <= round) {
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
