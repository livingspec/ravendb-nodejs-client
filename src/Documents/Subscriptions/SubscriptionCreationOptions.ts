import { DocumentType } from "../DocumentAbstractions";
import { ISubscriptionIncludeBuilder } from "../Session/Loaders/ISubscriptionIncludeBuilder";

export interface SubscriptionCreationOptions {
    Name?: string;
    Query?: string;
    Includes?: (builder: ISubscriptionIncludeBuilder) => void;
    ChangeVector?: string;
    MentorNode?: string;
    DocumentType?: DocumentType;
}
