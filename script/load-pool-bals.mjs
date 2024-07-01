import axios from "axios";
import algosdk from "algosdk";
import { CONTRACT, swap } from "ulujs";
import { db, algodClient, indexerClient } from "../backend/utils.js";
import { BigNumber } from "bignumber.js";


const nts = await db.getContract0200ContractIdByTokenId('0');

const tokenId = (token) => nts.includes(token.contractId) ? 0 : Number(token.contractId);
const symbol = (token) => nts.includes(token.contractId) ? "VOI" : token.symbol;
const poolId = (tokenA, tokenB) => ((tokA, tokB) => tokA > tokB ? `${tokB}-${tokA}` : `${tokA}-${tokB}`)(tokenId(tokenA),tokenId(tokenB));

const tokens = await db.getContracts0200();

for(const token of tokens) {
	const { symbol: lptSymbol, contractId } = token;
	if(lptSymbol !== "ARC200LT") continue;
	const ci = new swap(Number(contractId), algodClient, indexerClient);
	const infoR = await ci.Info();
	if(!infoR.success) continue;
	const info = infoR.returnValue;
	const { poolBals, tokA, tokB } = info;
	const { A: poolBalA, B: poolBalB } = poolBals;
	if(poolBalA === '0' || poolBalB === '0') continue;
	const tokAId = String(tokA);
	const tokBId = String(tokB);
	const providerId = "01";
	const tokenA = await db.getContract0200ById(tokAId)
	const tokenB = await db.getContract0200ById(tokBId)
	const symbolA = symbol(tokenA);
	const symbolB = symbol(tokenB);
	const priceABn = new BigNumber(tokenA?.price || "0");
	const priceBBn = new BigNumber(tokenB?.price || "0");
	const poolBalABn = new BigNumber(poolBalA).dividedBy(new BigNumber(10).pow(tokenA.decimals))
	const poolBalBBn = new BigNumber(poolBalB).dividedBy(new BigNumber(10).pow(tokenB.decimals))
	const poolBalAN = poolBalABn.toFixed(tokenA.decimals);
	const poolBalBN = poolBalBBn.toFixed(tokenB.decimals);
	const tvlA = poolBalABn.multipliedBy(priceABn).toFixed(12);
	const tvlB = poolBalBBn.multipliedBy(priceBBn).toFixed(12);
	const poolBalsUpdate = { contractId, tokAId, tokBId, poolBalA: poolBalAN, poolBalB: poolBalBN, tvlA, tvlB, symbolA, symbolB, providerId, poolId: poolId(tokenA, tokenB) }
	console.log({poolBalsUpdate});
	await db.insertOrUpdatePool(poolBalsUpdate);
	//break;
}

