export interface CollectionStatistics {
    CountOfDocuments: number;
    CountOfConflicts: number;
    Collections: { [collection: string]: number };
}
