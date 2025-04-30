import { mkdir, readFile, stat, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import { proto } from '../../WAProto'
import { AuthenticationCreds, AuthenticationState, SignalDataTypeMap } from '../Types'
import { initAuthCreds } from './auth-utils'
import { BufferJSON } from './generics'
import AsyncLock from 'async-lock'
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

const fileLock = new AsyncLock({ maxPending: Infinity })

const ALGORITHM = 'aes-256-ctr'
const SALT_LENGTH = 16
const IV_LENGTH = 16
const KEY_LENGTH = 32

/**
 * Encrypts data with a password
 */
const encrypt = (data: string, password: string): string => {
    const salt = randomBytes(SALT_LENGTH)
    const iv = randomBytes(IV_LENGTH)
    const key = scryptSync(password, salt, KEY_LENGTH)
    const cipher = createCipheriv(ALGORITHM, key, iv)
    
    const encrypted = Buffer.concat([
        salt,
        iv,
        cipher.update(data),
        cipher.final()
    ])
    
    return encrypted.toString('base64')
}

/**
 * Decrypts data with a password
 */
const decrypt = (encryptedData: string, password: string): string => {
    const data = Buffer.from(encryptedData, 'base64')
    const salt = data.subarray(0, SALT_LENGTH)
    const iv = data.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH)
    const encrypted = data.subarray(SALT_LENGTH + IV_LENGTH)
    const key = scryptSync(password, salt, KEY_LENGTH)
    
    const decipher = createDecipheriv(ALGORITHM, key, iv)
    const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
    ])
    
    return decrypted.toString('utf8')
}

/**
 * stores the full authentication state in a single folder with encryption.
 * Far more efficient than singlefileauthstate and more secure with encryption.
 */
export const useMultiFileAuthState = async(
    folder: string,
    encryptionKey?: string
): Promise<{ state: AuthenticationState, saveCreds: () => Promise<void> }> => {

    const writeData = async (data: any, file: string) => {
        const filePath = join(folder, fixFileName(file)!)
        let dataToWrite = JSON.stringify(data, BufferJSON.replacer)
        
        if (encryptionKey) {
            dataToWrite = encrypt(dataToWrite, encryptionKey)
        }
        
        return fileLock.acquire(
            filePath,
            () => writeFile(filePath, dataToWrite)
        )
    }

    const readData = async (file: string) => {
        try {
            const filePath = join(folder, fixFileName(file)!)
            let data = await fileLock.acquire(
                filePath,
                () => readFile(filePath, { encoding: 'utf-8' })
            )
            
            if (encryptionKey) {
                data = decrypt(data, encryptionKey)
            }
            
            return JSON.parse(data, BufferJSON.reviver)
        } catch(error) {
            return null
        }
    }

    const removeData = async(file: string) => {
        try {
            const filePath = join(folder, fixFileName(file)!)
            await fileLock.acquire(
                filePath,
                () => unlink(filePath)
            )
        } catch {
            // Ignore errors
        }
    }

    const folderInfo = await stat(folder).catch(() => { })
    if(folderInfo) {
        if(!folderInfo.isDirectory()) {
            throw new Error(`found something that is not a directory at ${folder}, either delete it or specify a different location`)
        }
    } else {
        await mkdir(folder, { recursive: true })
    }

    const fixFileName = (file?: string) => file?.replace(/\//g, '__')?.replace(/:/g, '-')

    const creds: AuthenticationCreds = await readData('creds.json') || initAuthCreds()

    return {
        state: {
            creds,
            keys: {
                get: async(type, ids) => {
                    const data: { [_: string]: SignalDataTypeMap[typeof type] } = { }
                    await Promise.all(
                        ids.map(
                            async id => {
                                let value = await readData(`${type}-${id}.json`)
                                if(type === 'app-state-sync-key' && value) {
                                    value = proto.Message.AppStateSyncKeyData.fromObject(value)
                                }

                                data[id] = value
                            }
                        )
                    )

                    return data
                },
                set: async(data) => {
                    const tasks: Promise<void>[] = []
                    for(const category in data) {
                        for(const id in data[category]) {
                            const value = data[category][id]
                            const file = `${category}-${id}.json`
                            tasks.push(value ? writeData(value, file) : removeData(file))
                        }
                    }

                    await Promise.all(tasks)
                }
            }
        },
        saveCreds: () => {
            return writeData(creds, 'creds.json')
        }
    }
}