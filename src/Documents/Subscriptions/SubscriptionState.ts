
export interface SubscriptionState {
    Query: string;
    ChangeVectorForNextBatchStartingPoint: string;
    SubscriptionName: string;
    MentorName: string;
    NodeTag: string;
    LastBatchAckTime: string;
    LastClientConnectionTime: string;
    Disabled: boolean;
}
