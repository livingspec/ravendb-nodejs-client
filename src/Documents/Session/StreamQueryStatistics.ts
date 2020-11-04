export interface StreamQueryStatistics {
    IndexName: string;
    Stale: boolean;
    IndexTimestamp: Date;
    TotalResults: number;
    ResultEtag: number;
}
