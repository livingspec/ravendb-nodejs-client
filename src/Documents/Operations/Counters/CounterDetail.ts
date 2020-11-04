export class CounterDetail {
    public DocumentId: string;
    public CounterName: string;
    public TotalValue: number;
    public Etag: number;
    public CounterValues: { [key: string]: number };
    public ChangeVector: string;
} 
