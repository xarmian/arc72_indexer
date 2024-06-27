import axios from "axios";
import algosdk from "algosdk";
import { CONTRACT, abi } from "ulujs";
import { db, algodClient, indexerClient } from "../backend/utils.js";

async function sha256(message) {
    // Encode the message as a Uint8Array
    const msgBuffer = new TextEncoder().encode(message);

    // Hash the message
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);

    // Convert the ArrayBuffer to a hex string
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    return hashHex;
}


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
	//const contractId = 48703447;
        //const symbol = "UNIT";
	//continue;
	const ci = new CONTRACT(Number(contractId), algodClient, indexerClient, abi.arc200);

	let type = 0;

        const boxName = new Set();
        let next;
        do {
		const {
			data
		} = await axios.get("https://testnet-idx.voi.nodly.io/v2/applications/"+contractId+"/boxes", {
			params: {
				next
			}
		})
		const boxes = data.boxes;
		boxes.forEach((el) => {
			boxName.add(el.name)
			const bytes = new Uint8Array(Buffer.from(el.name, "base64"))
			if(bytes.length === 33) {
				type = 1;
			}
		});
		next = data["next-token"];
	} while (next);
	
	console.log(boxName.size, contractId, symbol, type);

	//continue;
 	for(const b of boxName) {
		// nomadarc200
		if(type === 0) {
			const mAccount = new Uint8Array(Buffer.from(b, "base64"))
			if(mAccount.length != 32) continue;
			const addr = algosdk.encodeAddress(mAccount);
			const arc200_balanceOfR = await ci.arc200_balanceOf(addr);
                	if(!arc200_balanceOfR.success) {
                                console.log("Something wrong happened. Abort!")
                                process.exit(1);
                	}
			const arc200_balanceOf = String(arc200_balanceOfR.returnValue);
                	console.log(contractId, addr, arc200_balanceOf)
			await db.insertOrUpdateAccountBalance0200({
                                accountId: addr,
                                contractId,
                                balance: arc200_balanceOf
                	})
		} 
		// openarc200
		else if(type === 1) {
			const mAccount = new Uint8Array(Buffer.from(b, "base64"))
                	if(mAccount.length == 33) {
                        	const addr = algosdk.encodeAddress(mAccount.slice(1))
                        	const arc200_balanceOfR = await ci.arc200_balanceOf(addr);
                        	if(!arc200_balanceOfR.success) {
                        	        console.log("Something wrong happened!")
                               		process.exit(1);
                        	}
                        	const arc200_balanceOf = String(arc200_balanceOfR.returnValue);
                        	console.log(contractId, addr, arc200_balanceOf)
                        	await db.insertOrUpdateAccountBalance0200({
                                	accountId: addr,
                                	contractId,
                                	balance: arc200_balanceOf
                        	})
                	} 
		}

	}
        //process.exit(0);
}

