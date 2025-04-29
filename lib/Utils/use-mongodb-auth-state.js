"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.useMongoDBAuthState = void 0;
const WAProto_1 = require("../../WAProto");
const auth_utils_1 = require("./auth-utils");
const generics_1 = require("./generics");
const mongodb_1 = require("mongodb");

/**
 * Stores the authentication state in MongoDB
 * @param {string} mongoUri - MongoDB connection URI
 * @param {string} dbName - Database name
 * @param {string} [collectionName='whatsapp_auth'] - Collection name (optional)
 * @returns {Promise<{
 *   state: {
 *     creds: any,
 *     keys: {
 *       get: (type: string, ids: string[]) => Promise<{[id: string]: any}>,
 *       set: (data: any) => Promise<void>
 *     }
 *   },
 *   saveCreds: () => Promise<void>,
 *   close: () => Promise<void>
 * }>}
 */
const useMongoDBAuthState = async (mongoUri, dbName, collectionName = 'whatsapp_auth') => {
    const client = new mongodb_1.MongoClient(mongoUri);
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    const writeData = async (data, key) => {
        await collection.updateOne(
            { _id: key },
            { $set: { data: JSON.parse(JSON.stringify(data, generics_1.BufferJSON.replacer)) } },
            { upsert: true }
        );
    };

    const readData = async (key) => {
        const doc = await collection.findOne({ _id: key });
        if (!doc) return null;
        return JSON.parse(JSON.stringify(doc.data), generics_1.BufferJSON.reviver);
    };

    const removeData = async (key) => {
        await collection.deleteOne({ _id: key });
    };

    const creds = await readData('creds') || (0, auth_utils_1.initAuthCreds)();

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(ids.map(async (id) => {
                        const key = `${type}-${id}`;
                        let value = await readData(key);
                        if (type === 'app-state-sync-key' && value) {
                            value = WAProto_1.proto.Message.AppStateSyncKeyData.fromObject(value);
                        }
                        data[id] = value;
                    }));
                    return data;
                },
                set: async (data) => {
                    const tasks = [];
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            const key = `${category}-${id}`;
                            tasks.push(value ? writeData(value, key) : removeData(key));
                        }
                    }
                    await Promise.all(tasks);
                }
            }
        },
        saveCreds: () => {
            return writeData(creds, 'creds');
        },
        close: async () => {
            await client.close();
        }
    };
};
exports.useMongoDBAuthState = useMongoDBAuthState;