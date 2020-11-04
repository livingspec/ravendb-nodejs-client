export type IndexRunningStatus = "Running" | "Paused" | "Disabled";

export interface IndexingStatus {
    Status: IndexRunningStatus;
    Indexes: IndexStatus[];
}

export interface IndexStatus {
    Name: string;
    Status: IndexRunningStatus;
}
