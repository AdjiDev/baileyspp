import { AuthenticationState, AuthenticationCreds } from '../Types';
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
export declare const useSQLiteAuthState: (config: SQLiteAuthStateConfig | string, tableName?: string) => Promise<SQLiteAuthState>;
export type { AuthenticationState, AuthenticationCreds };
