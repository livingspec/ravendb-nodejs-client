import { CollectionDetails } from "./CollectionDetails";

export interface DetailedCollectionStatistics {
    CountOfDocuments: number;
    CountOfConflicts: number;
    Collections: Record<string, CollectionDetails>;
}
