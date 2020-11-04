import { QueryTimings } from "../Queries/Timings/QueryTimings";

export abstract class QueryResultBase<TResult, TInclude> {

    public Results: TResult;

    public Includes: TInclude;

    public IncludedPaths: string[];

    public IsStale: boolean;

    public IndexTimestamp: Date;

    public IndexName: string;

    public ResultEtag: number;

    public LastQueryTime: Date;

    public CounterIncludes: object;

    public IncludedCounterNames: { [key: string]: string[] };

    public NodeTag: string;

    public Timings: QueryTimings;
}
