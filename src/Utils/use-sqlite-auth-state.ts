import { proto } from '../../WAProto';
import { AuthenticationState, AuthenticationCreds } from '../Types';
import { initAuthCreds } from './auth-utils';
import { BufferJSON } from './generics';
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';

/**
 * SQLite authentication state configuration
 */
export interface SQLiteAuthStateConfig {
    /** Path to SQLite database file */
    databasePath: string;
    /** Table name (default: 'auth_state') */
    tableName?: string;
}

/**
 * SQLite authentication state return type
 */
export interface SQLiteAuthState {
    /** Authentication state including credentials and keys */
    state: AuthenticationState;
    /** Function to save credentials */
    saveCreds: () => Promise<void>;
    /** Function to close database connection */
    close: () => Promise<void>;
}

/**
 * Creates a SQLite-based authentication state store for WhatsApp
 * @param config SQLite configuration
 * @returns Promise resolving to authentication state and management functions
 */
export const useSQLiteAuthState = async (
    config: SQLiteAuthStateConfig | string,
    tableName: string = 'auth_state'
): Promise<SQLiteAuthState> => {
    // Handle both object config and string path
    const databasePath = typeof config === 'string' ? config : config.databasePath;
    const finalTableName = typeof config === 'string' ? tableName : config.tableName || 'auth_state';

    if (!databasePath) throw new Error('Database path is required');

    // Open SQLite database
    const db = await open({
        filename: databasePath,
        driver: sqlite3.Database
    });

    // Initialize database schema
    await db.exec(`
        CREATE TABLE IF NOT EXISTS ${finalTableName} (
            key TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_auth_state_key ON ${finalTableName}(key);
    `);

    const writeData = async (data: any, key: string): Promise<void> => {
        const serialized = JSON.stringify(data, BufferJSON.replacer);
        await db.run(
            `INSERT OR REPLACE INTO ${finalTableName} (key, data) VALUES (?, ?)`,
            [key, serialized]
        );
    };

    const readData = async <T = any>(key: string): Promise<T | null> => {
        const row = await db.get<{ data: string }>(
            `SELECT data FROM ${finalTableName} WHERE key = ?`,
            [key]
        );
        if (!row?.data) return null;
        return JSON.parse(row.data, BufferJSON.reviver) as T;
    };

    const removeData = async (key: string): Promise<void> => {
        await db.run(
            `DELETE FROM ${finalTableName} WHERE key = ?`,
            [key]
        );
    };

    // Initialize or load credentials
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
            await db.close();
        },
    };
};

export type { AuthenticationState, AuthenticationCreds };