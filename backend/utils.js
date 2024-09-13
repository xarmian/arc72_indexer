import algosdk from "algosdk";
import readline from "readline";
import crypto from "crypto";
import { CONTRACT, abi, swap } from "ulujs";
import {
    CONTRACT_TYPE_UNKNOWN,
    CONTRACT_TYPE_ARC72,
    CONTRACT_TYPE_ARC200,
    CONTRACT_TYPE_MP,
    CONTRACT_TYPE_LPT,
    CONTRACT_TYPE_STAKE,
    CONTRACT_TYPE_SCS,
} from "./constants.js";
import Database from "./database.js";
import dotenv from "dotenv";
dotenv.config();

// create a SHA-256 hash
function createHash(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

const {
    ALGOD_TOKEN = "",
    ALGOD_HOST = "https://testnet-api.voi.nodly.io",
    ALGOD_PORT = "443",

    INDEXER_TOKEN = "",
    INDEXER_HOST = "https://testnet-idx.voi.nodly.io",
    INDEXER_PORT = "443",
} = process.env;

export const algodClient = new algosdk.Algodv2(
    { "X-Algo-API-Token": ALGOD_TOKEN },
    ALGOD_HOST,
    ALGOD_PORT
);
export const indexerClient = new algosdk.Indexer(
    INDEXER_TOKEN,
    INDEXER_HOST,
    INDEXER_PORT
);

const DB_PATH = process.env.DB_PATH || "../db/db.sqlite";

export const db = new Database(DB_PATH);

export const trim = (str) => str.replace(/\0/g, "");

export const prepareString = (str) => {
  const index = str.indexOf("\x00");
  if (index > 0) {
    return str.slice(0, str.indexOf("\x00"));
  } else {
    return str;
  }
};

// function to convert hex to bytes, modeled after ethers arrayify function
export function bytesFromHex(hex) {
    hex = hex.replace(/^0x/i, "");
    hex = hex.length % 2 ? "0" + hex : hex;
    return Buffer.from(hex, "hex");
}

const INTERFACE_SELECTOR_ARC72 = "0x4e22a3ba";
const INTERFACE_SELECTOR_MP = "0xae4d14ad";
const INTERFACE_SELECTOR_ARC200 = "0xc7bea040";

async function isSupported(contractId, interfaceSelector) {
    try {
	const makeABI = (method) => ({
            name: "",
            desc: "",
            methods: [method],
            events: [],
        })
        const ci = new CONTRACT(contractId, algodClient, indexerClient, makeABI(
                {
                    name: "supportsInterface",
                    args: [{ type: "byte[4]" }],
                    returns: { type: "bool" },
                    readonly: true,
                }
	))
	const ci2 = new CONTRACT(contractId, algodClient, indexerClient, makeABI(
        	{
                    name: "supportsInterface",
                    args: [{ type: "byte[4]" }],
                    returns: { type: "byte" },
                    readonly: true,
                }
        ))
        const sim = await ci.supportsInterface(bytesFromHex(interfaceSelector));
        const sim2 = await ci2.supportsInterface(bytesFromHex(interfaceSelector));
        if (sim.success || sim2.success) {
            return sim.returnValue;
        }
        return false;
    } catch (err) {
        return false;
    }
}

export async function isSCS(contractId, app) {
	const exists = await db.scsExists(contractId);
	if(!exists) {
		const {
			globalStateSchema,
			globalStateDelta,
		} = app;
		const keys = globalStateDelta?.map(el => el.key) || [];
		return (
			// check schema
			app.isCreate &&
			//'num-byte-slice' in globalStateSchema &&
			//'num-uint' in globalStateSchema &&
			//globalStateSchema['num-byte-slice'] === 2 &&
			//globalStateSchema['num-uint'] === 7 &&
			// TODO maybe require global schema larger than base
			// check keys
			[
				'b3duZXI=', // owner
				'ZGVsZWdhdGU=', // delegate
				'Y29udHJhY3RfdmVyc2lvbg==', // contract_version
				'ZGVwbG95bWVudF92ZXJzaW9u', // deployment version
				'bWVzc2VuZ2VyX2lk', // messenger_id
				'cGFyZW50X2lk', // parent_id
				'c3Rha2VhYmxl', // stakeable
				'dXBkYXRhYmxl', // updatable
			].every(key => keys.includes(key))
			// TODO maybe use to flag conctract as airdrop
			// optionals (Airdrop-only)
			//   period_limit cGVyaW9kX2xpbWl0
			//   period_seconds cGVyaW9kX3NlY29uZHM=
			//   funder ZnVuZGVy
			//   funding ZnVuZGluZw==
			//   period cGVyaW9k
			//   total dG90YWw=
			//   lockup_delay bG9ja3VwX2RlbGF5
			//   vesting_delay dmVzdGluZ19kZWxheQ==
			//   initial
			//   deadline
			// check initial state 
		);
	}
	return true;
}

export async function isStake(contractId) {
	const stakeExists = await db.stakeExists(contractId);
	return stakeExists;
}

export async function isARC72(contractId) {
    return isSupported(contractId, INTERFACE_SELECTOR_ARC72);
}

export async function isMP(contractId) {
    return isSupported(contractId, INTERFACE_SELECTOR_MP);
}

export async function isARC200(contractId) {
     //const res2 = await isSupported(contractId, INTERFACE_SELECTOR_ARC200);
     //console.log(res2)
     try {
         const ci = new CONTRACT(contractId, algodClient, indexerClient, abi.arc200);
         const res = await ci.arc200_name();
         if (res.success) {
             return true;
         }
         return false;
     } catch (err) {
         console.log(err);
         return false;
     }
}

export async function isLPT(contractId) {
  const accountAssets = await indexerClient.lookupAccountAssets(algosdk.getApplicationAddress(contractId)).do();
  const app = await indexerClient.lookupApplications(contractId).do();
  const appGlobalState = app.application.params["global-state"];
  const ciSwap = new swap(contractId, algodClient, indexerClient)
  const infoR = await ciSwap.Info();
  const isARC200LT = infoR.success;
  /*
  const isLPT = appGlobalState.find(el => el.key === "cmF0aW8=" ) &&  // ratio
		!appGlobalState.find(el => el.key === "dG9rZW5feV9hcHBfaWQ=") &&  // token_y_app_id
		accountAssets.assets.length === 0;
  */
  const isLPT = false;
  if(isARC200LT || isLPT) return true;
  return false;
}

// TODO support multiple contract types
//      for example if what-if a contract is an arc72 and an arc200
export async function getContractType(app) {
    const contract = app.apid; // contractid
    const hash = app.appApprovalHash; // 256hash of approval program
    console.log({hash,app});
    // check appApproval hash
    // check db or global state delta
    // check only db
    // check simulate supportsInterface
    // check simulate other
    if(hash === "f0800159ade5b919904b6878670570683990aea35dd73af2ac2cba8e44b0b54f") return CONTRACT_TYPE_LPT; // ARC200LP 
    if(hash === "e80b280db0d1ae7ee02c5138235a7ceb9ca3817bcd1c254ccc3693e6646e7ab6") return CONTRACT_TYPE_LPT; // ARC200LP 
    else if (await isSCS(contract, app)) return CONTRACT_TYPE_SCS;
    else if (await isStake(contract)) return CONTRACT_TYPE_STAKE;
    else if (await isARC72(contract)) return CONTRACT_TYPE_ARC72;
    else if (await isMP(contract)) return CONTRACT_TYPE_MP;
    else if (await isARC200(contract)) {
        if(await isLPT(contract)) { 
            return CONTRACT_TYPE_LPT; // LPT|ARC200LP
        }
        return CONTRACT_TYPE_ARC200;
    }
    return CONTRACT_TYPE_UNKNOWN;
}

export async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function output(msg, clear = false) {
    if (process.env.DOCKER_MODE && process.env.DOCKER_MODE === "true") {
        console.log(msg);
    } else {
        if (clear) {
            readline.clearLine(process.stdout, 0);
        }
        process.stdout.write(msg);
    }
}

// return all app ids involved in a block of transactions (blk.block.txns)
export function getAllAppIds(txns) {
    let apps = [];
    if (txns === undefined) return apps;
    for (const t of txns) {
        if (t.apid || t.txn?.apid) {
            apps.push({
                apid: t.apid ?? t.txn.apid,
                isCreate: t.txn.apap && t.txn.apsu ? true : false,
            });
        }
        if (t.dt?.itx) apps = apps.concat(getAllAppIds(t.dt.itx));
    }
    return apps;
}

export function getAllAppIdsIdx(txns) {
    let apps = [];
    if (txns === undefined) return apps;
    for (const t of txns) {
        if (t["created-application-index"]) {
	    console.log(t);
            apps.push({
                apid: t["created-application-index"],
                isCreate: true,
		appApproval: t["application-transaction"]["approval-program"],
		appApprovalHash: createHash(t["application-transaction"]["approval-program"]),
		creator: t.sender,
		globalStateSchema: t["application-transaction"]["global-state-schema"],
		globalStateDelta: t['global-state-delta'],
		sender: t.sender
            });
        } else if (t["application-transaction"]) {
	    console.log(t);
            apps.push({
                apid: t["application-transaction"]["application-id"],
                isCreate: t["on-completion"] === 0 ? true : false,
		globalStateDelta: t['global-state-delta'],
                appArgs: t["application-transaction"]["application-args"],
		sender: t.sender,
		innerTxns: t["inner-txns"]
            });
        }
        if (t["inner-txns"]) apps = apps.concat(getAllAppIdsIdx(t["inner-txns"]));
    }

    // return array of unique apps objects { apid: number, isCreate: boolean }
    return apps.filter((v, i, a) => a.findIndex((t) => t.apid === v.apid) === i);
    // removed filter above because if a create is followed by a method call in an inner txns such
    // as in the case of a factory deployment the method call will be ignored
}

export const decodeGlobalState = (globalState) => {
    const decodedState = globalState.map((state) => {
        const key = Buffer.from(state.key, "base64").toString(); // Decode key from base64
        let value;

        if (state.value.type === 1) {
            // first see if it's a valid address
            const b = new Uint8Array(Buffer.from(state.value.bytes, "base64"));
            value = algosdk.encodeAddress(b);

            // then decode as string
            if (!algosdk.isValidAddress(value)) {
                value = Buffer.from(state.value.bytes, "base64").toString();
            }
        } else if (state.value.type === 2) {
            // Check if the type is uint
            value = state.value.uint;
        }

        return { key, value };
    });

    return decodedState;
};

export const decodeMpCurrencyData = (currencyData) => {
    const ct = currencyData[0];
    const currency = ct == "00" ? 0 : parseInt(currencyData[1], 16);
    const price =
        ct == "00" ? Number(currencyData[1]) : parseInt(currencyData[2], 16);
    return { currency, price };
};
