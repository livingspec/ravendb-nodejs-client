import { DatabaseStatistics } from "./DatabaseStatistics";

export interface DetailedDatabaseStatistics extends DatabaseStatistics {
    CountOfIdentities: number;
    CountOfCompareExchange: number;
    CountOfCompareExchangeTombstones: number;
}
