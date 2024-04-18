import algosdk from "algosdk";
import readline from "readline";
import 'dotenv/config';
import { arc200 as a200Contract } from "ulujs";

const {
    ALGOD_TOKEN = "",
    ALGOD_HOST = "https://testnet-api.voi.nodly.io",
    ALGOD_PORT = "443",

    INDEXER_TOKEN = "",
    INDEXER_HOST = "https://testnet-idx.voi.nodly.io",
    INDEXER_PORT = "443",
} = process.env;

export const algodClient = new algosdk.Algodv2({"X-Algo-API-Token": ALGOD_TOKEN}, ALGOD_HOST, ALGOD_PORT);
export const indexerClient = new algosdk.Indexer(INDEXER_TOKEN, INDEXER_HOST, INDEXER_PORT);
export const zeroAddress = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ";
export const trim = (str) => str.replace(/\0/g, '');

// function to convert hex to bytes, modeled after ethers arrayify function
export function bytesFromHex(hex) {
    hex = hex.replace(/^0x/i, "");
    hex = hex.length % 2 ? "0" + hex : hex;
    return Buffer.from(hex, "hex");
}

export async function isARC72(contract) {
    try {
        const sim = await contract.supportsInterface(bytesFromHex("0x4e22a3ba"));
        if (sim.success) {
            return sim.returnValue;
        }
        return false;
    }
    catch(err) {
        return false;
    }
}

export async function isMP(contract) {
    try {
        const sim = await contract.supportsInterface(bytesFromHex("0xae4d14ad"));
        if (sim.success) {
            return sim.returnValue;
        }
        return false;
    }
    catch(err) {
        return false;
    }
}

export async function isARC200(contract) {
    try {
        const contractId = contract.contractInstance.contractId;
        const c = new a200Contract(contractId, algodClient, indexerClient);
        const metaData = await c.getMetadata();
        if (metaData.success) {
            return metaData.returnValue;
        }
        return false;
    }
    catch(err) {
        console.log(err);
        return false;
    }
}

export async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function output(msg, clear = false) {
    if (process.env.DOCKER_MODE && process.env.DOCKER_MODE === "true") {
        console.log(msg);
    }
    else {
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
                isCreate: (t.txn.apap && t.txn.apsu ? true : false),
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
        if (t['created-application-index']) {
            apps.push({
                apid: t['created-application-index'],
                isCreate: true,
            });
        }
        else if (t['application-transaction']) {
            apps.push({
                apid: t['application-transaction']['application-id'],
                isCreate: (t['on-completion'] === 0 ? true : false),
            });
        }
        if (t['inner-txns']) apps = apps.concat(getAllAppIdsIdx(t['inner-txns']));
    }
    
    // return array of unique apps objects { apid: number, isCreate: boolean }
    return apps.filter((v, i, a) => a.findIndex(t => (t.apid === v.apid)) === i);
}

export const decodeGlobalState = (globalState) => {
    const decodedState = globalState.map((state) => {
        const key = Buffer.from(state.key, 'base64').toString(); // Decode key from base64
        let value;

        if (state.value.type === 1) { 
            // first see if it's a valid address
            const b = new Uint8Array(Buffer.from(state.value.bytes, 'base64'))
            value = algosdk.encodeAddress(b)

            // then decode as string
            if (!algosdk.isValidAddress(value)) {
                value = Buffer.from(state.value.bytes, 'base64').toString()
            }
        } else if (state.value.type === 2) { // Check if the type is uint
            value = state.value.uint;
        }

        return { key, value };
    });
  
    return decodedState;
}