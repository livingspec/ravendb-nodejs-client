import { QueryResult } from "../Queries/QueryResult";

export class QueryStatistics {

    public IsStale: boolean;
    public DurationInMs: number;
    public TotalResults: number;
    public SkippedResults: number;
    public Timestamp: Date;
    public IndexName: string;
    public IndexTimestamp: Date;
    public LastQueryTime: Date;
    public ResultEtag: number;

    /**
     * @deprecated ResultSize is not supported anymore. Will be removed in next major version of the product.
     */
    public ResultSize: number;
    public NodeTag: string;

    public updateQueryStats(qr: QueryResult): void {
        this.IsStale = qr.IsStale;
        this.DurationInMs = qr.DurationInMs;
        this.TotalResults = qr.TotalResults;
        this.SkippedResults = qr.SkippedResults;
        this.Timestamp = qr.IndexTimestamp;
        this.IndexName = qr.IndexName;
        this.IndexTimestamp = qr.IndexTimestamp;
        this.LastQueryTime = qr.LastQueryTime;
        this.ResultEtag = qr.ResultEtag;
        this.NodeTag = qr.NodeTag;
    }
}
