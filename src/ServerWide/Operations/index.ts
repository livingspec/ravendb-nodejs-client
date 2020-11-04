export interface DatabasePutResult {
    RaftCommandIndex: number;
    Name: string;
    Topology: DatabaseTopology;
    NodesAddedTo: string[];
}

export type DatabasePromotionStatus =
    | "WaitingForFirstPromotion"
    | "NotResponding"
    | "IndexNotUpToDate"
    | "ChangeVectorNotMerged"
    | "WaitingForResponse"
    | "Ok"
    | "OutOfCpuCredits"
    | "EarlyOutOfMemory"
    | "HighDirtyMemory";

export interface DatabaseTopology {
    Members: string[];
    Promotables: string[];
    Rehabs: string[];
    PredefinedMentors: { [key: string]: string };
    DemotionReasons: { [key: string]: string };
    PromotablesStatus: { [key: string]: DatabasePromotionStatus };
    ReplicationFactor: number;
    DynamicNodesDistribution: boolean;
    Stamp: LeaderStamp;
    DatabaseTopologyIdBase64: string;
    PriorityOrder: string[];
}

export interface LeaderStamp {
    Index: number;
    Term: number;
    LeadersTicks: number;
}
