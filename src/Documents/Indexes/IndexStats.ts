import { IndexState, IndexPriority, IndexLockMode, IndexType } from "./Enums";
import { IndexRunningStatus } from "./IndexingStatus";

export interface IndexStats {
    Name: string;
    MapAttempts: number;
    MapSuccesses: number;
    MapErrors: number;
    MapReferenceAttempts: number;
    MapReferenceSuccesses: number;
    MapReferenceErrors: number;
    ReduceAttempts: number;
    ReduceSuccesses: number;
    ReduceErrors: number;
    ReduceOutputCollection: string;
    ReduceOutputReferencePattern: string;
    PatternReferencesCollectionName: string;
    MappedPerSecondRate: number;
    ReducedPerSecondRate: number;
    MaxNumberOfOutputsPerDocument: number;
    Collections: Map<string, CollectionStats>;
    LastQueryingTime: Date;
    State: IndexState;
    Priority: IndexPriority;
    CreatedTimestamp: Date;
    LastIndexingTime: Date;
    Stale: boolean;
    LockMode: IndexLockMode;
    Type: IndexType;
    Status: IndexRunningStatus;
    EntriesCount: number;
    ErrorsCount: number;
    IsTestIndex: boolean;
}

export class CollectionStats {
    public LastProcessedDocumentEtag: number;
    public LastProcessedTombstoneEtag: number;
    public DocumentLag: number;
    public TombstoneLag: number;

    public constructor() {
        this.DocumentLag = -1;
        this.TombstoneLag = -1;
    }
}
