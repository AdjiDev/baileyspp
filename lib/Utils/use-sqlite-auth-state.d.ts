import { AuthenticationState } from '../Types';
/**
 * SQLite authentication state configuration
 */
export interface SQLiteAuthStateConfig {
    databasePath: string;
    tableName?: string;
}
export interface SQLiteAuthState {
    state: AuthenticationState;
    saveCreds: () => Promise<void>;
    close: () => Promise<void>;
}
/**
 * Creates a SQLite-based authentication state store for WhatsApp
 * @param config SQLite configuration or database path string
 * @param tableName Table name (default: 'auth_state')
 */
export declare const useSQLiteAuthState: (
    config: SQLiteAuthStateConfig | string,
    tableName?: string
) => Promise<SQLiteAuthState>;
export type { AuthenticationState };