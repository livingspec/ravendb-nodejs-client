import { AggregationOperation, AutoFieldIndexing, FieldStorage, GroupByArrayBehavior } from "./Enums";
import { AutoSpatialOptions } from "./Spatial/AutoSpatialOptions";

export interface AutoIndexFieldOptions {
    Storage: FieldStorage;
    Indexing: AutoFieldIndexing;
    Aggregation: AggregationOperation;
    Spatial: AutoSpatialOptions;
    GroupByArrayBehavior: GroupByArrayBehavior;
    Suggestions: boolean;
    IsNameQuoted: boolean;
}