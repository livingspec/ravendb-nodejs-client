import { DatabaseTopology } from "./Operations";
import { SorterDefinition } from "../Documents/Queries/Sorting/SorterDefinition";
import { DeletionInProgressStatus } from "./DeletionInProgressStatus";
import { AutoIndexDefinition } from "../Documents/Indexes/AutoIndexDefinition";
import { ExpirationConfiguration } from "../Documents/Operations/Expiration/ExpirationConfiguration";
import { PeriodicBackupConfiguration } from "../Documents/Operations/Backups/PeriodicBackupConfiguration";
import { PullReplicationAsSink } from "../Documents/Operations/Replication/PullReplicationAsSink";
import { PullReplicationDefinition } from "../Documents/Operations/Replication/PullReplicationDefinition";
import { RavenEtlConfiguration } from "../Documents/Operations/Etl/RavenEtlConfiguration";
import { SqlEtlConfiguration } from "../Documents/Operations/Etl/Sql/SqlEtlConfiguration";
import { StudioConfiguration } from "../Documents/Operations/Configuration/StudioConfiguration";
import { IndexDefinition } from "../Documents/Indexes/IndexDefinition";
import { RevisionsConfiguration } from "../Documents/Operations/RevisionsConfiguration";
import { ExternalReplication } from "../Documents/Replication/ExternalReplication";
import { RavenConnectionString, SqlConnectionString } from "../Documents/Operations/Etl/ConnectionString";
import { ClientConfiguration } from "../Documents/Operations/Configuration/ClientConfiguration";
import { RefreshConfiguration } from "../Documents/Operations/Refresh/RefreshConfiguration";
import { RevisionsCollectionConfiguration } from "../Documents/Operations/RevisionsCollectionConfiguration";

export interface ScriptResolver {
    script: string;
    lastModifiedTime: Date;
}

export interface ConflictSolver {
    resolveByCollection: { [key: string]: ScriptResolver };
    resolveToLatest: boolean;
}

export interface DatabaseRecord {
    DatabaseName: string;
    Disabled?: boolean;
    Encrypted?: boolean;
    EtagForBackup?: number;
    DeletionInProgress?: { [key: string]: DeletionInProgressStatus };
    DatabaseStatus?: DatabaseStateStatus;
    Topology?: DatabaseTopology;
    ConflictSolverConfig?: ConflictSolver;
    Sorters?: { [key: string]: SorterDefinition };
    Indexes?: { [key: string]: IndexDefinition };
    IndexesHistory?: { [key: string]: IndexHistoryEntry[] };
    AutoIndexes?: { [key: string]: AutoIndexDefinition };
    Settings?: { [key: string]: string };
    Revisions?: RevisionsConfiguration;
    RevisionsForConflicts?: RevisionsCollectionConfiguration;
    Expiration?: ExpirationConfiguration;
    Refresh?: RefreshConfiguration;
    PeriodicBackups?: PeriodicBackupConfiguration[];
    ExternalReplications?: ExternalReplication[];
    SinkPullReplications?: PullReplicationAsSink[];
    HubPullReplications?: PullReplicationDefinition[];
    RavenConnectionStrings?: { [key: string]: RavenConnectionString };
    SqlConnectionStrings?: { [key: string]: SqlConnectionString };
    RavenEtls?: RavenEtlConfiguration[];
    SqlEtls?: SqlEtlConfiguration[];
    Client?: ClientConfiguration;
    Studio?: StudioConfiguration;
    TruncatedClusterTransactionIndex?: number;
    UnusedDatabaseIds?: string[];
}

export interface IndexHistoryEntry {
    Definition: IndexDefinition;
    Source: string;
    CreatedAt: Date;
}

export interface DatabaseRecordWithEtag extends DatabaseRecord {
    Etag: number;
}

export type DatabaseStateStatus =
    "Normal"
    | "RestoreInProgress";