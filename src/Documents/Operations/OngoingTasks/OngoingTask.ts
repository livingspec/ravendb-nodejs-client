import { NodeId } from "../../Subscriptions/NodeId";
import { RunningBackup } from "./RunningBackup";
import { NextBackup } from "./NextBackup";
import { OngoingTaskType } from "./OngoingTaskType";
import { BackupType } from "../Backups/Enums";
import { RavenEtlConfiguration } from "../Etl/RavenEtlConfiguration";
import { SqlEtlConfiguration } from "../Etl/Sql/SqlEtlConfiguration";
import { RetentionPolicy } from "../Backups/RetentionPolicy";

export interface OngoingTask {
    TaskId: number;
    TaskType: OngoingTaskType;
    ResponsibleNode: NodeId;
    TaskState: OngoingTaskState;
    TaskConnectionStatus: OngoingTaskConnectionStatus;
    TaskName: string;
    Error: string;
    MentorNode: string;
}

export interface OngoingTaskBackup extends OngoingTask {
    TaskType: "Backup",
    BackupType: BackupType;
    BackupDestinations: string[];
    LastFullBackup: Date;
    LastIncrementalBackup: Date;
    OnGoingBackup: RunningBackup;
    NextBackup: NextBackup;
    RetentionPolicy: RetentionPolicy;
    IsEncrypted: boolean;
}

export type OngoingTaskConnectionStatus =
    "None"
    | "Active"
    | "NotActive"
    | "Reconnect"
    | "NotOnThisNode";

export interface OngoingTaskRavenEtlDetails extends OngoingTask {
    TaskType: "RavenEtl",
    DestinationUrl: string;
    Configuration: RavenEtlConfiguration;
}

export interface OngoingTaskReplication extends OngoingTask {
    TaskType: "Replication",
    DestinationUrl: string;
    TopologyDiscoveryUrls: string[];
    DestinationDatabase: string;
    ConnectionStringName: string;
    DelayReplicationFor: string;
}

export interface OngoingTaskSqlEtlDetails extends OngoingTask {
    TaskType: "SqlEtl",
    Configuration: SqlEtlConfiguration;
}

export type OngoingTaskState =
    "Enabled"
    | "Disabled"
    | "PartiallyEnabled";

export interface OngoingTaskSubscription extends OngoingTask {
    TaskType: "Subscription",
    Query: string;
    SubscriptionName: string;
    SubscriptionId: number;
    ChangeVectorForNextBatchStartingPoint: string;
    LastBatchAckTime: Date;
    Disabled: boolean;
    LastClientConnectionTime: Date;
}