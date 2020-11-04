import { QueryResult } from "../QueryResult";

export class QueryTimings {
    public DurationInMs: number;
    public Timings: { [key: string]: QueryTimings };

    public update(queryResult: QueryResult): void {
        this.DurationInMs = 0;
        this.Timings = null;
        if (!queryResult.Timings) {
            return;
        }

        this.DurationInMs = queryResult.Timings.DurationInMs;
        this.Timings = queryResult.Timings.Timings;
    }
}
