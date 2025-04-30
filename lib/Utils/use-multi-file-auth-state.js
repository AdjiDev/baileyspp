"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.useMultiFileAuthState = void 0;
const promises_1 = require("fs/promises");
const path_1 = require("path");
const WAProto_1 = require("../../WAProto");
const auth_utils_1 = require("./auth-utils");
const generics_1 = require("./generics");
const async_lock_1 = __importDefault(require("async-lock"));
const crypto_1 = require("crypto");

const fileLock = new async_lock_1.default({ maxPending: Infinity });

const ALGORITHM = 'aes-256-ctr';
const SALT_LENGTH = 16;
const IV_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * Encrypts data with a password
 */
function encrypt(data, password) {
    const salt = (0, crypto_1.randomBytes)(SALT_LENGTH);
    const iv = (0, crypto_1.randomBytes)(IV_LENGTH);
    const key = (0, crypto_1.scryptSync)(password, salt, KEY_LENGTH);
    const cipher = (0, crypto_1.createCipheriv)(ALGORITHM, key, iv);
    
    const encrypted = Buffer.concat([
        salt,
        iv,
        cipher.update(data),
        cipher.final()
    ]);
    
    return encrypted.toString('base64');
}

/**
 * Decrypts data with a password
 */
function decrypt(encryptedData, password) {
    const data = Buffer.from(encryptedData, 'base64');
    const salt = data.subarray(0, SALT_LENGTH);
    const iv = data.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const encrypted = data.subarray(SALT_LENGTH + IV_LENGTH);
    const key = (0, crypto_1.scryptSync)(password, salt, KEY_LENGTH);
    
    const decipher = (0, crypto_1.createDecipheriv)(ALGORITHM, key, iv);
    const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
    ]);
    
    return decrypted.toString('utf8');
}

/**
 * stores the full authentication state in a single folder.
 * Far more efficient than singlefileauthstate
 *
 * Again, I wouldn't endorse this for any production level use other than perhaps a bot.
 * Would recommend writing an auth state for use with a proper SQL or No-SQL DB
 * */
const useMultiFileAuthState = async (folder, encryptionKey) => {
    const writeData = async (data, file) => {
        const filePath = (0, path_1.join)(folder, fixFileName(file));
        let dataToWrite = JSON.stringify(data, generics_1.BufferJSON.replacer);
        
        if (encryptionKey) {
            dataToWrite = encrypt(dataToWrite, encryptionKey);
        }
        
        return fileLock.acquire(filePath, () => (0, promises_1.writeFile)(filePath, dataToWrite));
    };

    const readData = async (file) => {
        try {
            const filePath = (0, path_1.join)(folder, fixFileName(file));
            let data = await fileLock.acquire(filePath, () => (0, promises_1.readFile)(filePath, { encoding: 'utf-8' }));
            
            if (encryptionKey) {
                data = decrypt(data, encryptionKey);
            }
            
            return JSON.parse(data, generics_1.BufferJSON.reviver);
        }
        catch (error) {
            return null;
        }
    };

    const removeData = async (file) => {
        try {
            const filePath = (0, path_1.join)(folder, fixFileName(file));
            await fileLock.acquire(filePath, () => (0, promises_1.unlink)(filePath));
        }
        catch (_a) {
        }
    };

    const folderInfo = await (0, promises_1.stat)(folder).catch(() => { });
    if (folderInfo) {
        if (!folderInfo.isDirectory()) {
            throw new Error(`found something that is not a directory at ${folder}, either delete it or specify a different location`);
        }
    }
    else {
        await (0, promises_1.mkdir)(folder, { recursive: true });
    }

    const fixFileName = (file) => { 
        var _a; 
        return (_a = file === null || file === void 0 ? void 0 : file.replace(/\//g, '__')) === null || _a === void 0 ? void 0 : _a.replace(/:/g, '-'); 
    };

    const creds = await readData('creds.json') || (0, auth_utils_1.initAuthCreds)();

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(ids.map(async (id) => {
                        let value = await readData(`${type}-${id}.json`);
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
                            const file = `${category}-${id}.json`;
                            tasks.push(value ? writeData(value, file) : removeData(file));
                        }
                    }
                    await Promise.all(tasks);
                }
            }
        },
        saveCreds: () => {
            return writeData(creds, 'creds.json');
        }
    };
};
exports.useMultiFileAuthState = useMultiFileAuthState;