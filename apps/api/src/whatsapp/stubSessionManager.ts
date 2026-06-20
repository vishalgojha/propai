type HeartbeatSessionSnapshot = {
    tenantId: string;
    label: string;
    status: string;
    phoneNumber?: string | null;
    ownerName?: string | null;
    lastSeen?: string | null;
    isReconnecting?: boolean;
    reconnectAttempts?: number;
    connectionLostAt?: string | null;
};

type HeartbeatSessionManager = {
    getAllSessions(): HeartbeatSessionSnapshot[];
    rehydratePersistedSessions?: () => Promise<void>;
    forceReconnect?: (tenantId: string, sessionKey?: string) => Promise<unknown>;
    removeSession?: (tenantId: string, sessionKey?: string) => Promise<void>;
    createSession(
        tenantId: string,
        onQR: (qr: string) => void,
        onConnectionUpdate: (status: string) => void,
        options?: {
            usePairingCode?: string;
            phoneNumber?: string;
            label?: string;
            ownerName?: string;
            skipLimitCheck?: boolean;
            freshAuth?: boolean;
        },
    ): Promise<unknown>;
};

export const stubSessionManager: HeartbeatSessionManager = {
    getAllSessions: () => [],
    createSession: async () => {},
};
