import { IndexInformation } from "../../Documents/Operations/IndexInformation";
import { Size } from "../../Utility/SizeUtil";

export interface DatabaseStatistics {
    LastDocEtag: number;
    LastDatabaseEtag: number;
    CountOfIndexes: number;
    CountOfDocuments: number;
    CountOfRevisionDocuments: number;
    CountOfDocumentsConflicts: number;
    CountOfTombstones: number;
    CountOfConflicts: number;
    CountOfAttachments: number;
    CountOfCounters: number;
    CountOfUniqueAttachments: number;

    Indexes: IndexInformation[];

    DatabaseChangeVector: string;
    DatabaseId: string;
    Pager: string;
    Is64Bit: string;
    LastIndexingTime: Date;
    SizeOnDisk: Size;
    TempBuffersSizeOnDisk: Size;
    NumberOfTransactionMergerQueueOperations: number;
}
