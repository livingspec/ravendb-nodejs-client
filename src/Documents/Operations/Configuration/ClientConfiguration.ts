import { ReadBalanceBehavior } from "../../../Http/ReadBalanceBehavior";

export interface ClientConfiguration {
    Etag?: number;
    Disabled?: boolean;
    MaxNumberOfRequestsPerSession?: number;
    ReadBalanceBehavior?: ReadBalanceBehavior;
}
