export interface IndexErrors {
    Name: string;
    Errors: IndexingError[];
}

export interface IndexingError {
    Error: string;
    Timestamp: Date;
    Document: string;
    Action: string;
}
