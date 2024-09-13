import { CONTRACT, abi } from "ulujs";
import { algodClient, indexerClient, decodeMpCurrencyData, db } from "../../utils.js";
import algosdk from "algosdk";

// TODO get this function from ulujs
// getListingEvent
//  - convert event tuple to object
const getListingEvent = (event) => {
  const [
    transactionId,
    createRound,
    createTimestamp,
    mpListingId,
    collectionId,
    tokenId,
    seller,
    currencyData,
    endTimestamp,
    royalty,
  ] = event;
  const { currency, price } = decodeMpCurrencyData(currencyData);
  const listing = {
    transactionId,
    createRound: Number(createRound),
    createTimestamp: Number(createTimestamp),
    mpListingId: Number(mpListingId),
    contractId: Number(collectionId),
    tokenId: Number(tokenId),
    seller,
    endTimestamp: Number(endTimestamp),
    royalty: Number(royalty),
    currency,
    price,
  };
  return listing;
};

// TODO get this function from ulujs
// getBuyEvent
//  - convert event tuple to object
const getBuyEvent = (event) => {
  const [transactionId, round, timestamp, listingId, buyer] = event;
  return {
    transactionId,
    round,
    timestamp,
    listingId,
    buyer,
  };
};

// TODO get this function from ulujs
// getDeleteEvent
//  - convert event tuple to object
const getDeleteEvent = (event) => {
  const [transactionId, round, timestamp, listingId] = event;
  return {
    transactionId,
    round,
    timestamp,
    listingId,
  };
};

// makeContract
//  - return marketplace contract instance
const makeContract = (contractId) =>
  new CONTRACT(contractId, algodClient, indexerClient, abi.mp)

// onListing
//  - process listing event
const onListing = async (ci, events) => {
  const contractId = ci.getContractId();
  const listEvents = events.find(el => el.name === "e_sale_ListEvent").events;
  console.log(
    `Processing ${listEvents.length} listing events for contract ${contractId}`
  );
  for await (const event of listEvents) {
    const listingEvent = getListingEvent(event);
    const listing = {
      ...listingEvent,
      mpContractId: contractId,
      sales_id: null,
      delete_id: null,
    }
    await db.insertOrUpdateMarketListing(listing)
  }
};

// onBuy
//  - process buy event
const onBuy = async (ci, events) => {
  const contractId = ci.getContractId();
  const buyEvents = events.find(el => el.name === "e_sale_BuyEvent").events;
  console.log(
    `Processing ${buyEvents.length} buy events for contract ${contractId}`
  );
  for await (const event of buyEvents) {
    const { transactionId, round, timestamp, listingId, buyer } =
      getBuyEvent(event);
    const listing = await db.getMarketListing(contractId, listingId);
    if (listing) {
      const mpSale = {
        transactionId,
        mpContractId: listing.mpContractId,
        mpListingId: listing.mpListingId,
        contractId: listing.contractId,
        tokenId: listing.tokenId,
        seller: listing.seller,
        buyer,
        currency: listing.currency,
        price: listing.price,
        round,
        timestamp
      };
      const mpListing = {
        transactionId: listing.transactionId,
        mpContractId: listing.mpContractId,
        mpListingId: listing.mpListingId,
        tokenId: listing.tokenId,
        contractId: listing.contractId,
        seller: listing.seller,
        price: listing.price,
        currency: listing.currency,
        createRound: listing.createRound,
        createTimestamp: listing.createTimestamp,
        endTimestamp: listing.endTimestamp,
        royalty: listing.royalty,
        sales_id: transactionId,
        delete_id: listing.delete_id,
      };
      await db.insertOrUpdateMarketSale(mpSale);
      await db.insertOrUpdateMarketListing(mpListing);
    } else {
      console.log(`Listing ${contractId} ${listingId} not found in database`);
    }
  }
};

// onDelete
//  - process delete event
const onDelete = async (ci, events) => {
  const contractId = ci.getContractId();
  const deleteEvents = events.find(
    el => el.name === "e_sale_DeleteListingEvent"
  ).events;
  console.log(
    `Processing ${deleteEvents.length} delete events for contract ${contractId}`
  );
  // for each event, record a transaction in the database
  for await (const event of deleteEvents) {
    const { transactionId, round, timestamp, listingId } =
      getDeleteEvent(event);
    // get market listing
    const listing = await db.getMarketListing(contractId, listingId);
    if (listing) {
      const mpDelete = {
        transactionId,
        mpContractId: listing.mpContractId,
        mpListingId: listing.mpListingId,
        contractId: listing.contractId,
        tokenId: listing.tokenId,
        owner: listing.seller,
        round,
        timestamp
      };
      const mpListing = {
        transactionId: listing.transactionId,
        mpContractId: listing.mpContractId,
        mpListingId: listing.mpListingId,
        tokenId: listing.tokenId,
        contractId: listing.contractId,
        seller: listing.seller,
        price: listing.price,
        currency: listing.currency,
        createRound: listing.createRound,
        createTimestamp: listing.createTimestamp,
        endTimestamp: listing.endTimestamp,
        royalty: listing.royalty,
        sales_id: listing.sales_id,
        delete_id: transactionId,
      };
      await db.insertOrUpdateMarketDelete(mpDelete);
      await db.insertOrUpdateMarketListing(mpListing);
    } else {
      console.log(`Listing ${contractId} ${listingId} not found in database`);
    }
  }
};

// updateLastSync
//  - update marketplace sync record
const updateLastSync = async (contractId, round) => {
  // update lastSyncRound for market
  await db.updateMarketLastSync(contractId, round);
  console.log(
    `Updated lastSyncRound for market contract ${contractId} to ${round}`
  );
};

// doIndex
//  - update marketplace info and process events
const doIndex = async (app, round) => {
  const contractId = app.apid;
  const ci = makeContract(contractId);
  let lastSyncRound;
  if (app.isCreate) {
    lastSyncRound = round;
    console.log(`Adding new contract ${contractId} to markets table in round ${round}`);
    const escrowAddr = algosdk.getApplicationAddress(Number(contractId));
    const createRound = round;
    const isBlacklisted = 0;
    const market = {
      contractId,
      escrowAddr,
      createRound,
      lastSyncRound,
      isBlacklisted,
    };
    await db.insertOrUpdateMarket(market);
  } else {
    lastSyncRound = await db.getMarketLastSync(contractId);
    console.log(
      `Updating contract ${contractId} in markets table from round ${lastSyncRound} to ${round}`
    );
    // TODO update contract in market table
  }
  if (lastSyncRound <= round) {
    const events = await ci.getEvents({
      minRound: lastSyncRound,
      maxRound: round,
    });
    await onListing(ci, events);
    await onBuy(ci, events);
    await onDelete(ci, events);
    await updateLastSync(contractId, round);
  }
};

export default doIndex;
