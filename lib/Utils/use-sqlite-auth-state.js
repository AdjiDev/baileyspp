"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.useSQLiteAuthState = void 0;
const WAProto_1 = require("../../WAProto");
const auth_utils_1 = require("./auth-utils");
const generics_1 = require("./generics");
const sqlite3_1 = __importDefault(require("sqlite3"));
const sqlite_1 = require("sqlite");
/**
 * Creates a SQLite-based authentication state store for WhatsApp
 * @param config SQLite configuration
 * @returns Promise resolving to authentication state and management functions
 */
const useSQLiteAuthState = async (config, tableName = 'auth_state') => {
    const databasePath = typeof config === 'string' ? config : config.databasePath;
    const finalTableName = typeof config === 'string' ? tableName : config.tableName || 'auth_state';
    if (!databasePath)
        throw new Error('Database path is required');
    const db = await (0, sqlite_1.open)({
        filename: databasePath,
        driver: sqlite3_1.default.Database
    });
    await db.exec(`
        CREATE TABLE IF NOT EXISTS ${finalTableName} (
            key TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_auth_state_key ON ${finalTableName}(key);
    `);
    const writeData = async (data, key) => {
        const serialized = JSON.stringify(data, generics_1.BufferJSON.replacer);
        await db.run(`INSERT OR REPLACE INTO ${finalTableName} (key, data) VALUES (?, ?)`, [key, serialized]);
    };
    const readData = async (key) => {
        const row = await db.get(`SELECT data FROM ${finalTableName} WHERE key = ?`, [key]);
        if (!(row === null || row === void 0 ? void 0 : row.data))
            return null;
        return JSON.parse(row.data, generics_1.BufferJSON.reviver);
    };
    const removeData = async (key) => {
        await db.run(`DELETE FROM ${finalTableName} WHERE key = ?`, [key]);
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
            await db.close();
        },
    };
};
exports.useSQLiteAuthState = useSQLiteAuthState;
