"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useMongoDBAuthState = void 0;
const WAProto_1 = require("../../WAProto");
const auth_utils_1 = require("./auth-utils");
const generics_1 = require("./generics");
const mongodb_1 = require("mongodb");

/**
 * Creates a MongoDB-based authentication state store for WhatsApp with improved error handling
 * @param config MongoDB configuration (either URI string or config object)
 * @param dbName Database name (if config is URI string)
 * @param collectionName Collection name (default: 'whatsapp_auth')
 * @returns Promise resolving to authentication state and management functions
 */
const useMongoDBAuthState = async (config, dbName, collectionName = 'whatsapp_auth') => {
    const mongoUri = typeof config === 'string' ? config : config.mongoUri;
    const finalDbName = typeof config === 'string' ? dbName : config.dbName;
    const finalCollectionName = typeof config === 'string' ? collectionName : config.collectionName || 'whatsapp_auth';
    
    if (!mongoUri) throw new Error('MongoDB URI is required');
    if (!finalDbName) throw new Error('Database name is required');

    const client = new mongodb_1.MongoClient(mongoUri, {
        retryWrites: true,
        retryReads: true,
        connectTimeoutMS: 10000,
        socketTimeoutMS: 30000,
        serverSelectionTimeoutMS: 5000,
        maxPoolSize: 10,
        minPoolSize: 1
    });

    try {
        await client.connect();
    } catch (error) {
        throw new Error(`Failed to connect to MongoDB: ${error.message}`);
    }

    const db = client.db(finalDbName);
    const collection = db.collection(finalCollectionName);

    try {
        await collection.createIndex({ key: 1 }, { unique: true });
    } catch (error) {
        if (error.code !== 85) { 
            console.warn('Failed to create index:', error.message);
        }
    }

    /**
     * Writes data to MongoDB with duplicate key handling
     */
    const writeData = async (data, key) => {
        try {
            await collection.updateOne(
                { key },
                {
                    $set: {
                        data: JSON.parse(JSON.stringify(data, generics_1.BufferJSON.replacer)),
                        updatedAt: new Date()
                    }
                },
                { upsert: true }
            );
        } catch (error) {
            if (error.code === 11000) {
                await collection.updateOne(
                    { key },
                    {
                        $set: {
                            data: JSON.parse(JSON.stringify(data, generics_1.BufferJSON.replacer)),
                            updatedAt: new Date()
                        }
                    }
                );
            } else {
                throw error;
            }
        }
    };

    /**
     * Reads data from MongoDB
     */
    const readData = async (key) => {
        try {
            const doc = await collection.findOne({ key });
            if (!doc?.data) return null;
            return JSON.parse(JSON.stringify(doc.data), generics_1.BufferJSON.reviver);
        } catch (error) {
            console.error('Error reading data:', error);
            return null;
        }
    };

    /**
     * Removes data from MongoDB
     */
    const removeData = async (key) => {
        try {
            await collection.deleteOne({ key });
        } catch (error) {
            console.error('Error removing data:', error);
        }
    };

    let creds;
    try {
        creds = (await readData('creds')) || (0, auth_utils_1.initAuthCreds)();
    } catch (error) {
        console.error('Error initializing credentials:', error);
        creds = (0, auth_utils_1.initAuthCreds)();
    }

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(ids.map(async (id) => {
                        try {
                            const key = `${type}-${id}`;
                            let value = await readData(key);
                            if (type === 'app-state-sync-key' && value) {
                                value = WAProto_1.proto.Message.AppStateSyncKeyData.fromObject(value);
                            }
                            data[id] = value;
                        } catch (error) {
                            console.error(`Error getting key ${type}-${id}:`, error);
                            data[id] = null;
                        }
                    }));
                    return data;
                },
                set: async (data) => {
                    const tasks = [];
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            const key = `${category}-${id}`;
                            tasks.push(
                                value ? writeData(value, key).catch(e => console.error(`Error writing ${key}:`, e)) 
                                : removeData(key).catch(e => console.error(`Error removing ${key}:`, e))
                            );
                        }
                    }
                    await Promise.all(tasks);
                },
            },
        },
        saveCreds: () => writeData(creds, 'creds').catch(e => console.error('Error saving credentials:', e)),
        close: async () => {
            try {
                await client.close();
            } catch (error) {
                console.error('Error closing MongoDB connection:', error);
            }
        },
    };
};
exports.useMongoDBAuthState = useMongoDBAuthState;