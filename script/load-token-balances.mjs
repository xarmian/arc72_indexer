import axios from "axios";
import algosdk from "algosdk";
import { CONTRACT, abi } from "ulujs";
import { db, algodClient, indexerClient } from "../backend/utils.js";

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

const tokens = await db.getContracts0200();

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

