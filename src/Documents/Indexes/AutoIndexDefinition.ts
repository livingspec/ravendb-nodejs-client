import { IndexPriority, IndexState, IndexType } from "./Enums";
import { AutoIndexFieldOptions } from "./AutoIndexFieldOptions";


export interface AutoIndexDefinition {
    Type: IndexType;
    Name: string;
    Priority: IndexPriority;
    State: IndexState;
    Collection: string;
    MapFields: Record<string, AutoIndexFieldOptions>;
    GroupByFields: Record<string, AutoIndexFieldOptions>;
}