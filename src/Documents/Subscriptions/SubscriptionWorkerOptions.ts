import { SubscriptionOpeningStrategy } from "./SubscriptionOpeningStrategy";
import { DocumentType } from "../DocumentAbstractions";

export interface SubscriptionWorkerOptions<T extends object> {
    SubscriptionName?: string;
    TimeToWaitBeforeConnectionRetry?: number;
    IgnoreSubscriberErrors?: boolean;
    Strategy?: SubscriptionOpeningStrategy;
    MaxDocsPerBatch?: number;
    MaxErroneousPeriod?: number;
    CloseWhenNoDocsLeft?: boolean;
    DocumentType?: DocumentType<T>;
}
