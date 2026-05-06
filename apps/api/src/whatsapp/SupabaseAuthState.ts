import {
    BufferJSON,
    initAuthCreds,
    type AuthenticationCreds,
    type AuthenticationState,
    type SignalDataSet,
    type SignalDataTypeMap,
} from '@whiskeysockets/baileys';
import { supabase, supabaseAdmin } from '../config/supabase';

const db = supabaseAdmin ?? supabase;

type PersistedSignalStore = {
    [K in keyof SignalDataTypeMap]?: Record<string, SignalDataTypeMap[K]>;
};

type AuthStateOptions = {
    sessionId: string;
    tenantId: string;
    label: string;
    ownerName?: string | null;
    phoneNumber?: string | null;
};

type SessionRow = {
    creds?: unknown;
    keys?: unknown;
};

function serializeForJson(value: unknown) {
    return JSON.parse(JSON.stringify(value, BufferJSON.replacer));
}

function deserializeFromJson<T>(value: unknown, fallback: T): T {
    if (value === null || value === undefined) {
        return fallback;
    }

    return JSON.parse(JSON.stringify(value), BufferJSON.reviver) as T;
}

export class SupabaseAuthState {
    private readonly sessionId: string;
    private readonly tenantId: string;
    private readonly label: string;
    private readonly ownerName?: string | null;
    private phoneNumber?: string | null;
    private creds: AuthenticationCreds = initAuthCreds();
    private keys: PersistedSignalStore = {};
    private readonly ready: Promise<void>;
    private writeChain: Promise<void> = Promise.resolve();

    constructor(options: AuthStateOptions) {
        this.sessionId = options.sessionId;
        this.tenantId = options.tenantId;
        this.label = options.label;
        this.ownerName = options.ownerName;
        this.phoneNumber = options.phoneNumber;
        this.ready = this.load();
    }

    private get persistedTenantId() {
        return this.tenantId === 'system' ? null : this.tenantId;
    }

    get state(): AuthenticationState {
        return {
            creds: this.creds,
            keys: {
                get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
                    await this.ready;
                    const store = (this.keys[type] || {}) as Record<string, SignalDataTypeMap[T]>;
                    const result = {} as { [id: string]: SignalDataTypeMap[T] };

                    for (const id of ids) {
                        const value = store[id];
                        if (value !== undefined && value !== null) {
                            result[id] = value;
                        }
                    }

                    return result;
                },
                set: async (data: SignalDataSet) => {
                    await this.ready;
                    this.applyKeyMutations(data);
                    await this.persist();
                },
            },
        };
    }

    readonly saveCreds = async () => {
        await this.ready;
        await this.persist();
    };

    updatePhoneNumber(phoneNumber?: string | null) {
        this.phoneNumber = phoneNumber || this.phoneNumber;
    }

    private async load() {
        const { data, error } = await db
            .from('whatsapp_sessions')
            .select('creds, keys')
            .eq('session_id', this.sessionId)
            .maybeSingle();

        if (error) {
            throw error;
        }

        const row = (data || null) as SessionRow | null;
        if (row?.creds) {
            this.creds = deserializeFromJson<AuthenticationCreds>(row.creds, initAuthCreds());
        }

        if (row?.keys) {
            this.keys = deserializeFromJson<PersistedSignalStore>(row.keys, {});
        }

        if (!row) {
            await this.persist();
        }
    }

    private applyKeyMutations(data: SignalDataSet) {
        const nextStore: PersistedSignalStore = { ...this.keys };

        for (const typeName of Object.keys(data) as Array<keyof SignalDataSet>) {
            const mutations = data[typeName];
            if (!mutations) {
                continue;
            }

            const currentEntries = { ...((nextStore[typeName as keyof SignalDataTypeMap] || {}) as Record<string, unknown>) };

            for (const id of Object.keys(mutations)) {
                const value = mutations[id];
                if (value === null) {
                    delete currentEntries[id];
                } else {
                    currentEntries[id] = value as unknown;
                }
            }

            if (Object.keys(currentEntries).length === 0) {
                delete nextStore[typeName as keyof SignalDataTypeMap];
            } else {
                nextStore[typeName as keyof SignalDataTypeMap] = currentEntries as never;
            }
        }

        this.keys = nextStore;
    }

    private async persist() {
        this.writeChain = this.writeChain.then(async () => {
            const payload = {
                session_id: this.sessionId,
                tenant_id: this.persistedTenantId,
                label: this.label,
                owner_name: this.ownerName || null,
                session_data: {
                    phoneNumber: this.phoneNumber || null,
                    ownerName: this.ownerName || null,
                    label: this.label,
                },
                creds: serializeForJson(this.creds),
                keys: serializeForJson(this.keys),
                updated_at: new Date().toISOString(),
            };

            const { error } = await db
                .from('whatsapp_sessions')
                .upsert(payload, { onConflict: 'session_id' });

            if (error) {
                throw error;
            }
        });

        await this.writeChain;
    }
}

export async function createSupabaseAuthState(options: AuthStateOptions) {
    const authState = new SupabaseAuthState(options);
    await authState.saveCreds();

    return {
        state: authState.state,
        saveCreds: authState.saveCreds,
        authState,
    };
}
