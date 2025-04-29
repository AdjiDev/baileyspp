import { proto } from '../../WAProto';
import { AuthenticationState, AuthenticationCreds } from '../Types';
import { initAuthCreds } from './auth-utils';
import { BufferJSON } from './generics';
import { MongoClient, Collection, WithId, Document } from 'mongodb';

/**
 * Document structure for MongoDB storage
 */
interface AuthStateDocument extends Document {
    key: string;
    data: any;
    updatedAt?: Date;
}

export interface MongoDBAuthStateConfig {
    mongoUri: string;
    dbName: string;
    collectionName?: string;
}

export interface MongoDBAuthState {
    state: AuthenticationState;
    saveCreds: () => Promise<void>;
    close: () => Promise<void>;
}

/**
 * Creates a MongoDB-based authentication state store for WhatsApp
 * @param config MongoDB configuration
 * @returns Promise resolving to authentication state and management functions
 */
export const useMongoDBAuthState = async (
    config: MongoDBAuthStateConfig | string,
    dbName?: string,
    collectionName: string = 'whatsapp_auth'
): Promise<MongoDBAuthState> => {
    const mongoUri = typeof config === 'string' ? config : config.mongoUri;
    const finalDbName = typeof config === 'string' ? dbName : config.dbName;
    const finalCollectionName = typeof config === 'string' ? collectionName : config.collectionName || 'whatsapp_auth';

    if (!mongoUri) throw new Error('MongoDB URI is required');
    if (!finalDbName) throw new Error('Database name is required');

    const client = new MongoClient(mongoUri);
    await client.connect();
    const db = client.db(finalDbName);
    const collection = db.collection<AuthStateDocument>(finalCollectionName);

    await collection.createIndex({ key: 1 }, { unique: true });

    const writeData = async (data: any, key: string): Promise<void> => {
        await collection.updateOne(
            { key },
            { 
                $set: { 
                    data: JSON.parse(JSON.stringify(data, BufferJSON.replacer)),
                    updatedAt: new Date() 
                } 
            },
            { upsert: true }
        );
    };

    const readData = async <T = any>(key: string): Promise<T | null> => {
        const doc = await collection.findOne({ key });
        if (!doc?.data) return null;
        return JSON.parse(JSON.stringify(doc.data), BufferJSON.reviver) as T;
    };

    const removeData = async (key: string): Promise<void> => {
        await collection.deleteOne({ key });
    };

    const creds = (await readData<AuthenticationCreds>('creds')) || initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data: { [id: string]: any } = {};
                    await Promise.all(
                        ids.map(async (id) => {
                            const key = `${type}-${id}`;
                            let value = await readData(key);
                            if (type === 'app-state-sync-key' && value) {
                                value = proto.Message.AppStateSyncKeyData.fromObject(value);
                            }
                            data[id] = value;
                        })
                    );
                    return data;
                },
                set: async (data) => {
                    const tasks: Promise<void>[] = [];
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

export type { AuthenticationState, AuthenticationCreds };