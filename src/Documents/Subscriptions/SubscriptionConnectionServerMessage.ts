
export interface SubscriptionConnectionServerMessage {
    Type: MessageType;
    Status: ConnectionStatus;
    Data: any;
    Includes: any;
    Exception: string;
    Message: string;
}

export interface SubscriptionRedirectData {
    CurrentTag: string;
    RedirectedTag: string;
    Reasons: Record<string, string>;
}

export type MessageType = "None" | "ConnectionStatus" | "EndOfBatch" | "Data" | "Includes" | "Confirm" | "Error";

export type ConnectionStatus =
    "None"
    | "Accepted"
    | "InUse"
    | "Closed"
    | "NotFound"
    | "Redirect"
    | "ForbiddenReadOnly"
    | "Forbidden"
    | "Invalid"
    | "ConcurrencyReconnect";
