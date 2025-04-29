import { AuthenticationState } from '../Types';

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
export declare const useMongoDBAuthState: (
    mongoUri: string,
    dbName: string,
    collectionName?: string
) => Promise<{
    state: AuthenticationState;
    saveCreds: () => Promise<void>;
    close: () => Promise<void>; 
}>;