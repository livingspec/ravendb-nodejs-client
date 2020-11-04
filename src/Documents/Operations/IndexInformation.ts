import { IndexLockMode, IndexPriority, IndexState, IndexType } from "../Indexes/Enums";

export interface IndexInformation {
    Name: string;
    IsStale: boolean;
    State: IndexState;
    LockMode: IndexLockMode;
    Priority: IndexPriority;
    Type: IndexType;
    LastIndexingTime: Date;
}
