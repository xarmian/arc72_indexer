import axios from "axios";
import algosdk from "algosdk";
import { CONTRACT, abi } from "ulujs";
import { db, algodClient, indexerClient } from "../backend/utils.js";


// snippet: extract address from openarc200 contract balance box

/*
const addrs = new Set()
for(const box of boxes) {
	const mAccount = new Uint8Array(Buffer.from(box.name, "base64"))
	if(mAccount.length == 33) {
		const addr = algosdk.encodeAddress(mAccount.slice(1))
		addrs.add(addr)
		console.log(addr)
	}
}
*/

// snippet: return create round for nomadex pools

/*
const tokens = (await axios.get(`https://api.nomadex.app/pools`))?.data || [];

for(const token of tokens) {
  const { pool_id: id } = token;
  const {
                data: {
			application
                }
  }= await axios.get("https://testnet-idx.voi.nodly.io/v2/applications/"+id)
  const round = application["created-at-round"];
  console.log(round);
}
*/

// snippet: updates balances for openarc200 token

/*
for(const token of tokens) {
	const { contractId, symbol } = token;
	console.log(contractId, symbol);
	const ci = new CONTRACT(Number(contractId), algodClient, indexerClient, abi.arc200);
	const {
		data: {
			boxes
		}
	}= await axios.get("https://testnet-idx.voi.nodly.io/v2/applications/"+contractId+"/boxes")
	for(const box of boxes) {
        	const mAccount = new Uint8Array(Buffer.from(box.name, "base64"))
		// TODO add support for nomadex arc200
        	if(mAccount.length == 33) {
                	const addr = algosdk.encodeAddress(mAccount.slice(1))
			const arc200_balanceOfR = await ci.arc200_balanceOf(addr);
			if(!arc200_balanceOfR.success) {
				console.log("Something wrong happened!")
				process.exit(1);
			}
			const arc200_balanceOf = String(arc200_balanceOfR.returnValue);
			console.log(contractId, addr, arc200_balanceOf)
			//break;
			await db.insertOrUpdateAccountBalance0200({
				accountId: addr,
				contractId,
				balance: arc200_balanceOf
			})
        	}
	}
}
*/
