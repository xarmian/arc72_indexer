import { arc72 as Contract } from "ulujs";
import { algodClient, indexerClient } from "./utils.js";

const makeContract = (contractId) =>
  new Contract(contractId, algodClient, indexerClient);

const getCollection = async (contractId) => {
  const ci = makeContract(contractId);
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

const doIndex = async (app, round) => {
  const contractId = app.apid;
  if (app.isCreate) {
    const lastSyncRound = round;
    console.log(`Adding new contract ${contractId} to collections table`);
    const collection = await getCollection(contractId);
    await db.insertOrUpdateCollection({
      ...collection,
      lastSyncRound,
    });
  } else {
    const lastSyncRound = await db.getCollectionLastSync(contractId);
    if (lastSyncRound == 0) {
      console.log(
        `\nContract ${contractId} not found in collections table, skipping`
      );
    }
    console.log(`Updating contract ${contractId} in collections table`);
    const collection = await getCollection(contractId);
    await db.insertOrUpdateCollection({
      ...collection,
      lastSyncRound,
    });
    await db.insertOrUpdateCollection(collection);
  }
};
export default doIndex;
