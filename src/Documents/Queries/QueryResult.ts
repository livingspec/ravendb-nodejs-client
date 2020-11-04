import { GenericQueryResult } from "./GenericQueryResult";

export class QueryResult extends GenericQueryResult<object[], object> {

    /**
     * Creates a snapshot of the query results
     */
    public createSnapshot(): QueryResult {
        const queryResult = new QueryResult();
        queryResult.Results = this.Results;
        queryResult.Includes = this.Includes;
        queryResult.IndexName = this.IndexName;
        queryResult.IndexTimestamp = this.IndexTimestamp;
        queryResult.IncludedPaths = this.IncludedPaths;
        queryResult.IsStale = this.IsStale;
        queryResult.SkippedResults = this.SkippedResults;
        queryResult.TotalResults = this.TotalResults;
        queryResult.Highlightings = this.Highlightings;
        queryResult.Explanations = this.Explanations;
        queryResult.TimingsInMs = this.TimingsInMs;
        queryResult.NodeTag = this.NodeTag;
        queryResult.CounterIncludes = this.CounterIncludes;
        queryResult.IncludedCounterNames = this.IncludedCounterNames;
        queryResult.LastQueryTime = this.LastQueryTime;
        queryResult.DurationInMs = this.DurationInMs;
        queryResult.ResultEtag = this.ResultEtag;
        return queryResult;
    }
}
