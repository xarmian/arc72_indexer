import axios from "axios";
import algosdk from "algosdk";
import { CONTRACT, abi } from "ulujs";
import { db, algodClient, indexerClient } from "../backend/utils.js";

const tokens = [
	24590664, // wVOI
	34099056 // wVOI2
]

for(const token of tokens) {
	console.log(token)
	await db.updateContract0200TokenId(token, 0)
}

