import { AuthenticationState, AuthenticationCreds } from '../Types';
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
export declare const useMongoDBAuthState: (config: MongoDBAuthStateConfig | string, dbName?: string, collectionName?: string) => Promise<MongoDBAuthState>;
export type { AuthenticationState, AuthenticationCreds };
