import { arc72 as Contract } from "ulujs";
import { algodClient, indexerClient } from "../../utils.js";
import { ZERO_ADDRESS } from "../../constants.js";
import Database from "../../database.js";

const DB_PATH = process.env.DB_PATH || "../../../db/db.sqlite";
const db = new Database(DB_PATH);

const makeContract = (contractId) =>
  new Contract(contractId, algodClient, indexerClient);

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

const onMint = async (ci, event) => {
  const contractId = ci.getContractId();
  const { round, to, tokenId } = getTransferEvent(event);
  const tokenIndex = 0;
  const owner = to;
  const metadataURI = (await ci.arc72_tokenURI(tokenId)).returnValue; // TODO strip null bytes ???
  const metadata = JSON.stringify(
    await fetch(metadataURI).then((res) => res.json())
  );
  const totalSupply = (await ci.arc72_totalSupply()).returnValue;
  const approved = ZERO_ADDRESS;
  const mintRound = round;
  const token = {
    contractId,
    tokenId,
    tokenIndex,
    owner,
    metadataURI,
    metadata,
    approved,
    mintRound,
  };
  await db.insertOrUpdateToken(token);
  await db.updateCollectionTotalSupply(contractId, totalSupply);
  console.log(`Minted token ${tokenId} for contract ${contractId}`);
};

const onAssetTransfer = async (ci, event) => {
  const contractId = ci.getContractId();
  await db.updateTokenOwner(contractId, tokenId, to);
  // check token approval
  const approved = (await ctc.arc72_getApproved(tokenId)).returnValue ?? null;
  // TODO set approved to zero address
  await db.updateTokenApproved(contractId, tokenId, approved);
  console.log(
    `Updated token ${tokenId} owner to ${to}, approval to ${approved}`
  );
};

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

const onTransfer = async (ci, events) => {
  const transferEvents = events.find((el) => el.name === "arc72_Transfer");
  console.log(
    `Processing ${transferEvents.length} arc72_Transfer events for contract ${contractId} from round ${lastSyncRound} to ${rnd}`
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

const onApproval = async (ci, events) => {
  const approvalEvents = events.find((el) => el.name === "arc72_Approval");
  console.log(
    `Processing ${approvalEvents.length} arc72_Approval events for contract ${contractId} from round ${lastSyncRound} to ${rnd}`
  );
  // for each event, record a transaction in the database
  for await (const event of approvalEvents) {
    const { tokenId } = getApprovalEvent(event);
    const approved = (await ctc.arc72_getApproved(tokenId)).returnValue ?? null;
    await db.updateTokenApproved(contractId, tokenId, approved);
    console.log(`Updated token ${tokenId} approved to ${approved}`);
  }
};

// TODO add support for arc72_ApprovalForAll

const updateLastSync = async (contractId, round) => {
  // update lastSyncRound in collections table
  await db.updateCollectionLastSync(contractId, round);
  console.log(`Updated lastSyncRound for contract ${contractId} to ${round}`);
};

const doIndex = async (app, round) => {
  const contractId = app.apid;
  const ci = makeContract(contractId);
  let lastSyncRound;
  if (app.isCreate) {
    lastSyncRound = round;
    console.log(`Adding new contract ${contractId} to collections table`);
    const collection = await getCollection(ci, contractId);
    await db.insertOrUpdateCollection({
      ...collection,
      lastSyncRound,
    });
  } else {
    lastSyncRound = await db.getCollectionLastSync(contractId);
    console.log(`Updating contract ${contractId} in collections table`);
    const collection = await getCollection(ci, contractId);
    await db.insertOrUpdateCollection({
      ...collection,
      lastSyncRound,
    });
  }
  if (lastSyncRound <= round) {
    // get transaction history since lastSyncRound
    const events = await ci.arc72.getEvents({
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
