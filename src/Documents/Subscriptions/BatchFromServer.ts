import { SubscriptionConnectionServerMessage } from "./SubscriptionConnectionServerMessage";

export interface BatchFromServer {
    Messages: SubscriptionConnectionServerMessage[];
    Includes: object[];
}
