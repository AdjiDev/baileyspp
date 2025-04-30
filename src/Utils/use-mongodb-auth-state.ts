import { MongoClient, Db, Collection } from 'mongodb';
import { proto } from '../../WAProto';
import { initAuthCreds } from './auth-utils';
import { BufferJSON } from './generics';

export interface MongoDBAuthConfig {
  mongoUri: string;
  dbName: string;
  collectionName?: string;
}

export interface AuthState {
  creds: any;
  keys: {
    get: (type: string, ids: string[]) => Promise<{ [id: string]: any }>;
    set: (data: { [category: string]: { [id: string]: any } }) => Promise<void>;
  };
}

export const useMongoDBAuthState = async (
  config: string | MongoDBAuthConfig,
  dbName?: string,
  collectionName: string = 'whatsapp_auth'
): Promise<{
  state: AuthState;
  saveCreds: () => Promise<void>;
  close: () => Promise<void>;
}> => {
  const mongoUri = typeof config === 'string' ? config : config.mongoUri;
  const finalDbName = typeof config === 'string' ? dbName : config.dbName;
  const finalCollectionName = typeof config === 'string' ? collectionName : config.collectionName || 'whatsapp_auth';

  if (!mongoUri) throw new Error('MongoDB URI is required');
  if (!finalDbName) throw new Error('Database name is required');

  const client = new MongoClient(mongoUri, {
    retryWrites: true,
    retryReads: true,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 30000,
    serverSelectionTimeoutMS: 5000,
    maxPoolSize: 10,
    minPoolSize: 1,
  });

  try {
    await client.connect();
  } catch (error: any) {
    throw new Error(`Failed to connect to MongoDB: ${error.message}`);
  }

  const db: Db = client.db(finalDbName);
  const collection: Collection = db.collection(finalCollectionName);

  try {
    await collection.createIndex({ key: 1 }, { unique: true });
  } catch (error: any) {
    if (error.code !== 85) {
      console.warn('Failed to create index:', error.message);
    }
  }

  const writeData = async (data: any, key: string) => {
    try {
      await collection.updateOne(
        { key },
        {
          $set: {
            data: JSON.parse(JSON.stringify(data, BufferJSON.replacer)),
            updatedAt: new Date(),
          },
        },
        { upsert: true }
      );
    } catch (error: any) {
      if (error.code === 11000) {
        await collection.updateOne(
          { key },
          {
            $set: {
              data: JSON.parse(JSON.stringify(data, BufferJSON.replacer)),
              updatedAt: new Date(),
            },
          }
        );
      } else {
        throw error;
      }
    }
  };

  const readData = async (key: string): Promise<any | null> => {
    try {
      const doc = await collection.findOne({ key });
      if (!doc?.data) return null;
      return JSON.parse(JSON.stringify(doc.data), BufferJSON.reviver);
    } catch (error: any) {
      console.error('Error reading data:', error);
      return null;
    }
  };

  const removeData = async (key: string): Promise<void> => {
    try {
      await collection.deleteOne({ key });
    } catch (error: any) {
      console.error('Error removing data:', error);
    }
  };

  let creds;
  try {
    creds = (await readData('creds')) || initAuthCreds();
  } catch (error: any) {
    console.error('Error initializing credentials:', error);
    creds = initAuthCreds();
  }

  return {
    state: {
      creds,
      keys: {
        get: async (type: string, ids: string[]): Promise<{ [id: string]: any }> => {
          const data: { [id: string]: any } = {};
          await Promise.all(
            ids.map(async (id) => {
              try {
                const key = `${type}-${id}`;
                let value = await readData(key);
                if (type === 'app-state-sync-key' && value) {
                  value = proto.Message.AppStateSyncKeyData.fromObject(value);
                }
                data[id] = value;
              } catch (error: any) {
                console.error(`Error getting key ${type}-${id}:`, error);
                data[id] = null;
              }
            })
          );
          return data;
        },
        set: async (data: { [category: string]: { [id: string]: any } }): Promise<void> => {
          const tasks: Promise<void>[] = [];
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              tasks.push(
                value
                  ? writeData(value, key).catch((e) => console.error(`Error writing ${key}:`, e))
                  : removeData(key).catch((e) => console.error(`Error removing ${key}:`, e))
              );
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: () => writeData(creds, 'creds').catch((e) => console.error('Error saving credentials:', e)),
    close: async () => {
      try {
        await client.close();
      } catch (error: any) {
        console.error('Error closing MongoDB connection:', error);
      }
    },
  };
};
