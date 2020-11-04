export interface MoreLikeThisOptions {
    MinimumTermFrequency?: number;
    MaximumQueryTerms?: number;
    MaximumNumberOfTokensParsed?: number;
    MinimumWordLength?: number;
    MaximumWordLength?: number;
    MinimumDocumentFrequency?: number;
    MaximumDocumentFrequency?: number;
    MaximumDocumentFrequencyPercentage?: number;
    Boost?: boolean;
    BoostFactor?: number;
    StopWordsDocumentId?: string;
    Fields?: string[];
}
