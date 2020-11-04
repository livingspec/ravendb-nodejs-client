import { QueryResultBase } from "./QueryResultBase";

export interface QueryResultHighlightings { 
    [key: string]: { [key: string]: string[] };
} 

export interface QueryResultExplanations {
    [key: string]: string[];
}

export class GenericQueryResult<TResult, TIncludes> extends QueryResultBase<TResult, TIncludes> {

    public TotalResults: number;

    /**
     *  The total results for the query, taking into account the
     *  offset / limit clauses for this query
     */
    public CappedMaxResults: number;
    public SkippedResults: number;
    public Highlightings: QueryResultHighlightings;
    public Explanations: QueryResultExplanations;
    public DurationInMs: number;
    public ScoreExplanations: { [key: string]: string };
    public TimingsInMs: { [key: string]: number };
    /**
     * @deprecated ResultSize is not supported anymore. Will be removed in next major version of the product.
     */
    public ResultSize: number;
}
