
export interface IBotConfig {
    command?: {
        symbol?: string;
    },
    discord: {
        token: string;
        log?: boolean;
    },
    directory: {
        plugins?: string;
        logs: string;
    }
}
