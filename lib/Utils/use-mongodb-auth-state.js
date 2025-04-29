"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useMongoDBAuthState = void 0;
const WAProto_1 = require("../../WAProto");
const auth_utils_1 = require("./auth-utils");
const generics_1 = require("./generics");
const mongodb_1 = require("mongodb");
/**
 * Creates a MongoDB-based authentication state store for WhatsApp
 * @param config MongoDB configuration
 * @returns Promise resolving to authentication state and management functions
 */
const useMongoDBAuthState = async (config, dbName, collectionName = 'whatsapp_auth') => {
    const mongoUri = typeof config === 'string' ? config : config.mongoUri;
    const finalDbName = typeof config === 'string' ? dbName : config.dbName;
    const finalCollectionName = typeof config === 'string' ? collectionName : config.collectionName || 'whatsapp_auth';
    if (!mongoUri)
        throw new Error('MongoDB URI is required');
    if (!finalDbName)
        throw new Error('Database name is required');
    const client = new mongodb_1.MongoClient(mongoUri);
    await client.connect();
    const db = client.db(finalDbName);
    const collection = db.collection(finalCollectionName);
    await collection.createIndex({ key: 1 }, { unique: true });
    const writeData = async (data, key) => {
        await collection.updateOne({ key }, {
            $set: {
                data: JSON.parse(JSON.stringify(data, generics_1.BufferJSON.replacer)),
                updatedAt: new Date()
            }
        }, { upsert: true });
    };
    const readData = async (key) => {
        const doc = await collection.findOne({ key });
        if (!(doc === null || doc === void 0 ? void 0 : doc.data))
            return null;
        return JSON.parse(JSON.stringify(doc.data), generics_1.BufferJSON.reviver);
    };
    const removeData = async (key) => {
        await collection.deleteOne({ key });
    };
    const creds = (await readData('creds')) || (0, auth_utils_1.initAuthCreds)();
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
                },
            },
        },
        saveCreds: () => writeData(creds, 'creds'),
        close: async () => {
            await client.close();
        },
    };
};
exports.useMongoDBAuthState = useMongoDBAuthState;
